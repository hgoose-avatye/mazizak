/**
 * Exact (closed-form) damped harmonic oscillator toward a target.
 *
 *   x'' = -ω² (x - target) - 2 ζ ω x'
 *
 * Because each step uses the analytic solution, the result depends only on
 * total elapsed time, not on how it is sliced into frames (60 Hz vs 120 Hz
 * produce the same trajectory as long as the target is constant during a step).
 */
export interface SpringParams {
  /** Natural frequency in Hz. */
  freq: number;
  /** Damping ratio ζ. <1 underdamped (bouncy), 1 critical, >1 overdamped. */
  damping: number;
}

export class Spring {
  x: number;
  v = 0;
  target: number;
  params: SpringParams;

  constructor(initial = 0, params: SpringParams = { freq: 4, damping: 1 }) {
    this.x = initial;
    this.target = initial;
    this.params = params;
  }

  step(dt: number): void {
    if (dt <= 0) return;
    const r = stepSpring(this.x - this.target, this.v, dt, this.params);
    this.x = r.y + this.target;
    this.v = r.v;
  }

  isSettled(posEps = 1e-3, velEps = 1e-2): boolean {
    return Math.abs(this.x - this.target) < posEps && Math.abs(this.v) < velEps;
  }

  snap(value: number): void {
    this.x = value;
    this.target = value;
    this.v = 0;
  }
}

/** Advance displacement y (=x-target) and velocity v by dt using the analytic solution. */
export function stepSpring(y0: number, v0: number, dt: number, p: SpringParams): { y: number; v: number } {
  const w = 2 * Math.PI * p.freq;
  const z = p.damping;
  if (w <= 0) return { y: y0 + v0 * dt, v: v0 };

  if (Math.abs(z - 1) < 1e-4) {
    // critical
    const A = y0;
    const B = v0 + w * y0;
    const e = Math.exp(-w * dt);
    return { y: (A + B * dt) * e, v: (B - w * (A + B * dt)) * e };
  }
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    const A = y0;
    const B = (v0 + z * w * y0) / wd;
    const e = Math.exp(-z * w * dt);
    const c = Math.cos(wd * dt);
    const s = Math.sin(wd * dt);
    return {
      y: e * (A * c + B * s),
      v: e * ((B * wd - z * w * A) * c + (-A * wd - z * w * B) * s),
    };
  }
  // overdamped
  const sq = Math.sqrt(z * z - 1);
  const r1 = -w * (z - sq);
  const r2 = -w * (z + sq);
  const C1 = (v0 - r2 * y0) / (r1 - r2);
  const C2 = y0 - C1;
  const e1 = Math.exp(r1 * dt);
  const e2 = Math.exp(r2 * dt);
  return { y: C1 * e1 + C2 * e2, v: C1 * r1 * e1 + C2 * r2 * e2 };
}

/**
 * Simulate release from displacement y0 (v=0) toward 0 and report settle time
 * and number of overshoots (zero crossings). Used by tests and the tuning HUD.
 */
export function analyzeRelease(
  y0: number,
  p: SpringParams,
  opts: { dt?: number; posEps?: number; velEps?: number; maxT?: number } = {},
): { settleTime: number; overshoots: number; peakOvershoot: number } {
  const dt = opts.dt ?? 1 / 1000;
  const posEps = opts.posEps ?? Math.abs(y0) * 0.01;
  const velEps = opts.velEps ?? Math.abs(y0) * 0.05;
  const maxT = opts.maxT ?? 10;
  let y = y0;
  let v = 0;
  let t = 0;
  let overshoots = 0;
  let peak = 0;
  let settleTime = maxT;
  let settledSince: number | null = null;
  while (t < maxT) {
    const prev = y;
    const r = stepSpring(y, v, dt, p);
    y = r.y;
    v = r.v;
    t += dt;
    if (Math.sign(prev) !== Math.sign(y) && prev !== 0 && y !== 0) overshoots++;
    if (Math.sign(y) !== Math.sign(y0)) peak = Math.max(peak, Math.abs(y));
    if (Math.abs(y) < posEps && Math.abs(v) < velEps) {
      if (settledSince === null) settledSince = t;
    } else {
      settledSince = null;
    }
    if (settledSince !== null && t - settledSince > 0.05) {
      settleTime = settledSince;
      break;
    }
  }
  return { settleTime, overshoots, peakOvershoot: peak / Math.abs(y0 || 1) };
}
