import './style.css';
import { Runtime } from './core/runtime';
import { AudioEngine } from './core/audio';
import { settings, type Settings } from './core/settings';
import { haptic, hapticsSupported } from './core/haptics';
import { StatsOverlay } from './core/hud';
import type { Toy, ToyContext } from './core/toy';
import { createSquishy, SQUISHY_COLORS } from './toys/squishy/toy';
import { createKeyboard, KEY_PRESET_INFO } from './toys/keyboard/toy';
import type { KeySwitchPreset } from './audio/sfx';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

// ---------- core services ----------
const audio = new AudioEngine(24);
const rt = new Runtime($('#stage'));
const stats = new StatsOverlay(rt, audio);

const ctx: ToyContext = {
  renderer: rt.renderer,
  audio,
  requestFrame: () => rt.requestFrame(),
  size: () => ({ w: rt.width, h: rt.height }),
  haptic,
};

// Audio unlock: any user gesture anywhere (home card taps unlock before entering a toy).
// Touch pointerdown may not count as activation on some browsers, so we also try on pointerup/touchend/click.
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(type, (ev) => audio.unlock(ev), { capture: true, passive: true });
}

// ---------- settings wiring ----------
const applySettings = (s: Readonly<Settings>) => {
  audio.setVolume(s.volume);
  audio.setMuted(!s.sound);
  const sb = $('#sound-btn');
  sb.setAttribute('aria-pressed', String(s.sound));
  sb.setAttribute('aria-label', s.sound ? '소리 끄기' : '소리 켜기');
  sb.innerHTML = s.sound
    ? '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>'
    : '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16.5 9.5l5 5m0-5l-5 5"/></svg>';
  document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
  stats.show(s.showStats || new URLSearchParams(location.search).get('stats') === '1');
  syncSheet(s);
};
settings.subscribe((s) => applySettings(s));

// ---------- settings sheet ----------
const sheet = $('#sheet');
function syncSheet(s: Readonly<Settings>): void {
  sheet.querySelectorAll<HTMLInputElement>('input[data-setting]').forEach((inp) => {
    const k = inp.dataset.setting as keyof Settings;
    if (inp.type === 'checkbox') inp.checked = Boolean(s[k]);
    else inp.value = String(s[k]);
  });
  sheet.querySelectorAll<HTMLButtonElement>('.seg[data-setting="quality"] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === s.quality)));
}
sheet.addEventListener('input', (e) => {
  const inp = e.target as HTMLInputElement;
  const k = inp.dataset.setting as keyof Settings | undefined;
  if (!k) return;
  if (inp.type === 'checkbox') settings.set(k, inp.checked as never);
  else settings.set(k, Number(inp.value) as never);
});
sheet.querySelector('.seg')!.addEventListener('click', (e) => {
  const v = (e.target as HTMLElement).dataset.v;
  if (v) settings.set('quality', v as Settings['quality']);
});
if (!hapticsSupported) {
  const h = sheet.querySelector<HTMLInputElement>('input[data-setting="haptics"]')!;
  h.disabled = true;
  $('#haptics-note').textContent = '이 기기의 브라우저는 지원하지 않음';
}
let sheetOpener: HTMLElement | null = null;
const openSheet = () => {
  syncSheet(settings.get());
  sheetOpener = document.activeElement as HTMLElement | null;
  sheet.hidden = false;
  $('#home').inert = true;
  $('#toy-ui').inert = true;
  sheet.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true });
};
const closeSheet = () => {
  if (sheet.hidden) return;
  sheet.hidden = true;
  $('#home').inert = false;
  $('#toy-ui').inert = false;
  sheetOpener?.focus({ preventScroll: true });
  sheetOpener = null;
};
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
});

// ---------- toys ----------
const toys: Record<string, (Toy & { setColor?(id: string): void; setPreset?(p: KeySwitchPreset): void }) | undefined> = {};
const TOY_TITLES: Record<string, string> = { squishy: '말랑이', keyboard: '키보드' };
const TOY_HINTS: Record<string, string> = {
  squishy: '꾹 눌러보세요 · 두 손가락으로 늘려보세요',
  keyboard: '키를 눌러보세요 · 여러 키를 동시에',
};
function getToy(id: string) {
  if (!toys[id]) {
    if (id === 'squishy') toys[id] = createSquishy(ctx);
    else if (id === 'keyboard') toys[id] = createKeyboard(ctx);
  }
  return toys[id];
}

const variants = $('#variants');
function buildVariants(id: string): void {
  variants.innerHTML = '';
  if (id === 'squishy') {
    for (const c of SQUISHY_COLORS) {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', c.label);
      b.style.background = `#${c.color.toString(16).padStart(6, '0')}`;
      b.setAttribute('aria-checked', String(settings.get().squishyColor === c.id));
      b.onclick = () => {
        settings.set('squishyColor', c.id);
        toys.squishy?.setColor?.(c.id);
        variants.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      };
      variants.appendChild(b);
    }
  } else if (id === 'keyboard') {
    for (const p of Object.keys(KEY_PRESET_INFO) as KeySwitchPreset[]) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.setAttribute('role', 'radio');
      b.textContent = KEY_PRESET_INFO[p].label;
      b.title = KEY_PRESET_INFO[p].desc;
      b.setAttribute('aria-checked', String(settings.get().keyPreset === p));
      b.onclick = () => {
        settings.set('keyPreset', p);
        toys.keyboard?.setPreset?.(p);
        variants.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      };
      variants.appendChild(b);
    }
  }
}

// ---------- routing ----------
const home = $('#home');
const toyUi = $('#toy-ui');
const hint = $('#toy-hint');
let cameFromHome = false;
let hintTimer = 0;

function route(): void {
  const id = location.hash.replace(/^#\/?/, '');
  const toy = id ? getToy(id) : undefined;
  closeSheet();
  if (!toy) {
    rt.setToy(null);
    // swallow the click that may follow a touch which started on the toy canvas
    home.classList.add('lock');
    setTimeout(() => home.classList.remove('lock'), 450);
    home.hidden = false;
    toyUi.hidden = true;
    document.title = '만지작 MANZIZAK';
    return;
  }
  home.hidden = true;
  toyUi.hidden = false;
  $('#toy-title').textContent = TOY_TITLES[id];
  document.title = `${TOY_TITLES[id]} · 만지작`;
  buildVariants(id);
  hint.textContent = TOY_HINTS[id];
  hint.classList.remove('gone');
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => hint.classList.add('gone'), 6000);
  rt.canvas.setAttribute('aria-label', `${TOY_TITLES[id]} 장난감 — 터치해서 조작`);
  rt.canvas.setAttribute('role', 'img');
  variants.setAttribute('aria-label', id === 'squishy' ? '색상' : '타건감');
  rt.setToy(toy);
}
window.addEventListener('hashchange', route);
rt.canvas.addEventListener('pointerdown', () => hint.classList.add('gone'));

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (el) {
    const a = el.dataset.action;
    if (a === 'settings') openSheet();
    if (a === 'close-sheet') closeSheet();
    if (a === 'sound') settings.set('sound', !settings.get().sound);
    if (a === 'reset') rt.toy?.reset();
    if (a === 'back') {
      if (cameFromHome) history.back();
      else location.hash = '#/';
    }
    return;
  }
  const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
  if (card) cameFromHome = true;
});

// one-time hint that web audio follows the iOS silent switch
let noticeShown = false;
try {
  noticeShown = sessionStorage.getItem('mzk-notice') === '1';
} catch {
  /* ignore */
}
audio.onStateChange = (s) => {
  if (s !== 'running' || noticeShown || !settings.get().sound) return;
  noticeShown = true;
  try {
    sessionStorage.setItem('mzk-notice', '1');
  } catch {
    /* ignore */
  }
  if (!rt.toy) return;
  const n = document.createElement('div');
  n.className = 'notice';
  n.textContent = '소리가 안 들리면 무음 모드·볼륨을 확인하세요';
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 3200);
};

applySettings(settings.get());
route();
