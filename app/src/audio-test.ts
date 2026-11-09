import './style.css';
import { AudioEngine } from './core/audio';
import { makeClick } from './core/synth';
import { buildSquishySounds } from './audio/sfx';
import { param } from './core/params';
import { round } from './core/metrics';

/**
 * Trial protocol (one trial per fresh page load):
 *   mode=down       unlock + play "press" in pointerdown only
 *   mode=up         unlock + play "release" in pointerup only
 *   mode=both       unlock attempted in both; press sound on down, release sound on up
 *   mode=touchstart unlock + play in touchstart only (legacy iOS behaviour check)
 * The engine never plays a sound later than LATE_MS after it was requested,
 * so "played-after-resume" / "dropped-late" outcomes tell us whether the
 * first pointerdown could actually produce sound in time.
 */
type Mode = 'down' | 'up' | 'both' | 'touchstart';
const MODES: Mode[] = ['down', 'up', 'both', 'touchstart'];
const mode: Mode = (MODES as string[]).includes(param('mode', 'down')) ? (param('mode', 'down') as Mode) : 'down';
const STORE = 'mzk-audio-trials-v1';

interface Trial {
  at: string;
  mode: Mode;
  ua: string;
  stateAtLoad: string;
  firstTouch: {
    unlock: unknown[];
    plays: unknown[];
  };
  later: { n: number; playedImmediately: number; other: Record<string, number> };
  answer: string | null;
  latency: { baseLatency?: number; outputLatency?: number; sampleRate: number };
}

const audio = new AudioEngine(16);
const set = buildSquishySounds(audio.ctx);
audio.register('press', set.press);
audio.register('release', set.release);
audio.register('click', [makeClick(audio.ctx)]);

const trial: Trial = {
  at: new Date().toISOString(),
  mode,
  ua: navigator.userAgent,
  stateAtLoad: audio.state,
  firstTouch: { unlock: [], plays: [] },
  later: { n: 0, playedImmediately: 0, other: {} },
  answer: null,
  latency: audio.latencyInfo(),
};

const pad = document.getElementById('pad')!;
const status = document.getElementById('status')!;
let touches = 0;
let flashMode = false;

// mode buttons
const modesEl = document.getElementById('modes')!;
for (const m of MODES) {
  const a = document.createElement('button');
  a.textContent = `mode=${m}`;
  a.setAttribute('aria-pressed', String(m === mode));
  a.addEventListener('click', () => {
    const u = new URL(location.href);
    u.searchParams.set('mode', m);
    location.href = u.toString();
  });
  modesEl.appendChild(a);
}

function playFor(name: string, ev: Event): void {
  const log = audio.play(flashMode ? 'click' : name, { detuneCents: flashMode ? 0 : 30 }, ev.type);
  if (touches === 1 && log) trial.firstTouch.plays.push(log); // same object; outcome filled in later
  if (touches > 1 && log) {
    trial.later.n++;
    if (log.outcome === 'played') trial.later.playedImmediately++;
    else trial.later.other[log.outcome] = (trial.later.other[log.outcome] ?? 0) + 1;
  }
}

function unlockFor(ev: Event): void {
  const before = audio.unlockLogs.length;
  audio.unlock(ev);
  if (touches === 1 && audio.unlockLogs.length > before) trial.firstTouch.unlock.push(audio.unlockLogs[audio.unlockLogs.length - 1]);
}

pad.addEventListener('pointerdown', (ev) => {
  if (mode === 'touchstart' && ev.pointerType === 'touch') return; // counted in the touchstart handler
  touches++;
  if (flashMode) {
    pad.classList.add('flash');
    setTimeout(() => pad.classList.remove('flash'), 60);
  }
  if (mode === 'down' || mode === 'both') {
    unlockFor(ev);
    playFor('press', ev);
  }
  render();
});
pad.addEventListener('pointerup', (ev) => {
  if (mode === 'up' || mode === 'both') {
    unlockFor(ev);
    if (!flashMode) playFor('release', ev);
  }
  if (touches === 1) setTimeout(() => document.getElementById('ask')!.classList.add('show'), 300);
  render();
});
pad.addEventListener(
  'touchstart',
  (ev) => {
    if (mode !== 'touchstart') return;
    ev.preventDefault(); // keep pointer events from being treated as scroll
    touches++;
    unlockFor(ev);
    playFor('press', ev);
    render();
  },
  { passive: false },
);
pad.addEventListener('contextmenu', (e) => e.preventDefault());

document.getElementById('ask')!.addEventListener('click', (e) => {
  const ans = (e.target as HTMLElement).dataset.ans;
  if (!ans) return;
  trial.answer = ans;
  document.getElementById('ask')!.classList.remove('show');
  render();
});

function load(): Trial[] {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '[]') as Trial[];
  } catch {
    return [];
  }
}
function saveTrial(): void {
  if (touches === 0) return;
  trial.latency = audio.latencyInfo();
  const all = load();
  all.push(JSON.parse(JSON.stringify(trial)) as Trial);
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

document.getElementById('next')!.addEventListener('click', () => {
  saveTrial();
  const u = new URL(location.href);
  u.searchParams.set('mode', MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  location.href = u.toString();
});
document.getElementById('flash')!.addEventListener('click', (e) => {
  flashMode = !flashMode;
  (e.target as HTMLElement).setAttribute('aria-pressed', String(flashMode));
  render();
});
document.getElementById('export')!.addEventListener('click', () => {
  saveTrial();
  touches = 0; // avoid double-save
  const blob = new Blob([JSON.stringify(load(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mzk-audio-trials-${Date.now()}.json`;
  a.click();
});
document.getElementById('clear')!.addEventListener('click', () => {
  if (confirm('누적 결과를 지울까요?')) {
    localStorage.removeItem(STORE);
    renderTable();
  }
});

function summarizeFirst(t: Trial): string {
  const plays = t.firstTouch.plays as { eventType: string; outcome: string; delayMs?: number }[];
  return plays.map((p) => `${p.eventType}:${p.outcome}${p.delayMs !== undefined ? `(${round(p.delayMs, 0)}ms)` : ''}`).join(', ') || '-';
}

function render(): void {
  const l = audio.latencyInfo();
  status.textContent = [
    `mode=${mode}  context=${audio.state}  (로드 시 ${trial.stateAtLoad})`,
    `baseLatency=${l.baseLatency === undefined ? 'n/a' : round(l.baseLatency * 1000, 1) + 'ms'}  outputLatency=${l.outputLatency === undefined ? 'n/a' : round(l.outputLatency * 1000, 1) + 'ms'}  sr=${l.sampleRate}`,
    `userActivation API: ${'userActivation' in navigator ? '있음' : '없음'}`,
    `첫 터치 재생 결과: ${summarizeFirst(trial)}`,
    `첫 터치 활성화 로그: ${JSON.stringify(trial.firstTouch.unlock.map((u) => {
      const x = u as { eventType: string; stateBefore: string; stateAfterCall: string; userActivationIsActive?: boolean; resumeResolvedMs?: number };
      return `${x.eventType} ${x.stateBefore}→${x.stateAfterCall} ua=${x.userActivationIsActive} resume=${x.resumeResolvedMs === undefined ? 'pending' : round(x.resumeResolvedMs, 1) + 'ms'}`;
    }))}`,
    `이후 터치: ${trial.later.n}회 중 즉시 재생 ${trial.later.playedImmediately}회 ${JSON.stringify(trial.later.other)}`,
    `귀로 확인: ${trial.answer ?? '(미응답)'}`,
    flashMode ? '지연 촬영 모드: 누르는 순간 패드가 흰색으로 깜빡이고 클릭음 재생. 240fps 슬로모션으로 손가락 접촉 → 화면 → 소리 프레임 차이를 셉니다.' : '',
  ].join('\n');
}

function renderTable(): void {
  const rows = load();
  const tbl = document.getElementById('results')!;
  tbl.innerHTML = '<tr><th>#</th><th>mode</th><th>첫 터치 재생</th><th>귀</th><th>이후 즉시</th></tr>';
  rows.forEach((t, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i + 1}</td><td>${t.mode}</td><td>${summarizeFirst(t)}</td><td>${t.answer ?? '-'}</td><td>${t.later.playedImmediately}/${t.later.n}</td>`;
    tbl.appendChild(tr);
  });
}

audio.onStateChange = () => render();
setInterval(render, 500);
render();
renderTable();
