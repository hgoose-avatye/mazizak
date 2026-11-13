import * as THREE from 'three';
import type { InputEvt } from '../../core/runtime';
import type { Toy, ToyContext } from '../../core/toy';
import { buildKeyboardSounds } from '../../audio/sfx';
import { EXTRA_KEY_ROLES, loadKeyboardSamples, type KeyboardSampleSounds } from '../../audio/keyboardSamples';
import { SYNTH_BASE, VISUAL_STYLE, type KeyPresetId } from '../../audio/keyPresets';
import { LOCAL_KEY_PRESETS, isLocalKeyPreset, isKeyPresetEnabled } from '../../audio/localKeyPresets';
import { topreRole, topreRow, isKbsimMappedPreset } from '../../audio/keyboardRouting';
import { param } from '../../core/params';
import { radialShadowTexture, studioEnvironment } from '../../core/studio';
import { settings } from '../../core/settings';
import { round, summarize } from '../../core/metrics';
import { hitTest, KeyboardModel, type KeyRect } from './model';
import { buildKeyboardVisual, type KeyboardVisual } from './visual';

export const KEY_PRESET_INFO: Record<KeyPresetId, { label: string; desc: string }> = {
  pebble: { label: '조약돌', desc: '묵직하고 둥근 저음' },
  clack: { label: '얼음', desc: '선명하고 경쾌한 고음' },
  'creamy-thocky': { label: '크림', desc: '부드럽고 크리미한 타건음 (My Sound Pack · Chevy · CC BY 4.0)' },
  topre: { label: '마시멜로', desc: 'kbs.im Topre · 행별 타건음과 전용 특수키 (MIT)' },
  'turquoise-tealios': { label: '민트', desc: 'K06 · kbsim 실록 · 행별 누름/공통 키업 · 특수키 전용 (MIT)' },
  'ibm-buckling-spring': { label: '타자기', desc: 'K10 · kbsim Buckling Spring 실록 · 행별 누름/공통 키업 · 특수키 전용 (MIT)' },
  ...Object.fromEntries(Object.entries(LOCAL_KEY_PRESETS).map(([id, p]) => [id, { label: p.label, desc: `${p.sensoryExpression} · ${p.onomatopoeia} · 로컬 검토용` }])) as Record<keyof typeof LOCAL_KEY_PRESETS, { label: string; desc: string }>,
};

const PHYS_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'KeyC', 'Space'];

export function createKeyboard(ctx: ToyContext): Toy & { setPreset(p: KeyPresetId): void } {
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
  // a stored id this build doesn't know (e.g. from a newer/older version) must not crash sound or style lookup
  let preset: KeyPresetId = settings.get().keyPreset in KEY_PRESET_INFO && isKeyPresetEnabled(settings.get().keyPreset) ? settings.get().keyPreset : 'pebble';
  const loaded = new Set<KeyPresetId>();
  const soundSource: Record<string, string> = {};
  /** presets whose sounds are registered, most recently ready last */
  const ready: KeyPresetId[] = [];
  const registerSet = (p: KeyPresetId, s: KeyboardSampleSounds) => {
    // an empty pool means "no sound for this role" (e.g. a preset without release sounds): leave it unregistered
    // so audio.play() returns null instead of picking from nothing
    for (const role of ['down', 'up', 'spaceDown', 'spaceUp'] as const) if (s[role].length) ctx.audio.register(`kb:${p}:${role}`, s[role]);
    for (const role of EXTRA_KEY_ROLES) if (s[role]?.length) ctx.audio.register(`kb:${p}:${role}`, s[role]!);
    s.rowDown?.forEach((buffer, row) => ctx.audio.register(`kb:${p}:downR${row}`, [buffer]));
    if (!ready.includes(p)) ready.push(p);
  };
  /** While a just-selected preset is still loading, keep sounding the last ready one instead of going silent. */
  const audible = (p: KeyPresetId): KeyPresetId => (ready.includes(p) ? p : (ready[ready.length - 1] ?? p));
  // recording-based samples; synthesized set only with ?sfx=synth (A/B) or if loading fails
  const ownRecordingOnly = (p: KeyPresetId) => isLocalKeyPreset(p) || p === 'turquoise-tealios' || p === 'ibm-buckling-spring';
  const ensurePreset = (p: KeyPresetId) => {
    if (loaded.has(p)) return;
    loaded.add(p);
    if (param('sfx', 'samples') === 'synth' && !ownRecordingOnly(p)) {
      registerSet(p, buildKeyboardSounds(ctx.audio.ctx, SYNTH_BASE[p]));
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
        if (ownRecordingOnly(p)) {
          soundSource[p] = 'error'; loaded.delete(p);
          console.warn(`Local keyboard samples (${p}) failed; no replacement sound`, err);
          return;
        }
        console.warn(`keyboard samples (${p}) failed, using synthesized fallback`, err);
        registerSet(p, buildKeyboardSounds(ctx.audio.ctx, SYNTH_BASE[p]));
        soundSource[p] = 'synth';
      },
    );
  };
  ensurePreset(preset);
  let active = false;
  let prewarmed = false;
  const keyDetune = vis.keys.map((_, i) => ((i * 37) % 31) - 15);
  let lastDownAt = 0;
  const roleName = (p: KeyPresetId, code: string, phase: 'Down' | 'Up') => {
    const specific = (isKbsimMappedPreset(p) || isLocalKeyPreset(p)) ? topreRole(code, phase) : undefined;
    if (specific && ctx.audio.has(`kb:${p}:${specific}`)) return `kb:${p}:${specific}`;
    return `kb:${p}:${code === 'Space' ? 'space' + phase : phase.toLowerCase()}`;
  };
  const soundDown = (k: number, evType: string, code = PHYS_KEYS[k], holdId = String(k)) => {
    const now = performance.now();
    const rapid = now - lastDownAt < 85;
    lastDownAt = now;
    if (ownRecordingOnly(preset) && soundSource[preset] !== 'samples') return;
    const sp = audible(preset);
    heldPreset.set(holdId, { preset: sp, code });
    const name = roleName(sp, code, 'Down');
    const makeup = soundSource[sp] === 'samples' ? 6 : 0;
    ctx.audio.play(name, { baseDetune: (isKbsimMappedPreset(sp) || isLocalKeyPreset(sp)) ? 0 : keyDetune[k], detuneCents: (isKbsimMappedPreset(sp) || isLocalKeyPreset(sp)) ? 0 : 12, gainJitterDb: 1.2, gainDb: makeup + (rapid ? -2 : 0), pan: vis.keys[k].rest.x * 0.22 }, evType);
    ctx.haptic(6);
  };
  const heldPreset = new Map<string, { preset: KeyPresetId; code: string }>();
  const heldPhysical = new Map<string, number>();
  const soundUp = (k: number, evType: string, holdId = String(k)) => {
    const held = heldPreset.get(holdId);
    if (!held && ownRecordingOnly(preset)) return;
    const pr = held?.preset ?? audible(preset);
    heldPreset.delete(holdId);
    const name = roleName(pr, held?.code ?? PHYS_KEYS[k], 'Up');
    const makeup = soundSource[pr] === 'samples' ? 6 : 0;
    ctx.audio.play(name, { baseDetune: (isKbsimMappedPreset(pr) || isLocalKeyPreset(pr)) ? 0 : keyDetune[k], detuneCents: (isKbsimMappedPreset(pr) || isLocalKeyPreset(pr)) ? 0 : 10, gainJitterDb: 1, gainDb: makeup, pan: vis.keys[k].rest.x * 0.22 }, evType);
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
    heldPhysical.clear();
    heldPreset.clear();
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
    if ((isKbsimMappedPreset(preset) || isLocalKeyPreset(preset)) && topreRole(ev.code, 'Down')) {
      ev.preventDefault();
      if (heldPhysical.has(ev.code) || model.keyOf(`k${ev.code}`) >= 0) return;
      const visible = PHYS_KEYS.indexOf(ev.code);
      const k = visible >= 0 ? visible : [0, 0, 0, 3, 6][topreRow(ev.code) ?? 4];
      if (visible >= 0) model.press(k, `k${ev.code}`);
      heldPhysical.set(ev.code, k);
      soundDown(k, ev.type, ev.code, `physical:${ev.code}`);
      ctx.requestFrame();
      return;
    }
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
    const physical = heldPhysical.get(ev.code);
    if (physical !== undefined) {
      heldPhysical.delete(ev.code);
      model.release(`k${ev.code}`);
      soundUp(physical, ev.type, `physical:${ev.code}`);
      ctx.requestFrame();
      return;
    }
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
      if (!isKeyPresetEnabled(p)) return;
      preset = p;
      ensurePreset(p);
      vis.setStyle(VISUAL_STYLE[p]);
      ctx.requestFrame();
    },
    reset() {
      heldPhysical.clear();
      heldPreset.clear();
      model.reset();
      ctx.requestFrame();
    },
    enter() {
      ctx.renderer.toneMapping = THREE.NeutralToneMapping;
      vis.setShadowQuality(settings.get().quality !== 'saver');
      vis.setStyle(VISUAL_STYLE[preset]);
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
          // fetch + decode the other presets while idle so a later switch has its own sound immediately
          for (const p of Object.keys(KEY_PRESET_INFO) as KeyPresetId[]) if (isKeyPresetEnabled(p) && !ownRecordingOnly(p)) ensurePreset(p);
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
      heldPhysical.clear();
      heldPreset.clear();
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
