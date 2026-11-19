import './style.css';
import './ui.css';
import { AudioEngine } from './core/audio';
import { settings, type Settings } from './core/settings';
import { haptic, hapticsSupported } from './core/haptics';
import type { Runtime } from './core/runtime';
import type { StatsOverlay } from './core/hud';
import type { Toy, ToyContext } from './core/toy';
import { SQUISHY_COLORS } from './toys/squishy/colors';
import { KEY_PRESET_INFO } from './toys/keyboard/info';
import type { KeyPresetId } from './audio/keyPresets';
import { isLocalKeyPreset, isKeyPresetEnabled } from './audio/localKeyPresets';
import { loadKeyboardSamples } from './audio/keyboardSamples';
import { loadSquishySamples } from './audio/squishySamples';
// dev only (see references.ts; kept out of the static graph because that module pulls in three.js)
const LOCAL_FIDGETS = import.meta.env.VITE_LOCAL_FIDGETS === '1';
import { FIDGETS, findFidget } from './toys/fidgets/catalog';
import { ORIGINAL_SOUNDS, ORIGINAL_FOLDER } from './toys/fidgets/originalMap';
import { loadChunk, chunksOf } from './toys/fidgets/fidgetSprites';
import { KEYBOARD_COLORS } from './toys/keyboard/colors';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

// Preserve the user's selected slot when replacing the two video-based presets.
const replacement = ({ 'hmx-cheese': 'turquoise-tealios', 'magnetic-jade': 'ibm-buckling-spring' } as Record<string, KeyPresetId>)[settings.get().keyPreset];
if (replacement) settings.set('keyPreset', replacement);

// A saved local-only choice must not leave the public UI without an active preset.
// An id this build does not know at all (older / newer version, hand-edited storage) falls back the same way.
if (!Object.hasOwn(KEY_PRESET_INFO, settings.get().keyPreset) || !isKeyPresetEnabled(settings.get().keyPreset)) settings.set('keyPreset', 'pebble');

// ---------- core services ----------
const audio = new AudioEngine(24);

// The home screen needs none of three.js, the toys or their sounds: the renderer, the toy modules and the audio files of a toy
// are fetched when that toy is opened (route() below) and nothing is preloaded at boot. Once the first toy is up, warmAll() fetches
// the rest in the background so switching toys or keyboard presets never waits.
let rt: Runtime | null = null;
let stats: StatsOverlay | null = null;
let stageReady: Promise<ToyContext> | null = null;
const wantStats = (s: Readonly<Settings>) => s.showStats || new URLSearchParams(location.search).get('stats') === '1';
const ensureStage = (): Promise<ToyContext> => (stageReady ??= (async () => {
  const [{ Runtime }, { StatsOverlay }] = await Promise.all([import('./core/runtime'), import('./core/hud')]);
  const r = (rt = new Runtime($('#stage')));
  stats = new StatsOverlay(r, audio);
  stats.show(wantStats(settings.get()));
  // the stage sits between the header and the dock: follow its box (dock folded / unfolded, rotation), not only the window
  new ResizeObserver(() => r.resize()).observe($('#stage'));
  return {
    renderer: r.renderer,
    audio,
    requestFrame: () => r.requestFrame(),
    size: () => ({ w: r.width, h: r.height }),
    haptic,
    soundChanged: () => { syncSoundStatus(); warmWhenReady(); },
  };
})().catch((e) => { stageReady = null; throw e; })); // a failed load can be retried by opening the toy again

// ---------- sound status chip ----------
// From the first touch / key press on a toy whose sounds are not ready yet: a small "소리 불러오는 중" chip, so silent presses are not
// mistaken for a broken toy. It hides itself when the sounds are ready; after a network failure it offers 다시 시도. Input is never blocked.
const soundStatusEl = $('#sound-status');
let soundTouched = false;
function syncSoundStatus(): void {
  const st = soundTouched && currentId ? (rt?.toy ? rt.toy.soundStatus?.() : { state: 'loading' as const }) : undefined;
  if (!st || st.state === 'ready') { soundStatusEl.hidden = true; soundStatusEl.replaceChildren(); return; }
  if (soundStatusEl.dataset.state === st.state && !soundStatusEl.hidden && (st.state === 'loading' || !!soundStatusEl.querySelector('button') === !!st.retry)) return;
  soundStatusEl.dataset.state = st.state;
  soundStatusEl.hidden = false;
  if (st.state === 'loading') soundStatusEl.replaceChildren('소리 불러오는 중…');
  else {
    soundStatusEl.replaceChildren(st.retry ? '소리를 불러오지 못했어요' : '이 기기에서 소리를 재생할 수 없어요');
    if (st.retry) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = '다시 시도';
      b.onclick = () => { st.retry!(); syncSoundStatus(); };
      soundStatusEl.append(b);
    }
  }
}
const noteToyInput = () => { if (soundTouched || !currentId) return; soundTouched = true; syncSoundStatus(); };
$('#stage').addEventListener('pointerdown', noteToyInput);
window.addEventListener('keydown', (e) => { if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && sheet.hidden) noteToyInput(); });

// Audio unlock: any user gesture anywhere (the first touch on the toy itself, or a tap in the dock).
// Touch pointerdown may not count as activation on some browsers, so we also try on pointerup/touchend/click.
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(type, (ev) => audio.unlock(ev), { capture: true, passive: true });
}

// ---------- settings wiring ----------
const applySettings = (s: Readonly<Settings>) => {
  audio.setVolume(s.volume);
  audio.setMuted(!s.sound);
  $('#volume-value').textContent = `${Math.round(s.volume * 100)}%`;
  const sb = $('#sound-btn');
  sb.setAttribute('aria-pressed', String(s.sound));
  sb.setAttribute('aria-label', s.sound ? '소리 끄기' : '소리 켜기');
  sb.innerHTML = s.sound
    ? '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>'
    : '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16.5 9.5l5 5m0-5l-5 5"/></svg>';
  document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
  stats?.show(wantStats(s));
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
const shellParts = () => ['#app-head', '#dock', '#variants', '#stage', '#now-playing'].map((q) => $(q));
let sheetOpener: HTMLElement | null = null;
const openSheet = () => {
  syncSheet(settings.get());
  sheetOpener = document.activeElement as HTMLElement | null;
  sheet.hidden = false;
  for (const el of shellParts()) el.inert = true;
  sheet.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true });
};
const closeSheet = () => {
  if (sheet.hidden) return;
  sheet.hidden = true;
  for (const el of shellParts()) el.inert = false;
  sheetOpener?.focus({ preventScroll: true });
  sheetOpener = null;
};
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
});

// ---------- toys ----------
const toys: Record<string, (Toy & { setColor?(id: string): void; action?(name: string): void; setPreset?(p: KeyPresetId): void }) | undefined> = {};
const TOY_TITLES: Record<string, string> = { squishy: '말랑이', keyboard: '키보드', ...Object.fromEntries(FIDGETS.map(f => [f.id, f.name])) };
/** Gesture hints: no longer drawn on screen (the toy is meant to be touched without reading); kept as the canvas's accessible description. */
const TOY_HINTS: Record<string, string> = {
  ...Object.fromEntries(FIDGETS.map(f => [f.id, f.hint])),
  squishy: '꾹 눌러보세요 · 두 손가락으로 늘려보세요',
  keyboard: '키를 눌러보세요 · 여러 키를 동시에',
};
const isToyId = (id: string | undefined): id is string => id === 'squishy' || id === 'keyboard' || !!(id && findFidget(id));
/** Build a toy on first use (its module and three.js are fetched then). Concurrent calls share one creation. */
async function getToy(id: string): Promise<(typeof toys)[string]> {
  if (toys[id]) return toys[id];
  const c = await ensureStage();
  if (id === 'squishy') { const m = await import('./toys/squishy/toy'); toys[id] ??= m.createSquishy(c); }
  else if (id === 'keyboard') { const m = await import('./toys/keyboard/toy'); toys[id] ??= m.createKeyboard(c); }
  else { const spec = findFidget(id); const m = await import('./toys/fidgets/toy'); if (spec) toys[id] ??= m.createFidget(c, spec); }
  return toys[id];
}
/** Start fetching exactly the audio the opened toy plays from, in parallel with its code (the toy's own request joins the same promise). */
function warmAudio(id: string): void {
  if (new URLSearchParams(location.search).get('sfx') === 'synth') return;
  if (id === 'squishy') void loadSquishySamples(audio.ctx).catch(() => {});
  else if (id === 'keyboard') void loadKeyboardSamples(audio.ctx, settings.get().keyPreset).catch(() => {});
  else for (const c of chunksOf(id)) void loadChunk(audio.ctx, c).catch(() => {});
}

/**
 * No waiting on a switch (owner, 2026-11-19: "사용자 입장에서 로딩이 되어선 안돼"): once the first toy is up and the browser is idle,
 * fetch and decode every other toy's sounds and code in the background, one at a time, the current category first
 * (keyboard presets ≈0.6 MB, 말랑이 chunks ≈4.6 MB of FLAC). The loaders cache by URL, so a later open joins the same result.
 * Skipped when the browser asks to save data; then each toy still loads on open as before.
 */
let warmedAll = false;
/** starts once the opened toy can sound, so the warm-up never competes with it (and never starts while the network is down) */
const warmWhenReady = () => { if (!warmedAll && rt?.toy && (rt.toy.soundStatus?.().state ?? 'ready') === 'ready') warmAll(); };
function warmAll(): void {
  if (warmedAll || new URLSearchParams(location.search).get('sfx') === 'synth') return;
  warmedAll = true;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  const keyboard = [() => import('./toys/keyboard/toy'), ...enabledPresets().map((p) => () => loadKeyboardSamples(audio.ctx, p))];
  const fidgets = [() => import('./toys/fidgets/toy'), ...FIDGETS.map((f) => () => Promise.all(chunksOf(f.id).map((c) => loadChunk(audio.ctx, c))))];
  const jobs = category === 'keyboard' ? [...keyboard, ...fidgets] : [...fidgets, ...keyboard];
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  const idle = (cb: () => void) => (ric ? ric(cb, { timeout: 1000 }) : setTimeout(cb, 50));
  // the first failure (offline, flaky network) ends the warm-up: the toys then load on open as before, with their own retry
  const next = () => { const job = jobs.shift(); if (job) idle(() => void job().then(next, () => {})); };
  next();
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
      void getToy(id).then((t) => t?.action?.('sound:original')); // the chips start on 원본 소리: keep the toy in step after a revisit
    }
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
  }
  // keyboard presets and the other fidgets are chosen in the dock
}

// ---------- routing ----------
// There is no home screen: the app opens on a toy (the last one used, else 슬랑이) and the dock below switches toys in place.
// The hash still names the toy (#/S01, #/keyboard/<preset>, #/squishy) so links keep working; switching uses replaceState,
// so Back leaves the app instead of stepping through every toy tried.
const DEFAULT_FIDGET = 'S01';
type Category = 'fidget' | 'keyboard';
const enabledPresets = () => (Object.keys(KEY_PRESET_INFO) as KeyPresetId[]).filter((p) => isKeyPresetEnabled(p));
const validFidget = (id: unknown): id is string => typeof id === 'string' && !!findFidget(id);
const fidgetChoice = () => (validFidget(settings.get().lastFidget) ? settings.get().lastFidget : DEFAULT_FIDGET);
const launchHash = () => (settings.get().lastCategory === 'keyboard' ? `#/keyboard/${settings.get().keyPreset}` : `#/${fidgetChoice()}`);
// stored values from an older / hand-edited state fall back to 슬랑이
if (settings.get().lastCategory !== 'keyboard' && settings.get().lastCategory !== 'fidget') settings.set('lastCategory', 'fidget');
if (!validFidget(settings.get().lastFidget)) settings.set('lastFidget', DEFAULT_FIDGET);

let currentId = '';
let category: Category = settings.get().lastCategory;

let routeSeq = 0;
async function route(): Promise<void> {
  const seq = ++routeSeq; // a later switch makes an earlier, still-loading one a no-op
  let [id, presetId] = location.hash.replace(/^#\/?/, '').split('/');
  if (!isToyId(id)) {
    history.replaceState(null, '', launchHash());
    [id, presetId] = location.hash.replace(/^#\/?/, '').split('/');
  }
  if (id === 'keyboard' && presetId && Object.hasOwn(KEY_PRESET_INFO, presetId) && isKeyPresetEnabled(presetId)) {
    settings.set('keyPreset', presetId as KeyPresetId); toys.keyboard?.setPreset?.(presetId as KeyPresetId);
  }
  closeSheet();
  // remember it for the next launch (the old 말랑이 toy is reachable by link only and is not remembered)
  if (findFidget(id)) { settings.set('lastFidget', id); settings.set('lastCategory', 'fidget'); }
  else if (id === 'keyboard') settings.set('lastCategory', 'keyboard');
  const changed = id !== currentId;
  currentId = id;
  if (changed) soundTouched = false; // the chip belongs to this visit of this toy
  syncSoundStatus();
  if (id !== 'squishy') category = id === 'keyboard' ? 'keyboard' : 'fidget';
  syncDock(changed);
  document.title = `${TOY_TITLES[id]} · 만지작`;
  if (changed) buildVariants(id);
  variants.setAttribute('role', id === 'squishy' ? 'radiogroup' : 'group');
  variants.setAttribute('aria-label', id === 'squishy' ? '색상' : '장난감 조작');
  if (!toys[id]) rt?.setToy(null); // the previous toy must not keep taking input while this one loads
  warmAudio(id);
  let toy: Awaited<ReturnType<typeof getToy>>;
  try {
    toy = await getToy(id);
  } catch (e) {
    console.warn('toy load failed', id, e);
    if (seq !== routeSeq) return;
    currentId = ''; // tapping the same toy again retries
    showNotice('불러오지 못했어요. 네트워크를 확인하고 다시 눌러주세요');
    setDockOpen(true);
    reveal();
    return;
  }
  if (seq !== routeSeq || !toy || !rt) return;
  rt.canvas.setAttribute('aria-label', `${TOY_TITLES[id]} — ${TOY_HINTS[id]}`);
  rt.canvas.setAttribute('role', 'img');
  rt.setToy(toy);
  syncSoundStatus();
  warmWhenReady();
  // the page around the stage takes the toy's backdrop colour, so the header and dock do not frame the canvas as a box
  const bg = toy.scene.background as { getHexString?: () => string } | null;
  if (bg?.getHexString) {
    const hex = '#' + bg.getHexString();
    document.documentElement.style.setProperty('--stage-bg', hex);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex);
  }
  requestAnimationFrame(() => requestAnimationFrame(reveal)); // after the toy's first frame is on screen
}
window.addEventListener('hashchange', () => void route());
/** Switch toy in place (no history entry, no reload). Choosing the current toy again only retries a failed load. */
function go(hash: string): void {
  if (location.hash !== hash) history.replaceState(null, '', hash);
  void route();
}

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const el = target.closest<HTMLElement>('[data-action]');
  const a = el?.dataset.action;
  if (a === 'settings') openSheet();
  if (a === 'close-sheet') closeSheet();
  if (a === 'sound') settings.set('sound', !settings.get().sound);
  if (a === 'reset') rt?.toy?.reset();
  // the keyboard toy ignores key presses while a button has focus: after a pointer click (header, dock), hand the physical keys back.
  // Keyboard-driven clicks (detail 0) keep focus for keyboard navigation.
  const btn = target.closest<HTMLButtonElement>('button');
  if (btn && e.detail > 0 && a !== 'settings' && !btn.closest('#sheet')) btn.blur();
});

function showNotice(text: string): void {
  const n = document.createElement('div');
  n.className = 'notice';
  n.textContent = text;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 3200);
}

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
  if (!rt?.toy) return;
  showNotice('소리가 안 들리면 무음 모드·볼륨을 확인하세요');
};

// ---------- brand splash ----------
const splash = $('#splash');
let revealed = false;
/** Fade the brand out once the first toy is drawn (or failed). No minimum time: it leaves as soon as the app is ready. */
function reveal(): void {
  if (revealed) return;
  revealed = true;
  splash.classList.add('out');
  setTimeout(() => splash.remove(), 400);
}
// never a stuck splash: on a very slow first load the dock and header show while the toy is still arriving
setTimeout(reveal, 4000);

// ---------- dock: category switch + toy picker ----------
const dock = $('#dock');
const toyList = $('#toy-list');
const dockToggle = $('#dock-toggle');
/** Real render of the toy (scripts/make-thumbs.mjs → public/thumbs/menu/<name>.jpg) over a CSS-drawn fallback shown while it loads. */
const thumbSrc = (name: string) => `./thumbs/menu/${name}.jpg`;
const thumbImage = (src: string) => {
  const img = document.createElement('img');
  img.className = 'shot'; img.alt = ''; img.width = img.height = 128; img.decoding = 'async'; img.draggable = false; img.src = src;
  img.onerror = () => img.remove();
  return img;
};
const hexColor = (c: number) => '#' + c.toString(16).padStart(6, '0');
function dockItem(key: string, name: string, thumb: HTMLElement, onPick: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'toy-item'; b.dataset.key = key;
  b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
  const label = document.createElement('span'); label.className = 'name'; label.textContent = name;
  const number = document.createElement('span'); number.className = 'item-number'; number.textContent = String(toyList.children.length + 1).padStart(2, '0'); number.setAttribute('aria-hidden', 'true');
  const selected = document.createElement('span'); selected.className = 'item-selected'; selected.setAttribute('aria-hidden', 'true'); selected.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12"><path d="m2.5 6 2.2 2.2 4.8-4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  b.append(number, thumb, label, selected);
  b.onclick = () => onPick(b);
  return b;
}
let listCategory: Category | null = null;
function buildList(c: Category): void {
  listCategory = c;
  toyList.replaceChildren();
  toyList.scrollLeft = 0;
  if (c === 'keyboard') {
    for (const p of enabledPresets()) {
      const thumb = document.createElement('div'); thumb.className = 'thumb preview-keyboard';
      for (const color of KEYBOARD_COLORS[p].keys.slice(0, 9)) { const key = document.createElement('i'); key.style.background = hexColor(color); thumb.append(key); }
      thumb.append(thumbImage(thumbSrc('kb-' + p)));
      const b = dockItem(p, KEY_PRESET_INFO[p].label, thumb, pickPreset);
      b.title = KEY_PRESET_INFO[p].desc; // the keycap description stays as the hover text, as on the old preset chips
      toyList.append(b);
    }
  } else {
    for (const f of FIDGETS) {
      const thumb = document.createElement('div'); thumb.className = 'thumb preview-fidget ' + f.shape; thumb.style.setProperty('--toy-color', hexColor(f.color));
      const shape = document.createElement('i'); thumb.append(shape, thumbImage(thumbSrc(f.id)));
      // dev only: the reference app's thumbnails (not for the cheese nor the chocolate, see git history of the home cards)
      if (LOCAL_FIDGETS && f.shape !== 'cheese' && f.shape !== 'chocolate') { const image = document.createElement('img'); image.src = '/__local-fidgets/thumbs/' + f.id + '.png'; image.alt = ''; image.onload = () => shape.hidden = true; image.onerror = () => image.remove(); thumb.append(image); }
      toyList.append(dockItem(f.id, f.name, thumb, () => go('#/' + f.id)));
    }
  }
}
function pickPreset(b: HTMLButtonElement): void {
  const p = b.dataset.key as KeyPresetId;
  settings.set('keyPreset', p);
  toys.keyboard?.setPreset?.(p);
  if (isLocalKeyPreset(p) || p === 'turquoise-tealios' || p === 'ibm-buckling-spring') {
    b.dataset.loadState = 'loading'; b.setAttribute('aria-busy', 'true');
    void loadKeyboardSamples(audio.ctx, p).then(() => { b.dataset.loadState = 'ready'; b.removeAttribute('aria-busy'); }, () => {
      b.dataset.loadState = 'error'; b.removeAttribute('aria-busy'); b.title = `${KEY_PRESET_INFO[p].desc} · 불러오지 못함, 다시 누르면 재시도`;
    });
  }
  go(`#/keyboard/${p}`);
}
/** Mark the current category and toy; with `scroll`, bring the chosen card into view (launch, category switch). */
function syncDock(scroll: boolean): void {
  if (listCategory !== category) { buildList(category); scroll = true; }
  dock.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.category === category)));
  const key = category === 'keyboard' ? (currentId === 'keyboard' ? settings.get().keyPreset : '') : currentId;
  let sel: HTMLButtonElement | null = null;
  toyList.querySelectorAll<HTMLButtonElement>('.toy-item').forEach((b) => { const on = b.dataset.key === key; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; if (on) sel = b; });
  if (!sel) toyList.querySelector<HTMLButtonElement>('.toy-item')?.setAttribute('tabindex', '0');
  $('#dock-current').textContent = TOY_TITLES[currentId] === '키보드' ? KEY_PRESET_INFO[settings.get().keyPreset].label : TOY_TITLES[currentId] ?? '';
  $('#now-name').textContent = $('#dock-current').textContent;
  // 말랑이 show their name only; the keyboard keeps its '키보드' label above the keycap name
  $('#now-category').textContent = currentId === 'keyboard' ? '키보드' : '';
  $('#now-category').classList.toggle('blank', currentId !== 'keyboard');
  // only the 왁뿌볼 (shells that crack open) and plastic slime (stays stretched) need a way back; the others settle on their own
  $('[data-action="reset"]').hidden = !(findFidget(currentId)?.category === '왁뿌볼' || findFidget(currentId)?.plastic);
  if ($('#collection-count').textContent !== `${toyList.children.length}가지`) $('#collection-count').textContent = `${toyList.children.length}가지`;
  if (scroll && sel && settings.get().dockOpen) {
    // centre the selection in the list, whichever way it scrolls (a row under the stage, or the rail's grid on wide short screens)
    const s = (sel as HTMLButtonElement).getBoundingClientRect(), l = toyList.getBoundingClientRect();
    toyList.scrollLeft += s.left - l.left - (l.width - s.width) / 2;
    toyList.scrollTop += s.top - l.top - (l.height - s.height) / 2;
  }
}
// fetch the other category's thumbnails once the browser is idle (≈140 KB in all), so a category switch shows them at once
{
  const warm = () => {
    for (const f of FIDGETS) new Image().src = thumbSrc(f.id);
    for (const p of enabledPresets()) new Image().src = thumbSrc('kb-' + p);
  };
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(warm, { timeout: 3000 }); else setTimeout(warm, 1500);
}
// category switch opens that category's last toy at once
dock.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.category === 'keyboard') go(`#/keyboard/${settings.get().keyPreset}`);
  else go('#/' + fidgetChoice());
}));
// arrow keys move within the radio groups (one tab stop each)
for (const group of [toyList, dock.querySelector<HTMLElement>('.cat-seg')!]) {
  group.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    const items = [...group.querySelectorAll<HTMLButtonElement>('button')];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[(i + step + items.length) % items.length];
    if (!next) return;
    e.preventDefault(); e.stopPropagation();
    next.focus(); next.click();
  });
}
// a mouse wheel scrolls the row sideways (trackpads already send horizontal deltas)
toyList.addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || toyList.scrollWidth <= toyList.clientWidth) return;
  toyList.scrollLeft += e.deltaY;
  e.preventDefault();
}, { passive: false });
// folding: the stage takes the freed height (ResizeObserver above), the toy re-fits once
function setDockOpen(open: boolean): void {
  settings.set('dockOpen', open);
  document.documentElement.classList.toggle('dock-folded', !open);
  dockToggle.setAttribute('aria-expanded', String(open));
  $('#dock-toggle-label').textContent = open ? '접기' : '펼치기';
  dockToggle.setAttribute('aria-label', open ? '장난감 목록 접기' : '장난감 목록 펼치기');
  $('#dock-body').inert = !open;
  if (open) syncDock(true);
}
dockToggle.addEventListener('click', () => setDockOpen(!settings.get().dockOpen));
// the stage ends where the dock begins, whatever the dock's size on this screen: below it (--dock-h), or beside it when ui.css
// turns it into a rail on wide short screens (--rail: 1 → --dock-w). The observer also fires when the layout switches (rotation, fold).
const syncDockBox = () => {
  const rail = getComputedStyle(dock).getPropertyValue('--rail').trim() === '1';
  const root = document.documentElement.style;
  root.setProperty('--dock-h', rail ? '0px' : `${dock.offsetHeight}px`);
  root.setProperty('--dock-w', rail ? `${dock.offsetWidth}px` : '0px');
};
new ResizeObserver(syncDockBox).observe(dock);
syncDockBox();
setDockOpen(settings.get().dockOpen);

if (import.meta.env.DEV) (window as unknown as { __MANZIZAK__: unknown }).__MANZIZAK__ = {
  report: () => rt?.toy?.report?.(), audio: () => audio.playLogs.slice(-100), frames: () => rt?.framesRendered ?? 0,
  // frame interval / main-thread work / input→frame delay (ms) over the last ≤600 frames — read by scripts/responsive-check.mjs
  perf: () => rt && { interval: [rt.frameIntervals.percentile(50), rt.frameIntervals.percentile(95)], work: [rt.workTimes.percentile(50), rt.workTimes.percentile(95)], input: [rt.inputDelays.percentile(50), rt.inputDelays.percentile(95)], dpr: rt.renderer.getPixelRatio(), canvas: [rt.width, rt.height] },
  resetPerf: () => { if (rt) for (const r of [rt.frameIntervals, rt.workTimes, rt.inputDelays]) r.clear(); },
};
applySettings(settings.get());
void route();
