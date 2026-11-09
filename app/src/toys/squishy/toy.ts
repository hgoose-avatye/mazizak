import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { InputEvt } from '../../core/runtime';
import type { Toy, ToyContext } from '../../core/toy';
import type { ContinuousSound } from '../../core/audio';
import { buildSquishySounds } from '../../audio/sfx';
import { loadSquishySamples } from '../../audio/squishySamples';
import { param } from '../../core/params';
import { radialShadowTexture, studioEnvironment } from '../../core/studio';
import { settings } from '../../core/settings';
import { numParam } from '../../core/params';
import { round } from '../../core/metrics';
import { DEFAULT_PARAMS, SquishyModel, type SquishyParams } from './model';
import { createSquishyMaterial } from './material';

export interface SquishyColor {
  id: string;
  label: string;
  color: number;
  sss: number;
  tint: [number, number, number];
}

export const SQUISHY_COLORS: SquishyColor[] = [
  { id: 'pink', label: '핑크', color: 0xf0a0b2, sss: 0xff7f98, tint: [0.93, 0.84, 0.87] },
  { id: 'mint', label: '민트', color: 0x9adbc4, sss: 0x5fe0b5, tint: [0.84, 0.93, 0.89] },
  { id: 'lavender', label: '라벤더', color: 0xbcaee8, sss: 0xa07cff, tint: [0.89, 0.86, 0.95] },
  { id: 'lemon', label: '레몬', color: 0xf3dc86, sss: 0xffc23f, tint: [0.95, 0.9, 0.78] },
];

const SCALE_Y = 0.8;

export function createSquishy(ctx: ToyContext): Toy & { setColor(id: string): void } {
  const P: SquishyParams = { ...DEFAULT_PARAMS };
  for (const k of Object.keys(P) as (keyof SquishyParams)[]) P[k] = numParam(k, P[k]);
  const DETAIL = Math.round(numParam('detail', 48));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e4dd);
  scene.environment = studioEnvironment(ctx.renderer);
  scene.environmentIntensity = 1.0;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const key = new THREE.DirectionalLight(0xfff4ea, 1.3);
  key.position.set(-2.5, 4, 3);
  scene.add(key);

  // ----- geometry: uniform icosphere, flattened base (generic "jelly mochi" form) -----
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, DETAIL);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-5);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i) * SCALE_Y;
    let z = pos.getZ(i);
    const flat = -0.5;
    if (y < flat) y = flat + (y - flat) * 0.22;
    const widen = 1 + 0.06 * Math.max(0, -y);
    x *= widen;
    z *= widen;
    pos.setXYZ(i, x, y, z);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  g.computeVertexNormals();
  const baseY = minY;
  const height = maxY - minY;

  const { material, uniforms } = createSquishyMaterial(SQUISHY_COLORS[0].color, SQUISHY_COLORS[0].sss);
  uniforms.uBaseY.value = baseY;
  uniforms.uCenter.value.set(0, baseY + height * 0.45, 0);
  const blob = new THREE.Mesh(g, material);
  blob.position.y = -baseY;
  blob.frustumCulled = false;
  scene.add(blob);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 2.7),
    new THREE.MeshBasicMaterial({ map: radialShadowTexture(0.9, 0.38), transparent: true, depthWrite: false, opacity: 0.6 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  scene.add(shadow);

  const setColor = (id: string) => {
    const c = SQUISHY_COLORS.find((k) => k.id === id) ?? SQUISHY_COLORS[0];
    material.color.set(c.color);
    uniforms.uSSS.value.set(c.sss);
    uniforms.uPressTint.value.setRGB(...c.tint);
    ctx.requestFrame();
  };
  setColor(settings.get().squishyColor);

  // ----- camera fit -----
  const target = new THREE.Vector3(0, height * 0.42, 0);
  const resize = (w: number, h: number) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const distW = 1.2 / (Math.tan(vfov / 2) * camera.aspect * 0.8);
    const avail = Math.max(0.45, (h - 150) / h);
    const distH = (height * 0.75) / (Math.tan(vfov / 2) * 0.5 * Math.min(1, avail / 0.8));
    const dist = Math.max(distW, distH);
    camera.position.copy(target).addScaledVector(new THREE.Vector3(0, 0.5, 1).normalize(), dist);
    camera.lookAt(target);
  };

  // ----- model + picking -----
  const model = new SquishyModel(P);
  model.restHeight = height;
  const ray = new THREE.Raycaster();
  const invMat = new THREE.Matrix4();
  const unitSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const ndc = (x: number, y: number) => {
    const { w, h } = ctx.size();
    return new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1);
  };
  function pick(x: number, y: number): { local: THREE.Vector3; normal: THREE.Vector3 } | null {
    ray.setFromCamera(ndc(x, y), camera);
    blob.updateMatrixWorld();
    invMat.copy(blob.matrixWorld).invert();
    const r = ray.ray.clone().applyMatrix4(invMat);
    const sr = new THREE.Ray(
      new THREE.Vector3(r.origin.x, r.origin.y / SCALE_Y, r.origin.z),
      new THREE.Vector3(r.direction.x, r.direction.y / SCALE_Y, r.direction.z).normalize(),
    );
    const hit = sr.intersectSphere(unitSphere, new THREE.Vector3());
    if (!hit) return null;
    return {
      local: new THREE.Vector3(hit.x, Math.max(hit.y * SCALE_Y, baseY + 0.05), hit.z),
      normal: new THREE.Vector3(hit.x, hit.y / SCALE_Y, hit.z).normalize(),
    };
  }
  const anchorsWorld = new Map<number, THREE.Vector3>();
  const plane = new THREE.Plane();
  function dragDelta(id: number, x: number, y: number): THREE.Vector3 | null {
    const aw = anchorsWorld.get(id);
    if (!aw) return null;
    ray.setFromCamera(ndc(x, y), camera);
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), aw);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return null;
    return blob.worldToLocal(hit).sub(blob.worldToLocal(aw.clone()));
  }

  // ----- sounds: recording-based samples (synth only if ?sfx=synth or samples fail to load) -----
  let friction: ContinuousSound | null = null;
  let stretchSnd: ContinuousSound | null = null;
  let soundSource: 'samples' | 'synth' | 'loading' = 'loading';
  const useSynth = () => {
    const sfx = buildSquishySounds(ctx.audio.ctx);
    ctx.audio.register('sq:touch', sfx.press);
    ctx.audio.register('sq:compress', sfx.pressHard);
    ctx.audio.register('sq:recover', sfx.release);
    friction = ctx.audio.createLoop(sfx.friction);
    stretchSnd = ctx.audio.createLoop(sfx.stretch);
    soundSource = 'synth';
  };
  if (param('sfx', 'samples') === 'synth') useSynth();
  else
    loadSquishySamples(ctx.audio.ctx).then(
      (s) => {
        ctx.audio.register('sq:touch', s.touch);
        ctx.audio.register('sq:compress', s.compress);
        ctx.audio.register('sq:recover', s.recover);
        friction = ctx.audio.createLoop(s.rub);
        stretchSnd = ctx.audio.createLoop(s.stretch);
        soundSource = 'samples';
      },
      (err) => {
        console.warn('squishy samples failed, using synthesized fallback', err);
        useSynth();
      },
    );
  const compressed = new Set<number>(); // pointers whose deep-compression sound already played
  // one recover voice at a time; cut it when the user presses again / resets / leaves
  let recoverStop: ((fade?: number) => void) | undefined;
  const stopRecover = () => {
    recoverStop?.(0.12);
    recoverStop = undefined;
  };
  let rubOn = false;

  const screenPos = new Map<number, { x: number; y: number; t: number }>();
  let dragSpeed = 0;
  let pinch0 = 0;
  let lastStretch = 1;
  let touchedOnce = false;
  let demoTimer = 0;

  const inputImmediate = (e: InputEvt, raw: Event) => {
    if (e.kind === 'down') {
      touchedOnce = true;
      if (model.touchingCount() < 2 && pick(e.x, e.y)) {
        // finger lands on the surface: soft contact, quieter for an additional finger
        stopRecover();
        const busy = model.touchingCount() > 0;
        ctx.audio.play('sq:touch', { detuneCents: soundSource === 'samples' ? 12 : 35, gainJitterDb: 1.5, gainDb: (soundSource === 'samples' ? 3 : 0) + (busy ? -4 : 0) }, raw.type);
        ctx.haptic(8);
      }
      compressed.delete(e.id);
      screenPos.set(e.id, { x: e.x, y: e.y, t: e.t });
    } else if (e.kind === 'move') {
      const lp = screenPos.get(e.id);
      if (lp && e.t > lp.t) {
        const v = Math.hypot(e.x - lp.x, e.y - lp.y) / ((e.t - lp.t) / 1000);
        dragSpeed = dragSpeed * 0.7 + v * 0.3;
      }
      screenPos.set(e.id, { x: e.x, y: e.y, t: e.t });
    } else {
      screenPos.delete(e.id);
      compressed.delete(e.id);
      void raw;
    }
  };

  const anchors = uniforms.uAnchor.value;
  const normals = uniforms.uCNormal.value;
  const depths = uniforms.uDepth.value;
  const slides = uniforms.uSlide.value;
  const tmp = new THREE.Vector3();

  const frame = (dt: number, input: InputEvt[]): boolean => {
    const wall = performance.now();
    for (const e of input) {
      if (e.kind === 'down') {
        const hit = pick(e.x, e.y);
        if (hit && model.press(e.id, hit.local, hit.normal, wall)) anchorsWorld.set(e.id, blob.localToWorld(hit.local.clone()));
      } else if (e.kind === 'move') {
        const d = dragDelta(e.id, e.x, e.y);
        if (d) model.drag(e.id, d);
      } else {
        const c = model.release(e.id, wall);
        anchorsWorld.delete(e.id);
        if (c && e.id !== -77) {
          // slow recovery whisper: starts as the dent begins to rise, length ≈ recovery
          const strength = Math.min(1, c.depthAtRelease / P.holdDepth);
          const heldS = c.releaseSim - c.downSim;
          // only a real squeeze earns the slow "rising" whisper (not every quick tap)
          if (strength > 0.5 || heldS > 0.3) {
            stopRecover();
            const rate = THREE.MathUtils.clamp(1.6 / Math.max(0.8, c.predicted * 0.75), 0.85, 1.12);
            recoverStop = ctx.audio.play('sq:recover', { delaySec: c.delay * 0.6, rate, gainDb: soundSource === 'samples' ? -3 + strength * 5 : -14 + strength * 12, gainJitterDb: 1 }, 'release')?.stop;
          }
        }
      }
    }
    // deep compression: once per press, when the finger has pushed past ~55% of max depth
    for (const c of model.contacts) {
      if (!c.touching || c.pointerId === -77 || compressed.has(c.pointerId)) continue;
      if (c.depth.x > P.holdDepth * 0.55) {
        compressed.add(c.pointerId);
        ctx.audio.play('sq:compress', { detuneCents: soundSource === 'samples' ? 10 : 25, gainJitterDb: 1.5, gainDb: soundSource === 'samples' ? 0 : -2 }, 'hold');
      }
    }

    // two-finger stretch / pinch
    const touching = model.contacts.filter((c) => c.touching);
    if (touching.length === 2) {
      const a = screenPos.get(touching[0].pointerId);
      const b = screenPos.get(touching[1].pointerId);
      if (a && b) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (!model.stretching) pinch0 = Math.max(30, d);
        tmp.copy(touching[1].anchor).sub(touching[0].anchor);
        tmp.y *= 0.3;
        model.setStretch(d / pinch0, tmp);
      }
    } else if (model.stretching) {
      model.endStretch();
    }

    // idle demo: one gentle self-press if the user hasn't touched for a while
    demoTimer += dt;
    if (!touchedOnce && !settings.get().reduceMotion && demoTimer > 3.2 && demoTimer < 3.2 + dt * 1.5 && !model.isTouching(-77))
      model.press(-77, new THREE.Vector3(0.05, baseY + height * 0.98, 0.25), new THREE.Vector3(0.05, 1, 0.3).normalize());
    if (model.isTouching(-77) && (demoTimer > 3.55 || touchedOnce || settings.get().reduceMotion)) model.release(-77);

    const moving = model.update(dt, wall);
    uniforms.uSquash.value = model.writeUniforms(anchors, normals, depths, slides);
    uniforms.uRadius.value = P.radius;
    uniforms.uBulge.value = P.bulge;
    uniforms.uStretch.value = model.stretch.x;
    uniforms.uStretchAxis.value.copy(model.stretchAxis);
    const sq = uniforms.uSquash.value;
    const st = Math.max(0, model.stretch.x - 1);
    shadow.scale.set(1 + sq * 0.7 + st * 0.6, 1 + sq * 0.7 + st * 0.3, 1);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.min(0.3, sq * 0.8);

    // continuous textures
    const nTouch = model.touchingCount();
    let lvl = nTouch > 0 ? Math.min(1, Math.max(0, (dragSpeed - 60) / 900)) : 0;
    // hysteresis: start above 0.03, stop below 0.008 (no rapid on/off near threshold)
    if (!rubOn && lvl > 0.03) rubOn = true;
    else if (rubOn && lvl < 0.008) rubOn = false;
    if (!rubOn) lvl = 0;
    friction?.set(rubOn ? Math.max(lvl, 0.002) * 0.8 : 0, Math.min(1, dragSpeed / 1500));
    const stretchRate = Math.abs(model.stretch.x - lastStretch) / Math.max(dt, 1e-3);
    lastStretch = model.stretch.x;
    stretchSnd?.set(model.stretching ? Math.min(1, stretchRate * 1.2) : 0, Math.min(1, 0.4 + st * 1.5));
    dragSpeed *= 0.88;

    return moving || lvl > 0.001 || (!touchedOnce && demoTimer < 4.5) || model.isTouching(-77);
  };

  return {
    id: 'squishy',
    scene,
    camera,
    resize,
    inputImmediate,
    frame,
    setColor,
    reset() {
      stopRecover();
      model.reset();
      ctx.requestFrame();
    },
    enter() {
      ctx.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      // entry bounce: start a little tall and settle
      model.jiggle.snap(0);
      model.jiggle.x = settings.get().reduceMotion ? 0 : -0.16;
      ctx.requestFrame();
    },
    leave() {
      stopRecover();
      model.reset();
      screenPos.clear();
      anchorsWorld.clear();
      friction?.set(0, 0);
      stretchSnd?.set(0, 0);
    },
    stats() {
      const last = model.releases[model.releases.length - 1];
      return {
        depth: `${model.contacts.filter((c) => c.inUse).map((c) => round(c.depth.x, 2)).join(' ') || '-'} squash ${round(model.jiggle.x, 3)} stretch ${round(model.stretch.x, 2)}`,
        last: last
          ? `hold ${round(last.holdMs, 0)}ms peak ${round(last.peakCompressionPct, 1)}% recover ${round(last.settleMsWall, 0)}ms (model ${round(last.predictedMs, 0)}) overs ${last.overshoots}`
          : '-',
        mesh: `verts ${g.getAttribute('position').count}`,
        sound: soundSource,
      };
    },
    report() {
      return {
        soundSource,
        params: P,
        meshVertices: g.getAttribute('position').count,
        releases: model.releases.slice(-30).map((r) => ({
          holdMs: round(r.holdMs, 0),
          peakCompressionPct: round(r.peakCompressionPct, 1),
          pressRiseMsSim: r.pressRiseMsSim === null ? null : round(r.pressRiseMsSim, 1),
          settleMsSim: round(r.settleMsSim, 0),
          settleMsWall: round(r.settleMsWall, 0),
          predictedMs: round(r.predictedMs, 0),
          delayMs: round(r.delayMs, 0),
          slowTauMs: round(r.slowTauMs, 0),
          overshoots: r.overshoots,
        })),
        soundPlays: ctx.audio.playLogs.slice(-20),
      };
    },
  };
}
