import '../style.css';
import { AudioEngine, type ContinuousSound } from '../core/audio';
import { buildKeyboardSounds, buildSquishySounds, type KeySwitchPreset } from '../audio/sfx';
import { loadKeyboardSamples, KEYBOARD_SAMPLE_CREDITS } from '../audio/keyboardSamples';
import { loadSquishySamples, SQUISHY_SAMPLE_CREDITS, SQUISHY_SAMPLES_ARE_RECORDED } from '../audio/squishySamples';

/**
 * Dev A/B screen: synthesized (A) vs recording-based samples (B), same engine
 * path as the app (round-robin, jitter, limiter). Blind mode swaps sides at
 * random per section and logs the listener's choice.
 */
const audio = new AudioEngine(32);
for (const t of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(t, (e) => audio.unlock(e), { capture: true, passive: true });

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const status = $('#status');
const log = $('#log');
const STORE = 'mzk-ab-votes-v1';
let blind = false;
const swapped: Record<string, boolean> = {};
const votes: { at: string; section: string; preferred: 'synth' | 'sample' | 'same' }[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '[]');
  } catch {
    return [];
  }
})();
let currentSection = '';

/** active RMS (dB) of a set: blocks within 30 dB of the loudest 10 ms block, averaged over the set */
function setRmsDb(bufs: AudioBuffer[]): number {
  const vals = bufs.map((b) => {
    const d = b.getChannelData(0);
    const n = Math.max(1, Math.floor(b.sampleRate * 0.01));
    const blocks: number[] = [];
    for (let i = 0; i + n <= d.length; i += n) {
      let e = 0;
      for (let j = i; j < i + n; j++) e += d[j] * d[j];
      blocks.push(e / n);
    }
    const mx = Math.max(...blocks, 1e-12);
    const act = blocks.filter((e) => e > mx * 1e-3);
    return 10 * Math.log10(act.reduce((a, c) => a + c, 0) / Math.max(1, act.length) + 1e-12);
  });
  return vals.reduce((a, c) => a + c, 0) / Math.max(1, vals.length);
}
const levelDb = new Map<string, number>();
/** gain applied so that A and B of the same event play at equal loudness (B unchanged) */
const matchDb = new Map<string, number>();
function register(prefix: string, name: string, bufs: AudioBuffer[]): string {
  audio.register(`${prefix}:${name}`, bufs);
  levelDb.set(`${prefix}:${name}`, setRmsDb(bufs));
  return `${prefix}:${name}`;
}
function computeMatches(): void {
  for (const [k, a] of levelDb) {
    if (!k.startsWith('A-')) continue;
    const b = levelDb.get('B-' + k.slice(2));
    if (b !== undefined) matchDb.set(k, b - a);
  }
}
/** play with loudness matching */
function pl(name: string, opts: Parameters<typeof audio.play>[1] = {}): void {
  audio.play(name, { ...opts, gainDb: (opts.gainDb ?? 0) + (matchDb.get(name) ?? 0) });
}

async function loadKeyboard(preset: KeySwitchPreset) {
  const a = buildKeyboardSounds(audio.ctx, preset);
  const b = await loadKeyboardSamples(audio.ctx, preset);
  for (const [k, v] of Object.entries(a)) register(`A-kb-${preset}`, k, v);
  for (const [k, v] of Object.entries(b)) register(`B-kb-${preset}`, k, v);
}

let loops: { A: { rub: ContinuousSound; stretch: ContinuousSound }; B: { rub: ContinuousSound; stretch: ContinuousSound } } | null = null;
async function loadSquishy() {
  const a = buildSquishySounds(audio.ctx);
  const b = await loadSquishySamples(audio.ctx);
  // nearest synthesized equivalents for each recorded category
  register('A-sq', 'touch', a.press);
  register('A-sq', 'compress', a.pressHard);
  register('A-sq', 'recover', a.release);
  register('B-sq', 'touch', b.touch);
  register('B-sq', 'compress', b.compress);
  register('B-sq', 'recover', b.recover);
  if (b.compressGel?.length) register('B-sq', 'compressGel', b.compressGel);
  loops = {
    A: { rub: audio.createLoop(a.friction), stretch: audio.createLoop(a.stretch) },
    B: { rub: audio.createLoop(b.rub), stretch: audio.createLoop(b.stretch) },
  };
}

function side(section: string, left: boolean): 'A' | 'B' {
  const sw = blind && swapped[section];
  return left !== !!sw ? 'A' : 'B';
}

function column(section: string, left: boolean, buttons: { label: string; run: (src: 'A' | 'B') => void }[]): HTMLElement {
  const col = document.createElement('div');
  col.className = 'col';
  const h = document.createElement('h3');
  const refresh = () => {
    const s = side(section, left);
    h.textContent = blind ? (left ? '왼쪽' : '오른쪽') : s === 'A' ? 'A · 합성' : 'B · 녹음';
  };
  refresh();
  col.appendChild(h);
  for (const btn of buttons) {
    const b = document.createElement('button');
    b.className = `pad ${left ? '' : 'b'}`;
    b.textContent = btn.label;
    b.addEventListener('pointerdown', () => {
      currentSection = section;
      btn.run(side(section, left));
      showVote();
    });
    col.appendChild(b);
  }
  (col as unknown as { refresh: () => void }).refresh = refresh;
  return col;
}

function typingBurst(src: 'A' | 'B', preset: string, keys = 14, cps = 9) {
  for (let i = 0; i < keys; i++) {
    const t = (i / cps) * 1000 * (0.85 + Math.random() * 0.3);
    const space = i % 6 === 5;
    setTimeout(() => pl(`${src}-kb-${preset}:${space ? 'spaceDown' : 'down'}`, { detuneCents: 20, gainJitterDb: 1.2 }), t);
    setTimeout(() => pl(`${src}-kb-${preset}:${space ? 'spaceUp' : 'up'}`, { detuneCents: 15, gainJitterDb: 1 }), t + 70 + Math.random() * 50);
  }
}

function buildKeyboardUI() {
  const grid = $('#kb');
  grid.innerHTML = '';
  const preset = ($('#preset') as HTMLSelectElement).value;
  const sec = `kb-${preset}`;
  for (const left of [true, false]) {
    grid.appendChild(
      column(sec, left, [
        { label: '키 누름 (down)', run: (s) => pl(`${s}-kb-${preset}:down`, { detuneCents: 20, gainJitterDb: 1.2 }) },
        { label: '키 뗌 (up)', run: (s) => pl(`${s}-kb-${preset}:up`, { detuneCents: 15 }) },
        { label: '스페이스', run: (s) => { pl(`${s}-kb-${preset}:spaceDown`); setTimeout(() => pl(`${s}-kb-${preset}:spaceUp`), 140); } },
        { label: '동시 5키', run: (s) => { for (let i = 0; i < 5; i++) pl(`${s}-kb-${preset}:down`, { detuneCents: 25, gainJitterDb: 1.5, pan: (i - 2) * 0.12 }); } },
        { label: '타이핑 데모', run: (s) => typingBurst(s, preset) },
      ]),
    );
  }
}

function buildSquishyUI() {
  const grid = $('#sq');
  grid.innerHTML = '';
  for (const left of [true, false]) {
    grid.appendChild(
      column('sq', left, [
        { label: '닿음 (touch)', run: (s) => pl(`${s}-sq:touch`, { detuneCents: 30, gainJitterDb: 1.5 }) },
        { label: '깊은 압축 (compress)', run: (s) => pl(`${s}-sq:compress`, { detuneCents: 25, gainJitterDb: 1.5 }) },
        { label: '문지르기 2초 (rub)', run: (s) => runLoop(s, 'rub') },
        { label: '늘리기 2초 (stretch)', run: (s) => runLoop(s, 'stretch') },
        { label: '복원 (recover)', run: (s) => pl(`${s}-sq:recover`, { gainJitterDb: 1 }) },
      ]),
    );
  }
}

function runLoop(src: 'A' | 'B', kind: 'rub' | 'stretch') {
  const l = loops?.[src][kind];
  if (!l) return;
  const t0 = performance.now();
  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    if (t > 2) {
      l.set(0, 0);
      return;
    }
    const lvl = 0.6 + 0.4 * Math.sin(t * 5);
    l.set(lvl, 0.7);
    requestAnimationFrame(tick);
  };
  tick();
}

function showVote() {
  if (!blind) return;
  $('#vote').hidden = false;
  $('#vote-q').textContent = `[${currentSection}] 어느 쪽이 더 자연스러운가요?`;
}

$('#vote').addEventListener('click', (e) => {
  const v = (e.target as HTMLElement).dataset.v as 'left' | 'right' | 'same' | undefined;
  if (!v || !currentSection) return;
  const leftIs = side(currentSection, true);
  const preferred = v === 'same' ? 'same' : (v === 'left' ? leftIs : leftIs === 'A' ? 'B' : 'A') === 'A' ? 'synth' : 'sample';
  votes.push({ at: new Date().toISOString(), section: currentSection, preferred });
  try {
    localStorage.setItem(STORE, JSON.stringify(votes));
  } catch {
    /* ignore */
  }
  swapped[currentSection] = Math.random() < 0.5;
  rebuild();
  renderLog();
});

$('#blind').addEventListener('click', (e) => {
  blind = !blind;
  (e.target as HTMLElement).setAttribute('aria-pressed', String(blind));
  for (const s of ['kb-pebble', 'kb-clack', 'sq']) swapped[s] = Math.random() < 0.5;
  $('#vote').hidden = !blind;
  rebuild();
});
$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ votes, ua: navigator.userAgent }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mzk-ab-votes-${Date.now()}.json`;
  a.click();
});
$('#preset').addEventListener('change', () => buildKeyboardUI());

function rebuild() {
  buildKeyboardUI();
  buildSquishyUI();
}

function renderLog() {
  const by: Record<string, { synth: number; sample: number; same: number }> = {};
  for (const v of votes) {
    by[v.section] ??= { synth: 0, sample: 0, same: 0 };
    by[v.section][v.preferred]++;
  }
  log.textContent = [
    '블라인드 선택 누적: ' + (Object.keys(by).length ? '' : '(없음)'),
    ...Object.entries(by).map(([k, c]) => `  ${k}: 녹음 ${c.sample} · 합성 ${c.synth} · 구분불가 ${c.same}`),
    '',
    '음량 맞춤(A에 적용, dB): ' + [...matchDb].map(([k, v]) => `${k.slice(2)} ${v > 0 ? '+' : ''}${v.toFixed(1)}`).join(', '),
    '루프(rub/stretch)는 음량 맞춤 미적용.',
    '',
    '출처: ' + KEYBOARD_SAMPLE_CREDITS,
    '      ' + SQUISHY_SAMPLE_CREDITS,
  ].join('\n');
}

(async () => {
  try {
    await Promise.all([loadKeyboard('pebble'), loadKeyboard('clack'), loadSquishy()]);
    computeMatches();
    status.textContent = SQUISHY_SAMPLES_ARE_RECORDED
      ? '준비됨. 버튼을 눌러 비교하세요. (아직 사람 청취 검증 전)'
      : '준비됨. 주의: 말랑이 B의 "복원"은 실제 녹음을 가공(감속·필터·반전)한 파생음이며 폼 복원을 직접 녹음한 것이 아닙니다. 키보드 스페이스바·조약돌 keyup은 분석으로 고른 대체 샘플입니다. (사람 청취 검증 전)';
  } catch (err) {
    status.textContent = `불러오기 실패: ${String(err)}`;
  }
  rebuild();
  renderLog();
})();
