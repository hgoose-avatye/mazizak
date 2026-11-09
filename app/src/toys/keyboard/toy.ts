import * as THREE from 'three';
import type { InputEvt } from '../../core/runtime';
import type { Toy, ToyContext } from '../../core/toy';
import { buildKeyboardSounds, type KeySwitchPreset, type KeyboardSounds } from '../../audio/sfx';
import { loadKeyboardSamples } from '../../audio/keyboardSamples';
import { param } from '../../core/params';
import { radialShadowTexture, studioEnvironment } from '../../core/studio';
import { settings } from '../../core/settings';
import { round, summarize } from '../../core/metrics';
import { hitTest, KeyboardModel, type KeyRect } from './model';
import { buildKeyboardVisual, type KeyboardVisual } from './visual';

export const KEY_PRESET_INFO: Record<KeySwitchPreset, { label: string; desc: string }> = {
  pebble: { label: '조약돌', desc: '묵직하고 둥근 저음' },
  clack: { label: '까랑까랑', desc: '선명하고 경쾌한 고음' },
};

const PHYS_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'KeyC', 'Space'];

export function createKeyboard(ctx: ToyContext): Toy & { setPreset(p: KeySwitchPreset): void } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e4dd);
  scene.environment = studioEnvironment(ctx.renderer);
  scene.environmentIntensity = 0.45;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  const vis: KeyboardVisual = buildKeyboardVisual(ctx.renderer);
  scene.add(vis.root);
  const SPACE = vis.keys.length - 1;

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(vis.size.x * 1.45, vis.size.z * 1.3),
    new THREE.MeshBasicMaterial({ map: radialShadowTexture(0.75, 0.45), transparent: true, depthWrite: false, opacity: 0.75 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  scene.add(shadow);

  const model = new KeyboardModel(vis.keys.length);
  const tilt = vis.keys.map(() => ({ x: 0, z: 0 }));

  // ----- camera + 2D hit rects -----
  const target = new THREE.Vector3(0, 0.45, 0.12);
  let rects: KeyRect[] = [];
  const computeRects = () => {
    const { w, h } = ctx.size();
    camera.updateMatrixWorld();
    rects = vis.keys.map((k, id) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const pts: [number, number, number][] = [];
      for (const dx of [-k.halfW, k.halfW]) {
        for (const dz of [-k.halfD, k.halfD]) pts.push([dx, k.topY, dz]);
        pts.push([dx, k.topY - 0.22, k.halfD]); // upper part of the visible front face
      }
      for (const [dx, y, dz] of pts) {
        const v = new THREE.Vector3(k.rest.x + dx, y, k.rest.z + dz).project(camera);
        const sx = ((v.x + 1) / 2) * w;
        const sy = ((1 - v.y) / 2) * h;
        x0 = Math.min(x0, sx);
        y0 = Math.min(y0, sy);
        x1 = Math.max(x1, sx);
        y1 = Math.max(y1, sy);
      }
      return { id, x0, y0, x1, y1 };
    });
  };
  const resize = (w: number, h: number) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const distW = (vis.size.x * 0.56) / (Math.tan(vfov / 2) * camera.aspect * 0.92);
    const avail = Math.max(0.45, (h - 150) / h);
    const distH = (vis.size.z * 0.62) / (Math.tan(vfov / 2) * 0.66 * Math.min(1, avail / 0.8));
    const dist = Math.max(distW, distH);
    camera.position.copy(target).addScaledVector(new THREE.Vector3(0, 1.55, 1).normalize(), dist);
    camera.lookAt(target);
    computeRects();
  };

  // ----- sound -----
  let preset: KeySwitchPreset = settings.get().keyPreset;
  const loaded = new Set<KeySwitchPreset>();
  const soundSource: Record<string, string> = {};
  /** presets whose sounds are registered, most recently ready last */
  const ready: KeySwitchPreset[] = [];
  const registerSet = (p: KeySwitchPreset, s: KeyboardSounds) => {
    ctx.audio.register(`kb:${p}:down`, s.down);
    ctx.audio.register(`kb:${p}:up`, s.up);
    ctx.audio.register(`kb:${p}:spaceDown`, s.spaceDown);
    ctx.audio.register(`kb:${p}:spaceUp`, s.spaceUp);
    if (!ready.includes(p)) ready.push(p);
  };
  /** While a just-selected preset is still loading, keep sounding the last ready one instead of going silent. */
  const audible = (p: KeySwitchPreset): KeySwitchPreset => (ready.includes(p) ? p : (ready[ready.length - 1] ?? p));
  // recording-based samples; synthesized set only with ?sfx=synth (A/B) or if loading fails
  const ensurePreset = (p: KeySwitchPreset) => {
    if (loaded.has(p)) return;
    loaded.add(p);
    if (param('sfx', 'samples') === 'synth') {
      registerSet(p, buildKeyboardSounds(ctx.audio.ctx, p));
      soundSource[p] = 'synth';
      return;
    }
    soundSource[p] = 'loading';
    loadKeyboardSamples(ctx.audio.ctx, p).then(
      (s) => {
        registerSet(p, s);
        soundSource[p] = 'samples';
      },
      (err) => {
        console.warn(`keyboard samples (${p}) failed, using synthesized fallback`, err);
        registerSet(p, buildKeyboardSounds(ctx.audio.ctx, p));
        soundSource[p] = 'synth';
      },
    );
  };
  ensurePreset(preset);
  let active = false;
  let prewarmed = false;
  const keyDetune = vis.keys.map((_, i) => ((i * 37) % 31) - 15);
  let lastDownAt = 0;
  const soundDown = (k: number, evType: string) => {
    const now = performance.now();
    const rapid = now - lastDownAt < 85;
    lastDownAt = now;
    const sp = audible(preset);
    heldPreset.set(k, sp);
    const name = k === SPACE ? `kb:${sp}:spaceDown` : `kb:${sp}:down`;
    const makeup = soundSource[sp] === 'samples' ? 6 : 0;
    ctx.audio.play(name, { baseDetune: keyDetune[k], detuneCents: 12, gainJitterDb: 1.2, gainDb: makeup + (rapid ? -2 : 0), pan: vis.keys[k].rest.x * 0.22 }, evType);
    ctx.haptic(6);
  };
  const heldPreset = new Map<number, KeySwitchPreset>();
  const soundUp = (k: number, evType: string) => {
    const pr = heldPreset.get(k) ?? audible(preset);
    heldPreset.delete(k);
    const name = k === SPACE ? `kb:${pr}:spaceUp` : `kb:${pr}:up`;
    const makeup = soundSource[pr] === 'samples' ? 6 : 0;
    ctx.audio.play(name, { baseDetune: keyDetune[k], detuneCents: 10, gainJitterDb: 1, gainDb: makeup, pan: vis.keys[k].rest.x * 0.22 }, evType);
  };

  const pressAt = (k: number, src: string, x: number, y: number, evType: string) => {
    if (!model.press(k, src)) return;
    const r = rects[k];
    const nx = r ? ((x - (r.x0 + r.x1) / 2) / ((r.x1 - r.x0) / 2)) : 0;
    const ny = r ? ((y - (r.y0 + r.y1) / 2) / ((r.y1 - r.y0) / 2)) : 0;
    tilt[k].x = THREE.MathUtils.clamp(ny, -1, 1) * 0.045;
    tilt[k].z = -THREE.MathUtils.clamp(nx, -1, 1) * (k === SPACE ? 0.012 : 0.045);
    soundDown(k, evType);
  };

  const inputImmediate = (e: InputEvt, raw: Event) => {
    const src = `p${e.id}`;
    if (e.kind === 'down') {
      const k = hitTest(rects, e.x, e.y, 8);
      if (k >= 0) pressAt(k, src, e.x, e.y, raw.type);
    } else if (e.kind === 'up' || e.kind === 'cancel') {
      const k = model.release(src);
      if (k >= 0) soundUp(k, raw.type);
    }
  };

  const onBlur = () => {
    model.reset();
    ctx.requestFrame();
  };
  const ignoreKeys = () => {
    const a = document.activeElement;
    const sheet = document.getElementById('sheet');
    return (sheet && !sheet.hidden) || (a instanceof HTMLElement && /^(BUTTON|INPUT|A|SELECT|TEXTAREA)$/.test(a.tagName));
  };
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey || ignoreKeys()) return;
    const k = PHYS_KEYS.indexOf(ev.code);
    if (k < 0) return;
    ev.preventDefault();
    if (model.press(k, `k${ev.code}`)) {
      tilt[k].x = 0;
      tilt[k].z = 0;
      soundDown(k, ev.type);
    }
    ctx.requestFrame();
  };
  const onKeyUp = (ev: KeyboardEvent) => {
    const k = model.release(`k${ev.code}`);
    if (k >= 0) soundUp(k, ev.type);
    ctx.requestFrame();
  };

  const frame = (dt: number): boolean => {
    const moving = model.update(dt);
    vis.keys.forEach((k, i) => {
      const t = model.travel(i);
      k.object.position.set(k.rest.x, k.rest.y - t * vis.travel, k.rest.z);
      const tt = Math.max(0, t);
      k.object.rotation.set(tilt[i].x * tt, 0, tilt[i].z * tt);
    });
    return moving;
  };

  return {
    id: 'keyboard',
    scene,
    camera,
    resize,
    inputImmediate,
    frame,
    setPreset(p) {
      preset = p;
      ensurePreset(p);
      vis.setStyle(p);
      ctx.requestFrame();
    },
    reset() {
      model.reset();
      ctx.requestFrame();
    },
    enter() {
      ctx.renderer.toneMapping = THREE.NeutralToneMapping;
      vis.setShadowQuality(settings.get().quality !== 'saver');
      vis.setStyle(preset);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      active = true;
      // once, after the first frames: precompile/upload the other key style so the first preset switch doesn't hitch
      if (!prewarmed) {
        const run = () => {
          if (!active || prewarmed) return;
          prewarmed = true;
          vis.prewarm(ctx.renderer, scene, camera);
        };
        const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
        setTimeout(() => (ric ? ric(run, { timeout: 1500 }) : run()), 300);
      }
    },
    leave() {
      active = false;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      model.reset();
    },
    stats() {
      const recs = model.records.slice(-50);
      const down = summarize(recs.map((r) => r.downMs).filter((v): v is number => v !== null));
      return { preset: KEY_PRESET_INFO[preset].label, held: model.downCount(), 'down→90%': `${down.p50}ms`, sound: soundSource[preset] ?? '-' };
    },
    report() {
      return {
        preset,
        soundSource,
        keyRecords: model.records.slice(-50).map((r) => ({ ...r, downMs: r.downMs === null ? null : round(r.downMs, 1), upSettleMs: r.upSettleMs === null ? null : round(r.upSettleMs, 1) })),
        soundPlays: ctx.audio.playLogs.slice(-30),
        keyRectsPx: rects.map((r) => ({ id: r.id, w: round(r.x1 - r.x0, 0), h: round(r.y1 - r.y0, 0), cx: round((r.x0 + r.x1) / 2, 0), cy: round((r.y0 + r.y1) / 2, 0) })),
      };
    },
  };
}
