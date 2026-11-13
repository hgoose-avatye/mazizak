import { AudioEngine } from '../core/audio';

/**
 * Dev-only A/B for a local keyboard preset: A = the previous sprite (kept as <id>.orig by the cleaning script), B = the current one.
 * Pads play a FIXED clip each, paired by source file, so A and B are compared clip for clip. Same engine and +6 dB makeup as the app.
 */
type Entry = { offset: number; duration: number; src: string; qc?: Record<string, number> };
type Sprite = { entries: { down: Entry[] }; processing?: { excluded?: { src: string; reason: string }[] } };
const ID = 'silent-peach-v3';
const audio = new AudioEngine(32);
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const status = $('#status');
let side: 'A' | 'B' = 'A';
const clips: Record<'A' | 'B', Map<string, string>> = { A: new Map(), B: new Map() }; // src → engine name
const loaded: Partial<Record<'A' | 'B', Sprite>> = {};
for (const type of ['pointerdown', 'keydown', 'click']) window.addEventListener(type, (e) => audio.unlock(e), { capture: true });

async function load(v: 'A' | 'B', file: string) {
  const [meta, wav] = await Promise.all([
    fetch(`/__local-keyboard/${file}.json`).then((r) => { if (!r.ok) throw new Error(`${file}.json ${r.status}`); return r.json() as Promise<Sprite>; }),
    fetch(`/__local-keyboard/${file}.wav`).then((r) => { if (!r.ok) throw new Error(`${file}.wav ${r.status}`); return r.arrayBuffer(); }),
  ]);
  const buf = await audio.ctx.decodeAudioData(wav);
  const ch = buf.getChannelData(0);
  for (const [i, e] of meta.entries.down.entries()) {
    const a = Math.round(e.offset * buf.sampleRate), n = Math.max(1, Math.round(e.duration * buf.sampleRate));
    const out = audio.ctx.createBuffer(1, n, buf.sampleRate);
    out.getChannelData(0).set(ch.subarray(a, a + n));
    const name = `ab:${v}:${i}`;
    audio.register(name, [out]);
    clips[v].set(e.src, name);
  }
  loaded[v] = meta;
}
const srcs = () => [...clips.A.keys()].sort((p, q) => Number(p.match(/(\d+)\.ogg$/)?.[1]) - Number(q.match(/(\d+)\.ogg$/)?.[1]));
function hit(src: string, v = side) {
  const name = clips[v].get(src);
  if (!name) { status.textContent = `${v}: ${src.split('/').pop()} 은 정리본에서 제외된 클립입니다 (무음)`; return; }
  audio.play(name, { gainDb: 6 }, 'keydown');
}
function setSide(v: 'A' | 'B') {
  side = v;
  $('#vA').setAttribute('aria-pressed', String(v === 'A'));
  $('#vB').setAttribute('aria-pressed', String(v === 'B'));
  status.textContent = v === 'A' ? 'A: 이전 복숭아(Peach V3)' : 'B: 히스 정리본';
}
$('#vA').onclick = () => setSide('A');
$('#vB').onclick = () => setSide('B');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
$<HTMLButtonElement>('#alt').onclick = async () => {
  const pattern = srcs().filter((s) => clips.B.has(s)).slice(0, 8);
  for (const v of ['A', 'B', 'A', 'B'] as const) {
    setSide(v);
    for (const s of pattern) { hit(s, v); await wait(260); }
    await wait(600);
  }
};
$<HTMLButtonElement>('#rapid').onclick = async () => {
  const pool = srcs().filter((s) => clips[side].has(s));
  for (let i = 0; i < 16; i++) { hit(pool[i % pool.length]); await wait(85); }
};

(async () => {
  try {
    await Promise.all([load('A', `${ID}.orig`), load('B', ID)]);
  } catch (e) {
    status.textContent = `불러오기 실패: ${String(e)} — 개발 서버를 MANZIZAK_LOCAL_AUDIO_DIR 로 띄우고 clean-peach-v3.mjs 를 먼저 실행하세요.`;
    return;
  }
  const keys = 'asdfjkl;';
  const pads = $('#pads');
  srcs().forEach((src, i) => {
    const b = document.createElement('button');
    b.textContent = `#${src.match(/(\d+)\.ogg$/)?.[1]}${i < keys.length ? ` (${keys[i].toUpperCase()})` : ''}${clips.B.has(src) ? '' : ' · B 제외'}`;
    b.onpointerdown = () => hit(src);
    pads.append(b);
  });
  window.addEventListener('keydown', (e) => { if (e.repeat) return; const i = keys.indexOf(e.key.toLowerCase()); if (i >= 0 && srcs()[i]) hit(srcs()[i]); });
  const rows = srcs().map((src) => {
    const q = loaded.B!.entries.down.find((e) => e.src === src)?.qc;
    const ex = loaded.B!.processing?.excluded?.find((e) => e.src === src);
    return `<tr><td>${src.split('/').pop()}</td><td>${q ? q.origLenMs : '—'}</td><td>${q ? q.lenMs : '제외'}</td><td>${q ? q.leadSilenceRemovedMs : '—'}</td><td>${q ? q.snrDb : ex ? ex.reason : ''}</td></tr>`;
  });
  $('#table').innerHTML = `<table><tr><th>원본</th><th>A 길이 ms</th><th>B 길이 ms</th><th>앞 무음 제거 ms</th><th>타건 대비 히스 dB</th></tr>${rows.join('')}</table>`;
  for (const id of ['#alt', '#rapid']) $<HTMLButtonElement>(id).disabled = false;
  setSide('A');
})();
