/** Dev-only: listen to licensed stand-in candidates next to the original reference clips (same peak level). */
type ClipInfo = { t: number; dur: number; snr: number; cen: number; rises: number; flags: string[] };
type Cand = { toy: string; id: string; title: string; author: string; license: string; page: string; why: string; clips: string[]; auto?: boolean; clipInfo?: ClipInfo[] };
const LABEL: Record<string, string> = { butter: '청사과', cake: '초콜릿', completed: '왁스 완성(공통)', soda: '비누', clover: '레인보우' };
/** wax-ball stages: adopted clips next to new candidates from the same videos (scripts/fidgets/more-wax-candidates.py) */
const STAGES: Record<string, string> = {
  chocoinit: '초콜릿 · 처음 깰 때', chocosecond: '초콜릿 · 깨고 나서 두 번째 클릭', appleinit: '청사과 · 처음 깰 때 / 거의 다 깨졌을 때',
  crack: '공통 · 깨지고 있을 때', appleafter: '청사과 · 깨진 뒤 누를 때', chococrumbs: '초콜릿 · 깨진 조각 누를 때', mixed: '공통 · 다 깨고 섞였을 때',
};
const ORIGINAL: Record<string, { folder: string; match?: RegExp }> = {
  butter: { folder: 'wak/butter' }, cake: { folder: 'wak/cake' }, completed: { folder: 'wak/common', match: /^completed_/ },
  soda: { folder: 'crunch/soda' }, clover: { folder: 'crunch/clover' },
};
/**
 * Round 3 (scripts/fidgets/candidates-r3.py): per toy, the clips the app plays NOW (sliced from the shipped sprites, so exactly what ships)
 * and the candidates. Nothing here changes what the app plays; the owner picks, then a build step swaps the pool.
 * `legacy` = candidates that were already in the index under an older key (S01's guma set).
 */
type Current = { label: string; sprite: string; pool: string; from?: number; to?: number; cls?: string };
const ROUND3: { id: string; title: string; legacy?: string; ref?: string; note: string; current: Current[] }[] = [
  { id: 'S01', title: 'S01 슬랑이', legacy: 'guma', note: '이미 받아 둔 CC0 후보 5개(클립 20개). 갈색 = 참고용 원본(내 컴퓨터에서만).', current: [
    { label: '현재 탭', sprite: 'squish', pool: 'tpr.tap' }, { label: '현재 홀드', sprite: 'squish', pool: 'tpr.hold' }] },
  { id: 'L02', title: 'L02 망고', note: '자글자글한 크런치 슬라임 후보(1.0초 창, 노이즈 저감 적용). 새 CC0 소스.', current: [
    { label: '현재 탭', sprite: 'squish', pool: 'mango.tap' }, { label: '현재 홀드', sprite: 'squish', pool: 'mango.hold' }] },
  { id: 'L03', title: 'L03 휘핑크림', note: '현재는 면도크림 녹음 2개에서만 나옴. 쓰이지 않던 녹음 + 새 CC0 휘핑크림/면도크림 후보(0.6초 창).', current: [
    { label: '현재 누르기', sprite: 'squish', pool: 'cream.hold' }, { label: '현재 접기', sprite: 'squish', pool: 'cream.fold' }] },
  { id: 'C02', title: 'C02 레인보우', note: '크런치 풀: 직접 고른 8개와 같은 영상에서 자동으로 뽑은 17개(미청취)를 따로 들을 수 있음. 17개는 현재 작업 브랜치 기본값에 들어 있음(미병합).', current: [
    { label: '기존 채택', sprite: 'picks', pool: 'beads.crunch', from: 0, to: 8 },
    { label: '신규 자동(미청취)', sprite: 'picks', pool: 'beads.crunch', from: 8, cls: 'auto' },
    { label: '홀드(현재)', sprite: 'picks', pool: 'beads.hold' }] },
  { id: 'W02', title: 'W02 초콜릿 · 깨진 조각(crumbs)', note: '현재 채택 3개가 반복됨. 같은 원본 영상에서 아직 보여 주지 않은 구간을 추가로 자동 추출(채택 3개·이전 후보 10개 제외).', current: [
    { label: '현재 채택', sprite: 'picks', pool: 'choco.crumbs' }] },
];
const ctx = new AudioContext();
const out = document.querySelector<HTMLElement>('#out')!, statusEl = document.querySelector<HTMLElement>('#status')!;
const level = (d: Float32Array): AudioBuffer => {
  let pk = 1e-9; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
  const o = ctx.createBuffer(1, d.length, ctx.sampleRate), y = o.getChannelData(0), k = Math.min(8, 0.5 / pk);
  for (let i = 0; i < d.length; i++) y[i] = d[i] * k;
  return o;
};
const cache = new Map<string, Promise<AudioBuffer>>();
const load = (url: string) => {
  let p = cache.get(url);
  if (!p) cache.set(url, p = fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return level((await ctx.decodeAudioData(await r.arrayBuffer())).getChannelData(0));
  }));
  return p;
};
/** the shipped sprites (public/sfx/fidgets/<name>.{json,wav}); clips are addressed in seconds because decodeAudioData resamples */
type SpriteEntry = { offset: number; duration: number; srcStart?: number; src?: string };
type Sprite = { json: { pools: Record<string, { entries: SpriteEntry[] }> }; buf: AudioBuffer };
const sprites = new Map<string, Promise<Sprite>>();
const sprite = (name: string) => {
  let p = sprites.get(name);
  if (!p) sprites.set(name, p = (async () => {
    const [json, wav] = await Promise.all([fetch(`/sfx/fidgets/${name}.json`).then((r) => r.json()), fetch(`/sfx/fidgets/${name}.wav`).then((r) => r.arrayBuffer())]);
    return { json, buf: await ctx.decodeAudioData(wav) };
  })());
  return p;
};
const spriteClip = async (name: string, pool: string, i: number) => {
  const { json, buf } = await sprite(name), e = json.pools[pool].entries[i], sr = buf.sampleRate, a = Math.round(e.offset * sr);
  return level(buf.getChannelData(0).slice(a, a + Math.round(e.duration * sr)));
};
let playing: AudioBufferSourceNode | undefined;
const play = async (buffer: Promise<AudioBuffer>) => {
  await ctx.resume(); playing?.stop();
  const s = ctx.createBufferSource(); s.buffer = await buffer; s.connect(ctx.destination); s.start(); playing = s;
};
const btn = (label: string, buffer: () => Promise<AudioBuffer>, cls = '', tip = '') => {
  const b = document.createElement('button'); b.textContent = label; b.className = cls; if (tip) b.title = tip;
  b.onclick = () => play(buffer()).catch((e) => { statusEl.textContent = String(e); });
  return b;
};
const urlBtn = (label: string, url: string, cls = '', tip = '') => btn(label, () => load(url), cls, tip);
const tipOf = (i?: ClipInfo) => i ? `원본 ${i.t}s · ${i.dur}s · 신호/잡음 ${i.snr} dB · 중심 ${i.cen} Hz · 미세 타격 ${i.rises}/s${i.flags.length ? ' · 주의: ' + i.flags.join(', ') : ''}` : '';
(async () => {
  let index: Cand[];
  try { const r = await fetch('/__candidates/index.json'); if (!r.ok) throw new Error(String(r.status)); index = await r.json(); }
  catch (e) { statusEl.textContent = `후보 목록을 불러오지 못했습니다 (${e}). 개발 서버에서 ~/Music/MANZIZAK/dev-reference/candidates 가 있어야 합니다.`; return; }
  let orig: Record<string, string[]> = {};
  try { orig = await (await fetch('/__original-wak/index.json')).json(); } catch { /* originals are optional */ }
  const summary: string[] = [];
  // ── round 3: S01 / L02 / L03 / C02 / W02 ──
  for (const g of ROUND3) {
    const cands = index.filter((c) => c.toy === (g.legacy ?? `r3:${g.id}`));
    const nClips = cands.reduce((n, c) => n + c.clips.length, 0);
    const sec = document.createElement('section'); sec.id = `r3-${g.id}`;
    const h = document.createElement('h2'); h.textContent = g.title; sec.append(h);
    const note = document.createElement('small'); note.className = 'note2'; note.textContent = g.note; sec.append(note);
    let nCur = 0, nAuto = 0;
    for (const c of g.current) {
      const { json } = await sprite(c.sprite), n = json.pools[c.pool]?.entries.length ?? 0, to = Math.min(c.to ?? n, n);
      const row = document.createElement('div'); row.className = 'row';
      for (let i = c.from ?? 0; i < to; i++) {
        const e = json.pools[c.pool].entries[i];
        row.append(btn(`${c.label} ${i - (c.from ?? 0) + 1}`, () => spriteClip(c.sprite, c.pool, i), c.cls ?? 'cur', `${c.sprite}/${c.pool}#${i}${e.srcStart !== undefined ? ` · 원본 ${e.srcStart}s` : ''}`));
        if (c.cls === 'auto') nAuto++; else nCur++;
      }
      if (row.childElementCount) sec.append(row);
    }
    if (g.legacy) {
      const o = ORIGINAL.guma ?? { folder: 'crunch/guma' }, files = orig[o.folder] ?? [];
      if (files.length) { const row = document.createElement('div'); row.className = 'row'; files.slice(0, 6).forEach((f, i) => row.append(urlBtn(`원본 ${i + 1}`, `/__original-wak/${o.folder}/${f}`, 'orig'))); sec.append(row); }
    }
    for (const c of cands) {
      const d = document.createElement('div'); d.className = 'cand' + (c.auto ? ' autoc' : '');
      d.innerHTML = '<b></b><small></small>'; d.querySelector('b')!.textContent = `${c.title} (${c.id})`;
      d.querySelector('small')!.innerHTML = `${c.author} · ${c.license}${c.page ? ` · <a target="_blank" rel="noopener" href="${c.page}">페이지</a>` : ''}`;
      if (c.auto) { const w = document.createElement('small'); w.textContent = c.why; d.append(w); }
      const row = document.createElement('div'); row.className = 'row';
      c.clips.forEach((f, i) => { const inf = c.clipInfo?.[i]; row.append(urlBtn(`#${i + 1}`, `/__candidates/${f}`, inf?.flags.length ? 'warn' : '', tipOf(inf))); });
      d.append(row); sec.append(d);
    }
    const nSrc = cands.length + (nAuto ? 1 : 0), nAll = nClips + nAuto; // C02: the 17 auto-picked clips come from the same video as the 8 adopted ones
    h.textContent = `${g.title} — 후보 ${nSrc}개 · 클립 ${nAll}개 (현재 적용 ${nCur}개)`;
    summary.push(`${g.id} 후보 ${nSrc}/클립 ${nAll}`);
    out.append(sec);
  }
  for (const [stage, label] of Object.entries(STAGES)) {
    const list = index.filter((c) => c.toy === `stage:${stage}`);
    if (!list.length) continue;
    const sec = document.createElement('section'); sec.innerHTML = `<h2>왁뿌볼 단계 — ${label}</h2>`;
    for (const c of list.sort((a, b) => Number(b.id.startsWith('adopted-')) - Number(a.id.startsWith('adopted-')))) {
      const d = document.createElement('div'); d.className = 'cand' + (c.id.startsWith('adopted-') ? ' adopted' : '');
      d.innerHTML = `<b></b><small></small>`; d.querySelector('b')!.textContent = c.title; d.querySelector('small')!.textContent = c.why;
      const row = document.createElement('div'); row.className = 'row';
      c.clips.forEach((f, i) => row.append(urlBtn(`${c.id.startsWith('adopted-') ? '채택' : '신규'} ${i + 1}`, `/__candidates/${f}`, c.id.startsWith('adopted-') ? 'orig' : '')));
      d.append(row); sec.append(d);
    }
    out.append(sec);
  }
  for (const toy of Object.keys(LABEL)) {
    const sec = document.createElement('section'); sec.innerHTML = `<h2>${LABEL[toy]}</h2>`;
    const o = ORIGINAL[toy], files = (orig[o.folder] ?? []).filter((f) => !o.match || o.match.test(f)).slice(0, 6);
    if (files.length) { const row = document.createElement('div'); row.className = 'row'; files.forEach((f, i) => row.append(urlBtn(`원본 ${i + 1}`, `/__original-wak/${o.folder}/${f}`, 'orig'))); sec.append(row); }
    for (const c of index.filter((c) => c.toy === toy).sort((a, b) => Number(b.id.startsWith('yt-')) - Number(a.id.startsWith('yt-')))) {
      const d = document.createElement('div'); d.className = 'cand';
      d.innerHTML = `<b></b><small></small>`; d.querySelector('b')!.textContent = `${c.title} (${c.id})`;
      d.querySelector('small')!.innerHTML = `${c.author} · ${c.license} · <a target="_blank" rel="noopener" href="${c.page}">페이지</a>`;
      const row = document.createElement('div'); row.className = 'row'; c.clips.forEach((f, i) => row.append(urlBtn(`#${i + 1}`, `/__candidates/${f}`))); d.append(row); sec.append(d);
    }
    out.append(sec);
  }
  statusEl.textContent = `3차: ${summary.join(' · ')} — 전체 후보 ${index.length}개, 클립 ${index.reduce((n, c) => n + c.clips.length, 0)}개`;
})();
