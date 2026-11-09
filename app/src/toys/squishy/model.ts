import { Vector3 } from 'three';
import { Spring } from '../../core/spring';

/**
 * Slow-rising FOAM squishy — dent model (no rendering).
 *
 * Physical idea (viscoelastic foam, simplified to two relaxation terms):
 *   while pressed : the surface follows the finger softly but immediately (critically damped);
 *                   holding longer creeps deeper (time = strength, no force API).
 *   after release : the dent is NOT a spring. A small elastic part relaxes at once
 *                   (fast term), the rest is viscous: it stays briefly, then rises
 *                   slowly and monotonically (no overshoot, no bounce).
 *
 *   remaining(t) = a·e^(−t/τf) + (1−a)·e^(−u(t)/τs),   u(t) = t − δ·(1 − e^(−t/δ))
 *
 * u(t) gives a smooth "hold, then rise" (zero initial slope of the slow part).
 * δ and τs grow with how long and how deep the press was, so a long deep press
 * leaves a dent that lingers and recovers more slowly than a quick tap.
 * Each released dent keeps its own clock, so several dents can recover at once;
 * pressing again on a recovering dent continues from its current depth.
 * All numbers are tuning start values, not measured material properties.
 */
export interface SquishyParams {
  radius: number;
  pressDepth: number;
  holdDepth: number;
  /** creep time constant while held */
  holdTau: number;
  maxSlide: number;
  /** finger-follow spring while pressed (critically damped) */
  pressFreq: number;
  /** elastic fraction that relaxes immediately on release */
  elasticFrac: number;
  elasticTau: number;
  /** slow (viscous) recovery: base + contributions from hold time and depth */
  slowTauBase: number;
  slowTauHold: number;
  slowTauDepth: number;
  /** "stays a moment" delay: base + hold contribution */
  delayBase: number;
  delayHold: number;
  squashGain: number;
  bulge: number;
}

export const DEFAULT_PARAMS: SquishyParams = {
  radius: 0.7,
  pressDepth: 0.16,
  holdDepth: 0.42,
  holdTau: 0.9,
  maxSlide: 0.3,
  pressFreq: 7,
  elasticFrac: 0.18,
  elasticTau: 0.07,
  slowTauBase: 0.38,
  slowTauHold: 0.22,
  slowTauDepth: 0.2,
  delayBase: 0.12,
  delayHold: 0.25,
  squashGain: 0.22,
  bulge: 0.07,
};

export const MAX_DENTS = 6;
const MAX_TOUCH = 2;
/** a dent counts as recovered when < 3% of its release depth remains */
const DONE_FRACTION = 0.03;

export interface ReleaseRecord {
  holdMs: number;
  peakDepth: number;
  peakCompressionPct: number;
  depthAtRelease: number;
  /** model recovery time to 3% remaining (sim clock) */
  settleMsSim: number;
  settleMsWall: number;
  /** predicted by the closed form at release (for checking) */
  predictedMs: number;
  delayMs: number;
  slowTauMs: number;
  /** count of times the dent went past rest (should stay 0 for foam) */
  overshoots: number;
  pressRiseMsSim: number | null;
}

/** fraction of the release displacement still remaining t seconds after release */
export function remainingFraction(t: number, a: number, tauF: number, tauS: number, delay: number): number {
  if (t <= 0) return 1;
  const u = delay > 1e-6 ? t - delay * (1 - Math.exp(-t / delay)) : t;
  return a * Math.exp(-t / tauF) + (1 - a) * Math.exp(-u / tauS);
}

/** time (s) until remainingFraction drops below `frac` (bisection, monotone function) */
export function recoveryTime(a: number, tauF: number, tauS: number, delay: number, frac = DONE_FRACTION): number {
  let lo = 0;
  let hi = 30;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (remainingFraction(mid, a, tauF, tauS, delay) > frac) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** A finger contact while touching; a recovering dent after release. */
export class Dent {
  pointerId = -1;
  touching = false;
  inUse = false;
  readonly anchor = new Vector3();
  readonly normal = new Vector3(0, 1, 0);
  readonly t1 = new Vector3();
  readonly t2 = new Vector3();
  /** live depth (finger-follow spring while touching; driven by the recovery curve after) */
  readonly depth = new Spring(0);
  readonly s1 = new Spring(0);
  readonly s2 = new Spring(0);
  downSim = 0;
  downWall = 0;
  holdStart = 0;
  releaseSim = 0;
  releaseWall = 0;
  peakDepth = 0;
  depthAtRelease = 0;
  s1AtRelease = 0;
  s2AtRelease = 0;
  tauS = 0.5;
  delay = 0.2;
  predicted = 0;
  overshoots = 0;
  pressRiseMs: number | null = null;
}

export class SquishyModel {
  readonly contacts: Dent[] = Array.from({ length: MAX_DENTS }, () => new Dent());
  /** global squash (vertical flattening), first-order follow — never bounces */
  readonly jiggle = new Spring(0);
  readonly stretch = new Spring(1);
  readonly stretchAxis = new Vector3(1, 0, 0);
  stretching = false;
  private stretchRelease = { t: -1, s0: 1, tauS: 0.5, delay: 0.15 };
  private stretchStart = 0;
  readonly releases: ReleaseRecord[] = [];
  private simTime = 0;
  restHeight = 1.6;

  constructor(public params: SquishyParams = { ...DEFAULT_PARAMS }) {}

  get time(): number {
    return this.simTime;
  }

  private setBasis(c: Dent, normal: Vector3): void {
    c.normal.copy(normal).normalize();
    const ref = Math.abs(c.normal.y) < 0.95 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    c.t1.crossVectors(c.normal, ref).normalize();
    c.t2.crossVectors(c.normal, c.t1).normalize();
  }

  press(pointerId: number, anchor: Vector3, normal: Vector3, wallMs = 0): boolean {
    if (this.touchingCount() >= MAX_TOUCH) return false;
    const p = this.params;
    // re-press on a recovering dent nearby → continue from its current depth (no pop)
    let c: Dent | undefined = this.contacts
      .filter((k) => k.inUse && !k.touching && k.anchor.distanceTo(anchor) < p.radius * 0.45)
      .sort((a, b) => a.anchor.distanceTo(anchor) - b.anchor.distanceTo(anchor))[0];
    const reuse = !!c;
    if (!c) c = this.contacts.find((k) => !k.inUse);
    if (!c) {
      // all slots busy: take the most-recovered dent (smallest remaining depth)
      c = this.contacts.filter((k) => !k.touching).sort((a, b) => Math.abs(a.depth.x) - Math.abs(b.depth.x))[0];
      if (!c) return false;
    }
    const keep = reuse ? { d: c.depth.x, s1: c.s1.x, s2: c.s2.x } : { d: 0, s1: 0, s2: 0 };
    c.inUse = true;
    c.touching = true;
    c.pointerId = pointerId;
    c.anchor.copy(anchor);
    this.setBasis(c, normal);
    c.depth.snap(keep.d);
    c.depth.target = keep.d;
    c.s1.snap(reuse ? keep.s1 : 0);
    c.s2.snap(reuse ? keep.s2 : 0);
    c.downSim = this.simTime;
    // creep continues from the depth we re-entered at (equivalent hold time)
    const frac = Math.min(0.999, Math.max(0, (keep.d - p.pressDepth) / (p.holdDepth - p.pressDepth)));
    c.holdStart = this.simTime + (keep.d > p.pressDepth ? p.holdTau * Math.log(1 - frac) : 0);
    c.downWall = wallMs;
    c.peakDepth = keep.d;
    c.overshoots = 0;
    c.pressRiseMs = null;
    return true;
  }

  drag(pointerId: number, delta: Vector3): void {
    const c = this.contacts.find((k) => k.touching && k.pointerId === pointerId);
    if (!c) return;
    const m = this.params.maxSlide * (this.stretching ? 0.35 : 1);
    c.s1.target = m * Math.tanh(delta.dot(c.t1) / m);
    c.s2.target = m * Math.tanh(delta.dot(c.t2) / m);
  }

  release(pointerId: number, wallMs = 0): Dent | null {
    const c = this.contacts.find((k) => k.touching && k.pointerId === pointerId);
    if (!c) return null;
    const p = this.params;
    c.touching = false;
    c.releaseSim = this.simTime;
    c.releaseWall = wallMs;
    c.depthAtRelease = Math.max(0, c.depth.x);
    c.s1AtRelease = c.s1.x;
    c.s2AtRelease = c.s2.x;
    const hn = Math.min(1, (this.simTime - c.downSim) / 1.5);
    const qn = Math.min(1, c.depthAtRelease / p.holdDepth);
    c.tauS = p.slowTauBase + p.slowTauHold * hn + p.slowTauDepth * qn;
    c.delay = p.delayBase + p.delayHold * hn;
    c.predicted = recoveryTime(p.elasticFrac, p.elasticTau, c.tauS, c.delay);
    return c;
  }

  isTouching(pointerId: number): boolean {
    return this.contacts.some((k) => k.touching && k.pointerId === pointerId);
  }

  touchingCount(): number {
    return this.contacts.filter((k) => k.touching).length;
  }

  /** current depth of the (touching) contact for a pointer, or 0 */
  depthOf(pointerId: number): number {
    return this.contacts.find((k) => k.touching && k.pointerId === pointerId)?.depth.x ?? 0;
  }

  setStretch(ratio: number, axis: Vector3): void {
    if (!this.stretching) this.stretchStart = this.simTime;
    this.stretching = true;
    this.stretchRelease.t = -1;
    if (axis.lengthSq() > 1e-6) this.stretchAxis.copy(axis).normalize();
    this.stretch.target = ratio >= 1 ? 1 + 0.36 * Math.tanh((ratio - 1) / 0.7) : 1 - 0.18 * Math.tanh((1 - ratio) / 0.25);
  }

  endStretch(): void {
    if (!this.stretching) return;
    this.stretching = false;
    const hn = Math.min(1, (this.simTime - this.stretchStart) / 1.5);
    this.stretchRelease = { t: this.simTime, s0: this.stretch.x, tauS: 0.42 + 0.25 * hn, delay: 0.1 + 0.2 * hn };
  }

  reset(): void {
    this.stretching = false;
    this.stretchRelease.t = -1;
    this.stretch.snap(1);
    for (const c of this.contacts) {
      c.inUse = false;
      c.touching = false;
      c.depth.snap(0);
      c.s1.snap(0);
      c.s2.snap(0);
    }
    this.jiggle.snap(0);
  }

  update(dt: number, wallMs = 0): boolean {
    const p = this.params;
    this.simTime += dt;
    const follow = { freq: p.pressFreq, damping: 1 };
    let moving = false;
    let depthSum = 0;

    for (const c of this.contacts) {
      if (!c.inUse) continue;
      if (c.touching) {
        const held = this.simTime - c.holdStart;
        const creep = p.pressDepth + (p.holdDepth - p.pressDepth) * (1 - Math.exp(-held / p.holdTau));
        c.depth.target = Math.max(creep * (this.stretching ? 0.4 : 1), 0);
        c.depth.params = follow;
        c.s1.params = follow;
        c.s2.params = follow;
        c.depth.step(dt);
        c.s1.step(dt);
        c.s2.step(dt);
        c.peakDepth = Math.max(c.peakDepth, c.depth.x);
        if (c.pressRiseMs === null && c.depth.x >= 0.9 * p.pressDepth) c.pressRiseMs = (this.simTime - c.downSim) * 1000;
        moving = true;
      } else {
        const t = this.simTime - c.releaseSim;
        const r = remainingFraction(t, p.elasticFrac, p.elasticTau, c.tauS, c.delay);
        c.depth.x = c.depthAtRelease * r;
        c.depth.v = 0;
        c.s1.x = c.s1AtRelease * r;
        c.s2.x = c.s2AtRelease * r;
        if (c.depth.x < -1e-4) c.overshoots++;
        if (r < DONE_FRACTION) {
          c.inUse = false;
          c.depth.snap(0);
          c.s1.snap(0);
          c.s2.snap(0);
          this.releases.push({
            holdMs: (c.releaseSim - c.downSim) * 1000,
            peakDepth: c.peakDepth,
            peakCompressionPct: (c.peakDepth / this.restHeight) * 100,
            depthAtRelease: c.depthAtRelease,
            settleMsSim: t * 1000,
            settleMsWall: wallMs - c.releaseWall,
            predictedMs: c.predicted * 1000,
            delayMs: c.delay * 1000,
            slowTauMs: c.tauS * 1000,
            overshoots: c.overshoots,
            pressRiseMsSim: c.pressRiseMs,
          });
          if (this.releases.length > 100) this.releases.shift();
        } else {
          moving = true;
        }
      }
      if (c.inUse) depthSum += Math.max(0, c.depth.x);
    }

    // stretch: follow while held; slow viscous return after (no bounce)
    if (this.stretching) {
      this.stretch.params = { freq: 6, damping: 1 };
      this.stretch.step(dt);
      moving = true;
    } else if (this.stretchRelease.t >= 0) {
      const sr = this.stretchRelease;
      const r = remainingFraction(this.simTime - sr.t, p.elasticFrac, p.elasticTau, sr.tauS, sr.delay);
      this.stretch.x = 1 + (sr.s0 - 1) * r;
      this.stretch.v = 0;
      if (r < DONE_FRACTION) {
        this.stretch.snap(1);
        sr.t = -1;
      } else moving = true;
    }

    // global flattening follows total remaining depth (first-order, monotone)
    const target = Math.min(0.26, depthSum * p.squashGain * (this.stretching ? 0.35 : 1));
    const tau = target > this.jiggle.x ? 0.08 : 0.2;
    this.jiggle.x += (target - this.jiggle.x) * (1 - Math.exp(-dt / tau));
    this.jiggle.target = target;
    if (Math.abs(this.jiggle.x - target) > 1e-3 || this.jiggle.x > 1e-3) moving = moving || Math.abs(this.jiggle.x - target) > 1e-4;
    return moving;
  }

  /** Write MAX_DENTS slots for the shader; returns global squash. */
  writeUniforms(anchors: Vector3[], normals: Vector3[], depths: number[], slides: Vector3[]): number {
    this.contacts.forEach((c, i) => {
      if (!c.inUse) {
        depths[i] = 0;
        slides[i].set(0, 0, 0);
        return;
      }
      anchors[i].copy(c.anchor);
      normals[i].copy(c.normal);
      depths[i] = c.depth.x;
      slides[i].copy(c.t1).multiplyScalar(c.s1.x).addScaledVector(c.t2, c.s2.x);
    });
    return this.jiggle.x;
  }
}
