import './style.css';
import { Runtime } from './core/runtime';
import { AudioEngine } from './core/audio';
import { settings, type Settings } from './core/settings';
import { haptic, hapticsSupported } from './core/haptics';
import { StatsOverlay } from './core/hud';
import type { Toy, ToyContext } from './core/toy';
import { createSquishy, SQUISHY_COLORS } from './toys/squishy/toy';
import { createKeyboard, KEY_PRESET_INFO } from './toys/keyboard/toy';
import type { KeyPresetId } from './audio/keyPresets';
import { isLocalKeyPreset, isKeyPresetEnabled } from './audio/localKeyPresets';
import { loadKeyboardSamples } from './audio/keyboardSamples';
import { loadSquishySamples } from './audio/squishySamples';
import { LOCAL_FIDGETS } from './toys/fidgets/references';
import { FIDGETS, findFidget } from './toys/fidgets/catalog';
import { ORIGINAL_SOUNDS, ORIGINAL_FOLDER } from './toys/fidgets/originalMap';
import { createFidget } from './toys/fidgets/toy';
import { preloadFidgetAudio } from './toys/fidgets/audio';
import { KEYBOARD_COLORS } from './toys/keyboard/colors';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

// Preserve the user's selected slot when replacing the two video-based presets.
const replacement = ({ 'hmx-cheese': 'turquoise-tealios', 'magnetic-jade': 'ibm-buckling-spring' } as Record<string, KeyPresetId>)[settings.get().keyPreset];
if (replacement) settings.set('keyPreset', replacement);

// A saved local-only choice must not leave the public UI without an active preset.
if (!isKeyPresetEnabled(settings.get().keyPreset)) settings.set('keyPreset', 'pebble');

// ---------- core services ----------
const audio = new AudioEngine(24);
const rt = new Runtime($('#stage'));
const stats = new StatsOverlay(rt, audio);
void preloadFidgetAudio(audio).catch(e => console.warn('Fidget audio preload', e));
// preload recorded sample sets at boot (decoding works while the context is still suspended)
if (new URLSearchParams(location.search).get('sfx') !== 'synth') {
  void loadKeyboardSamples(audio.ctx, 'pebble').catch(() => {});
  void loadKeyboardSamples(audio.ctx, 'clack').catch(() => {});
  void loadSquishySamples(audio.ctx).catch(() => {});
}

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
const toys: Record<string, (Toy & { setColor?(id: string): void; action?(name: string): void; setPreset?(p: KeyPresetId): void }) | undefined> = {};
const TOY_TITLES: Record<string, string> = { squishy: '말랑이', keyboard: '키보드', ...Object.fromEntries(FIDGETS.map(f => [f.id, f.name])) };
const TOY_HINTS: Record<string, string> = {
  ...Object.fromEntries(FIDGETS.map(f => [f.id, f.hint])),
  squishy: '꾹 눌러보세요 · 두 손가락으로 늘려보세요',
  keyboard: '키를 눌러보세요 · 여러 키를 동시에',
};
function getToy(id: string) {
  if (!toys[id]) {
    if (id === 'squishy') toys[id] = createSquishy(ctx);
    else if (id === 'keyboard') toys[id] = createKeyboard(ctx);
    else { const spec = findFidget(id); if (spec) toys[id] = createFidget(ctx, spec); }
  }
  return toys[id];
}

const variants = $('#variants');
function buildVariants(id: string): void {
  variants.innerHTML = '';
  if (findFidget(id)) {
    // dev only: compare the reference-app stand-in sounds with the public ones on the same gestures
    if (ORIGINAL_SOUNDS && ORIGINAL_FOLDER[id]) {
      const pair: HTMLButtonElement[] = [];
      for (const [v, label] of [['original', '원본 소리'], ['public', '공개 소리']] as const) {
        const b = document.createElement('button'); b.className = 'chip'; b.textContent = label;
        b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(v === 'original'));
        b.onclick = () => { toys[id]?.action?.('sound:' + v); pair.forEach((x) => x.setAttribute('aria-checked', String(x === b))); };
        pair.push(b); variants.append(b);
      }
      getToy(id)?.action?.('sound:original'); // the chips start on 원본 소리: keep the toy in step after a revisit
    }
    const select = document.createElement('select'); select.className = 'toy-jump'; select.setAttribute('aria-label', '다른 장난감');
    for (const f of FIDGETS) { const o = new Option(f.name, f.id); o.selected = f.id === id; select.add(o); }
    select.onchange = () => { location.hash = '#/' + select.value; }; variants.append(select);
  } else if (id === 'squishy') {
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
    for (const p of Object.keys(KEY_PRESET_INFO) as KeyPresetId[]) {
      if (!isKeyPresetEnabled(p)) continue;
      const b = document.createElement('button');
      b.className = 'chip';
      b.setAttribute('role', 'radio');
      b.textContent = KEY_PRESET_INFO[p].label;
      b.title = KEY_PRESET_INFO[p].desc;
      b.setAttribute('aria-checked', String(settings.get().keyPreset === p));
      b.onclick = () => {
        settings.set('keyPreset', p);
        toys.keyboard?.setPreset?.(p);
        b.blur(); // the keyboard toy ignores key presses while a button has focus: give the physical keys back right away
        if (isLocalKeyPreset(p) || p === 'turquoise-tealios' || p === 'ibm-buckling-spring') {
          b.dataset.loadState = 'loading';
          b.textContent = `${KEY_PRESET_INFO[p].label} · 로딩 중`;
          void loadKeyboardSamples(audio.ctx, p).then(() => {
            b.dataset.loadState = 'ready'; b.textContent = KEY_PRESET_INFO[p].label;
          }, () => {
            b.dataset.loadState = 'error'; b.textContent = `${KEY_PRESET_INFO[p].label} · 재시도`;
          });
        }
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
  const [id, presetId] = location.hash.replace(/^#\/?/, '').split('/');
  if (id === 'keyboard' && presetId && Object.hasOwn(KEY_PRESET_INFO, presetId) && isKeyPresetEnabled(presetId)) {
    settings.set('keyPreset', presetId as KeyPresetId); toys.keyboard?.setPreset?.(presetId as KeyPresetId);
  }
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
  variants.setAttribute('role', findFidget(id) ? 'group' : 'radiogroup');
  variants.setAttribute('aria-label', findFidget(id) ? '장난감 조작' : id === 'squishy' ? '색상' : '타건감');
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

const homeCards = document.querySelector<HTMLElement>('#content-cards')!;
function showCategory(category: string) {
  document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.category === category)));
  homeCards.replaceChildren();
  if (category === '키보드') {
    for (const p of Object.keys(KEY_PRESET_INFO) as KeyPresetId[]) {
      if (!isKeyPresetEnabled(p)) continue;
      const link = document.createElement('a'); link.className = 'card'; link.href = '#/keyboard/' + p;
      const thumb = document.createElement('div'); thumb.className = 'thumb preview-keyboard';
      for (const color of KEYBOARD_COLORS[p].keys.slice(0, 9)) { const key = document.createElement('i'); key.style.background = '#' + color.toString(16).padStart(6, '0'); thumb.append(key); }
      const body = document.createElement('div'); body.className = 'card-body'; const title = document.createElement('b'); title.textContent = KEY_PRESET_INFO[p].label;
      const desc = document.createElement('span'); desc.textContent = KEY_PRESET_INFO[p].desc; body.append(title, desc); link.append(thumb, body); homeCards.append(link);
    }
  } else {
    for (const f of FIDGETS.filter(f => f.category === category)) {
      const link = document.createElement('a'); link.className = 'card'; link.href = '#/' + f.id; link.dataset.toy = f.id;
      const thumb = document.createElement('div'); thumb.className = 'thumb preview-fidget ' + f.shape; thumb.style.setProperty('--toy-color', '#' + f.color.toString(16).padStart(6, '0'));
      const shape = document.createElement('i'); thumb.append(shape);
      if (LOCAL_FIDGETS) { const image = document.createElement('img'); image.src = '/__local-fidgets/thumbs/' + f.id + '.png'; image.alt = ''; image.onload = () => shape.hidden = true; image.onerror = () => image.remove(); thumb.append(image); }
      const body = document.createElement('div'); body.className = 'card-body'; const title = document.createElement('b'); title.textContent = f.name;
      const desc = document.createElement('span'); desc.textContent = f.hint; const label = document.createElement('i'); label.textContent = f.category; body.append(title, desc, label); link.append(thumb, body); homeCards.append(link);
    }
  }
}
document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(b => b.onclick = () => showCategory(b.dataset.category!));
showCategory('말랑이');
if (import.meta.env.DEV) (window as unknown as { __MANZIZAK__: unknown }).__MANZIZAK__ = {
  report: () => rt.toy?.report?.(), audio: () => audio.playLogs.slice(-100), frames: () => rt.framesRendered,
};
applySettings(settings.get());
route();
