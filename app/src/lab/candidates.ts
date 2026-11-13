/** Dev-only: listen to licensed stand-in candidates next to the original reference clips (same loudness). */
type Cand = { toy: string; id: string; title: string; author: string; license: string; page: string; why: string; clips: string[] };
const LABEL: Record<string, string> = { butter: '청사과', cake: '초콜릿', completed: '왁스 완성(공통)', soda: '비누', clover: '레인보우', guma: '슬랑이' };
const ORIGINAL: Record<string, { folder: string; match?: RegExp }> = {
  butter: { folder: 'wak/butter' }, cake: { folder: 'wak/cake' }, completed: { folder: 'wak/common', match: /^completed_/ },
  soda: { folder: 'crunch/soda' }, clover: { folder: 'crunch/clover' }, guma: { folder: 'crunch/guma' },
};
const ctx = new AudioContext();
const out = document.querySelector<HTMLElement>('#out')!, statusEl = document.querySelector<HTMLElement>('#status')!;
const cache = new Map<string, Promise<AudioBuffer>>();
const load = (url: string) => {
  let p = cache.get(url);
  if (!p) cache.set(url, p = fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    const b = await ctx.decodeAudioData(await r.arrayBuffer());
    const d = b.getChannelData(0); let pk = 1e-9; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    const o = ctx.createBuffer(1, b.length, b.sampleRate), y = o.getChannelData(0), k = Math.min(8, 0.5 / pk);
    for (let i = 0; i < d.length; i++) y[i] = d[i] * k;
    return o;
  }));
  return p;
};
let playing: AudioBufferSourceNode | undefined;
const play = async (url: string) => {
  await ctx.resume(); playing?.stop();
  const s = ctx.createBufferSource(); s.buffer = await load(url); s.connect(ctx.destination); s.start(); playing = s;
};
const btn = (label: string, url: string, cls = '') => { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.onclick = () => play(url).catch((e) => { statusEl.textContent = String(e); }); return b; };
(async () => {
  let index: Cand[];
  try { const r = await fetch('/__candidates/index.json'); if (!r.ok) throw new Error(String(r.status)); index = await r.json(); }
  catch (e) { statusEl.textContent = `후보 목록을 불러오지 못했습니다 (${e}). 개발 서버에서 ~/Music/MANZIZAK/dev-reference/candidates 가 있어야 합니다.`; return; }
  let orig: Record<string, string[]> = {};
  try { orig = await (await fetch('/__original-wak/index.json')).json(); } catch { /* originals are optional */ }
  for (const toy of Object.keys(LABEL)) {
    const sec = document.createElement('section'); sec.innerHTML = `<h2>${LABEL[toy]}</h2>`;
    const o = ORIGINAL[toy], files = (orig[o.folder] ?? []).filter((f) => !o.match || o.match.test(f)).slice(0, 6);
    if (files.length) { const row = document.createElement('div'); row.className = 'row'; files.forEach((f, i) => row.append(btn(`원본 ${i + 1}`, `/__original-wak/${o.folder}/${f}`, 'orig'))); sec.append(row); }
    for (const c of index.filter((c) => c.toy === toy).sort((a, b) => Number(b.id.startsWith('yt-')) - Number(a.id.startsWith('yt-')))) {
      const d = document.createElement('div'); d.className = 'cand';
      d.innerHTML = `<b></b><small></small>`; d.querySelector('b')!.textContent = `${c.title} (${c.id})`;
      d.querySelector('small')!.innerHTML = `${c.author} · ${c.license} · <a target="_blank" rel="noopener" href="${c.page}">페이지</a>`;
      const row = document.createElement('div'); row.className = 'row'; c.clips.forEach((f, i) => row.append(btn(`#${i + 1}`, `/__candidates/${f}`))); d.append(row); sec.append(d);
    }
    out.append(sec);
  }
  statusEl.textContent = `후보 ${index.length}개, 클립 ${index.reduce((n, c) => n + c.clips.length, 0)}개`;
})();
