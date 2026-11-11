import { AudioEngine } from '../core/audio';
import { EXTRA_KEY_ROLES, loadKeyboardSamples, type KeyboardSampleSounds } from '../audio/keyboardSamples';
import type { KeyPresetId } from '../audio/keyPresets';
import { topreRole } from '../audio/keyboardRouting';

const audio = new AudioEngine(32);
const select = document.querySelector<HTMLSelectElement>('#preset')!;
const status = document.querySelector<HTMLElement>('#status')!;
const demo = document.querySelector<HTMLButtonElement>('#demo')!;
const held = new Map<string, { preset: KeyPresetId; code: string }>();
const presets: KeyPresetId[] = ['pebble', 'clack', 'creamy-thocky', 'topre'];
const pattern = ['F1', 'Digit1', 'KeyQ', 'KeyA', 'KeyZ', 'Space', 'Enter', 'Backspace'];
let ready = false;
let demoTimers: ReturnType<typeof setTimeout>[] = [];
for (const type of ['pointerdown', 'keydown', 'click']) window.addEventListener(type, e => audio.unlock(e), { capture: true });

function register(p: KeyPresetId, s: KeyboardSampleSounds) {
  for (const role of ['down', 'up', 'spaceDown', 'spaceUp', ...EXTRA_KEY_ROLES] as const) {
    if (s[role]?.length) audio.register(`kb:${p}:${role}`, s[role]!);
  }
  s.rowDown?.forEach((buf, i) => audio.register(`kb:${p}:downR${i}`, [buf]));
}
function play(p: KeyPresetId, code: string, phase: 'Down' | 'Up') {
  const specific = p === 'topre' ? topreRole(code, phase) : undefined;
  const role = specific ?? (code === 'Space' ? `space${phase}` : phase.toLowerCase());
  audio.play(`kb:${p}:${role}`, { gainDb: 6 }, phase === 'Down' ? 'keydown' : 'keyup');
}
function down(id: string, code: string) {
  if (!ready || held.has(id)) return;
  const preset = select.value as KeyPresetId;
  held.set(id, { preset, code });
  play(preset, code, 'Down');
}
function up(id: string) {
  const h = held.get(id);
  if (!h) return;
  held.delete(id);
  play(h.preset, h.code, 'Up');
}
for (const [i, code] of pattern.entries()) {
  const b = document.createElement('button');
  b.textContent = i < 5 ? `R${i} · ${['F1', '1', 'Q', 'A', 'Z'][i]}` : code;
  b.disabled = true;
  b.onpointerdown = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.setAttribute('aria-pressed', 'true'); down(`p${e.pointerId}`, code); };
  const release = (e: PointerEvent) => { up(`p${e.pointerId}`); b.setAttribute('aria-pressed', 'false'); };
  b.onpointerup = release;
  b.onpointercancel = release;
  b.onlostpointercapture = release;
  b.onkeydown = e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); down(`button${i}`, code); } };
  b.onkeyup = e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); up(`button${i}`); } };
  document.querySelector('#pads')!.append(b);
}
window.addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || /^(BUTTON|SELECT|INPUT)$/.test((e.target as HTMLElement).tagName)) return;
  if (!topreRole(e.code, 'Down')) return;
  e.preventDefault(); down(`k${e.code}`, e.code);
});
window.addEventListener('keyup', e => up(`k${e.code}`));
const stopDemo = () => { demoTimers.forEach(clearTimeout); demoTimers = []; for (const id of [...held.keys()]) up(id); };
select.onchange = stopDemo;
window.addEventListener('blur', stopDemo);
demo.onclick = () => {
  stopDemo();
  for (const [i, code] of [...pattern, ...pattern].entries()) {
    demoTimers.push(setTimeout(() => down(`demo${i}`, code), i * 160));
    demoTimers.push(setTimeout(() => up(`demo${i}`), i * 160 + 65));
  }
};
try {
  await Promise.all(presets.map(async p => register(p, await loadKeyboardSamples(audio.ctx, p))));
  ready = true;
  document.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = false);
  status.textContent = '4종 준비됨 · Topre 원본 12개 로드 완료';
} catch (e) { status.textContent = `음원 로드 실패: ${String(e)}`; }
