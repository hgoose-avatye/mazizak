import '../style.css';
import { AudioEngine } from '../core/audio';
import { loadKeyboardSamples } from '../audio/keyboardSamples';
import type { KeyPresetId } from '../audio/keyPresets';
import type { KeyboardSounds } from '../audio/sfx';

/**
 * Dev listening page: pebble / clack / creamy-thocky side by side, played through the same engine path and
 * parameters as the keyboard toy, plus per-clip audition of the 5 creamy-thocky source clips.
 * It only PLAYS sounds and records the listener's notes — it never changes any preset, map or mapping.
 */
const PRESETS: { id: KeyPresetId; label: string }[] = [
  { id: 'pebble', label: '조약돌' },
  { id: 'clack', label: '얼음' },
  { id: 'creamy-thocky', label: '크림' },
];
const CLIP_NAMES = ['OtherKeys', '2', 'BackSpace', 'Shift', 'Space']; // = order of entries.down in creamy-thocky.json
const SRC_DIR = './scripts/kbsamples/source/creamy-thocky/';
const STORE = 'mzk-creamy-listen-v1';

const audio = new AudioEngine(32);
for (const t of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(t, (e) => audio.unlock(e), { capture: true, passive: true });
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const statusEl = $('#status');
const loaded = new Map<KeyPresetId, KeyboardSounds>();
const failed = new Map<KeyPresetId, string>();

const trimDb: Record<string, number> = {};
// same parameters as the keyboard toy (recorded samples: +6 dB makeup, detune 12/10 cents)
const paramsFor = (_id: KeyPresetId, up: boolean) => ({ detuneCents: up ? 10 : 12, gainJitterDb: up ? 1 : 1.2, gainDb: 6 });

const keyDetune = (i: number) => ((i * 37) % 31) - 15; // same per-key offsets as the keyboard toy
const NORMAL_KEY = 4;
const SPACE_KEY = 9;

// ---------- app-equivalent playback ----------
function playDown(id: KeyPresetId, space: boolean, rapid: boolean): void {
  const q = paramsFor(id, false);
  audio.play(`lk:${id}:${space ? 'spaceDown' : 'down'}`, { baseDetune: keyDetune(space ? SPACE_KEY : NORMAL_KEY), detuneCents: q.detuneCents, gainJitterDb: q.gainJitterDb, gainDb: q.gainDb + (trimDb[id] ?? 0) + (rapid ? -2 : 0) }, 'lab');
}
function playUp(id: KeyPresetId, space: boolean): void {
  const q = paramsFor(id, true);
  audio.play(`lk:${id}:${space ? 'spaceUp' : 'up'}`, { baseDetune: keyDetune(space ? SPACE_KEY : NORMAL_KEY), detuneCents: q.detuneCents, gainJitterDb: q.gainJitterDb, gainDb: q.gainDb + (trimDb[id] ?? 0) }, 'lab');
}

function refreshStatus(): void {
  const parts = PRESETS.map((p) => `${p.label}: ${loaded.has(p.id) ? '로드됨' : failed.has(p.id) ? `실패(${failed.get(p.id)})` : '로딩…'}`);
  statusEl.textContent = `${parts.join(' · ')} · AudioContext ${audio.ctx.state} ${audio.ctx.sampleRate} Hz — 첫 터치에서 소리가 안 나면 한 번 더 눌러 보세요.`;
}

// ---------- section 1: pads ----------
type PadKind = 'key' | 'space' | 'burst';
function makePad(id: KeyPresetId, kind: PadKind, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `pad ${kind === 'burst' ? 'burst' : kind === 'space' ? 'space' : ''}`;
  b.textContent = label;
  let held = false;
  let timer = 0;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    held = true;
    b.classList.add('on');
    if (kind === 'burst') {
      const tick = () => {
        playDown(id, false, true);
        window.setTimeout(() => playUp(id, false), 45);
      };
      tick();
      timer = window.setInterval(tick, 90); // ≈ 11 keystrokes / s while held
    } else playDown(id, kind === 'space', false);
  });
  const end = () => {
    if (!held) return;
    held = false;
    b.classList.remove('on');
    window.clearInterval(timer);
    if (kind !== 'burst') playUp(id, kind === 'space');
  };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, end);
  return b;
}
const padsEl = $('#pads');
for (const p of PRESETS) {
  const col = document.createElement('div');
  col.className = 'col';
  col.innerHTML = `<h3>${p.label}</h3>`;
  col.append(makePad(p.id, 'key', '일반 키'), makePad(p.id, 'space', '스페이스바'), makePad(p.id, 'burst', '연타 (누르고 있기)'));
  const note = document.createElement('small');
  note.textContent = p.id === 'creamy-thocky' ? '키업 소리 없음(키다운 클립만)' : '키다운 + 키업';
  col.append(note);
  const trim = document.createElement('input');
  trim.type = 'range'; trim.min = '-12'; trim.max = '12'; trim.step = '1'; trim.value = '0';
  const tv = document.createElement('small');
  tv.textContent = '음량 보정 0 dB';
  trim.oninput = () => { trimDb[p.id] = +trim.value; tv.textContent = `음량 보정 ${trim.value} dB`; };
  col.append(document.createElement('br'), tv, trim);
  padsEl.append(col);
}

const nowEl = $('#now');
let seqToken = 0;
async function sequence(run: (id: KeyPresetId) => Promise<void>): Promise<void> {
  const token = ++seqToken;
  for (const p of PRESETS) {
    if (token !== seqToken) return;
    nowEl.textContent = `지금: ${p.label}`;
    await run(p.id);
    await new Promise((r) => setTimeout(r, 700));
  }
  nowEl.textContent = '';
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
$('#seq-key').onclick = () => void sequence(async (id) => { for (let i = 0; i < 3; i++) { playDown(id, false, false); await sleep(80); playUp(id, false); await sleep(380); } });
$('#seq-space').onclick = () => void sequence(async (id) => { for (let i = 0; i < 2; i++) { playDown(id, true, false); await sleep(120); playUp(id, true); await sleep(500); } });
$('#seq-burst').onclick = () => void sequence(async (id) => { for (let i = 0; i < 10; i++) { playDown(id, false, true); window.setTimeout(() => playUp(id, false), 45); await sleep(90); } });

// physical keyboard → selected preset
let target: KeyPresetId = 'pebble';
const tgt = $('#kbtarget');
for (const p of PRESETS) {
  const b = document.createElement('button');
  b.textContent = p.label;
  b.setAttribute('aria-pressed', String(p.id === target));
  b.onclick = () => {
    target = p.id;
    tgt.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    b.blur();
  };
  tgt.append(b);
}
const heldKeys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || document.activeElement instanceof HTMLButtonElement || document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement) return;
  if (e.code !== 'Space' && !/^(Key|Digit)/.test(e.code)) return;
  e.preventDefault();
  heldKeys.add(e.code);
  playDown(target, e.code === 'Space', false);
});
window.addEventListener('keyup', (e) => {
  if (!heldKeys.delete(e.code)) return;
  playUp(target, e.code === 'Space');
});

// ---------- section 2: creamy clips ----------
interface Clip { name: string; processed: AudioBuffer; original?: AudioBuffer; originalErr?: string }
const clips: Clip[] = [];
let activeSrc: AudioBufferSourceNode | null = null;

/** direct playback (no jitter, no limiter): constant gain, optional offset/duration/rate */
function playDirect(buf: AudioBuffer, o: { offsetMs?: number; durMs?: number; rate?: number; gain?: number } = {}): void {
  const go = () => {
    try { activeSrc?.stop(); } catch { /* already stopped */ }
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    const g = audio.ctx.createGain();
    g.gain.value = o.gain ?? 0.8;
    src.connect(g).connect(audio.ctx.destination);
    const off = (o.offsetMs ?? 0) / 1000;
    if (o.durMs !== undefined) src.start(0, off, o.durMs / 1000);
    else src.start(0, off);
    activeSrc = src;
  };
  if (audio.ctx.state === 'running') go();
  else void audio.ctx.resume().then(go);
}
const peakOf = (b: AudioBuffer) => b.getChannelData(0).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const dbOf = (v: number) => (20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
function amplified(b: AudioBuffer): AudioBuffer {
  const out = audio.ctx.createBuffer(1, b.length, b.sampleRate);
  const k = Math.pow(10, -1 / 20) / Math.max(peakOf(b), 1e-9);
  const s = b.getChannelData(0);
  const d = out.getChannelData(0);
  for (let i = 0; i < s.length; i++) d[i] = s[i] * k;
  return out;
}
function drawWave(cv: HTMLCanvasElement, b: AudioBuffer, from: number, to: number): void {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = (cv.width = Math.round(cv.clientWidth * dpr));
  const h = (cv.height = Math.round(cv.clientHeight * dpr));
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, w, h);
  const ms = b.duration * 1000;
  c.fillStyle = '#2a272422';
  c.fillRect((from / ms) * w, 0, ((to - from) / ms) * w, h);
  const d = b.getChannelData(0);
  const pk = Math.max(peakOf(b), 1e-9);
  c.fillStyle = '#2a2724';
  const step = Math.max(1, Math.floor(d.length / w));
  for (let x = 0; x < w; x++) {
    let m = 0;
    for (let i = x * step; i < Math.min(d.length, (x + 1) * step); i++) m = Math.max(m, Math.abs(d[i]));
    const hh = (m / pk) * (h / 2);
    c.fillRect(x, h / 2 - hh, 1, Math.max(1, hh * 2));
  }
}

function buildClipUi(): void {
  const host = $('#clips');
  host.textContent = '';
  clips.forEach((clip) => {
    const ms = Math.round(clip.processed.duration * 1000);
    const el = document.createElement('div');
    el.className = 'clip';
    el.innerHTML = `<h3>${clip.name}.ogg <small>처리본 ${ms} ms · 피크 ${dbOf(peakOf(clip.processed))} dBFS${clip.original ? ` · 원본 ${Math.round(clip.original.duration * 1000)} ms · 피크 ${dbOf(peakOf(clip.original))} dBFS` : clip.originalErr ? ` · 원본 OGG 불러오기 실패(${clip.originalErr})` : ''}</small></h3>
      <canvas></canvas>
      <div class="row"><button data-a="proc">▶ 처리본</button><button data-a="orig">▶ 원본 OGG</button><button data-a="amp">▶ 원본 +증폭</button>
        <select data-a="rate"><option value="1">1×</option><option value="0.5">0.5×</option><option value="0.25">0.25×</option></select></div>
      <div class="row"><small>구간 시작</small><input type="range" data-a="from" min="0" max="${ms}" value="0" /><small data-a="fromv">0 ms</small></div>
      <div class="row"><small>구간 끝</small><input type="range" data-a="to" min="0" max="${ms}" value="${ms}" /><small data-a="tov">${ms} ms</small><button data-a="seg">▶ 구간(처리본)</button></div>`;
    host.append(el);
    const cv = el.querySelector('canvas')!;
    const q = <T extends HTMLElement>(a: string) => el.querySelector(`[data-a="${a}"]`) as T;
    const from = q<HTMLInputElement>('from');
    const to = q<HTMLInputElement>('to');
    const rate = () => +q<HTMLSelectElement>('rate').value;
    const redraw = () => {
      q('fromv').textContent = `${from.value} ms`;
      q('tov').textContent = `${to.value} ms`;
      drawWave(cv, clip.processed, +from.value, +to.value);
    };
    from.oninput = redraw;
    to.oninput = redraw;
    requestAnimationFrame(redraw);
    q('proc').onclick = () => playDirect(clip.processed, { rate: rate() });
    q('orig').onclick = () => (clip.original ? playDirect(clip.original, { rate: rate() }) : undefined);
    q('amp').onclick = () => (clip.original ? playDirect(amplified(clip.original), { rate: rate() }) : undefined);
    q('seg').onclick = () => playDirect(clip.processed, { offsetMs: +from.value, durMs: Math.max(5, +to.value - +from.value), rate: rate() });
  });
}

// ---------- section 3: notes ----------
const CLIP_VERDICTS = ['미판정', '일반 키다운 1타', '키다운+키업이 한 클립에 들어 있음', '스페이스바 소리 같음', 'Shift·큰 키 소리 같음', '잡음·끊김 있음', '기타(메모)'];
const PRESET_VERDICTS = ['미판정', '좋음', '보통', '별로', '다른 프리셋과 구분 어려움'];
type Notes = Record<string, { verdict: string; text: string }>;
let notes: Notes = (() => { try { return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Notes; } catch { return {}; } })();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(notes)); } catch { /* storage unavailable */ } };
const outEl = $('#out');
function showOut(): void {
  outEl.textContent = JSON.stringify({ at: new Date().toISOString(), device: navigator.userAgent, sampleRate: audio.ctx.sampleRate, notes }, null, 1);
}
function noteRow(key: string, title: string, verdicts: string[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';
  const sel = document.createElement('select');
  verdicts.forEach((v) => sel.add(new Option(v, v)));
  sel.value = notes[key]?.verdict ?? verdicts[0];
  const txt = document.createElement('input');
  txt.type = 'text';
  txt.placeholder = '메모';
  txt.value = notes[key]?.text ?? '';
  const upd = () => { notes[key] = { verdict: sel.value, text: txt.value }; save(); showOut(); };
  sel.onchange = upd;
  txt.oninput = upd;
  const lab = document.createElement('b');
  lab.textContent = title;
  lab.style.minWidth = '96px';
  row.append(lab, sel, txt);
  return row;
}
const notesEl = $('#notes');
for (const p of PRESETS) notesEl.append(noteRow(`preset:${p.id}`, p.label, PRESET_VERDICTS));
for (const n of CLIP_NAMES) notesEl.append(noteRow(`clip:${n}`, `${n}.ogg`, CLIP_VERDICTS));
$('#copy').onclick = async () => { showOut(); try { await navigator.clipboard.writeText(outEl.textContent ?? ''); (document.querySelector('#copy') as HTMLElement).textContent = '복사됨'; } catch { /* select the text manually */ } };
$('#clear').onclick = () => { notes = {}; save(); location.reload(); };
showOut();

// ---------- load ----------
void (async () => {
  refreshStatus();
  await Promise.all(
    PRESETS.map(async (p) => {
      try {
        const s = await loadKeyboardSamples(audio.ctx, p.id);
        loaded.set(p.id, s);
        for (const role of ['down', 'up', 'spaceDown', 'spaceUp'] as const) if (s[role].length) audio.register(`lk:${p.id}:${role}`, s[role]);
        if (p.id === 'creamy-thocky') s.down.forEach((b, i) => clips.push({ name: CLIP_NAMES[i] ?? `clip${i}`, processed: b }));
      } catch (err) {
        failed.set(p.id, String(err instanceof Error ? err.message : err));
      }
      refreshStatus();
    }),
  );
  // originals (dev server only): decode each OGG with the page's AudioContext
  await Promise.all(
    clips.map(async (c) => {
      try {
        const r = await fetch(`${SRC_DIR}${c.name}.ogg`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        c.original = await audio.ctx.decodeAudioData(await r.arrayBuffer());
      } catch (err) {
        c.originalErr = String(err instanceof Error ? err.message : err);
      }
    }),
  );
  buildClipUi();
  refreshStatus();
})();
