// Per-event features for stroke selection. Usage: node features.mjs file.f32 [from] [to]
import { load, onsets, SR, db, env, hp } from './lib.mjs';
export function hp2(x, fc) { // RBJ biquad highpass, Q=0.707
  const w = 2 * Math.PI * fc / SR, c = Math.cos(w), al = Math.sin(w) / (2 * 0.7071);
  const b0 = (1 + c) / 2, b1 = -(1 + c), b2 = b0, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
/** magnitude-spectrum centroid over [i0, i0+n) using radix-2 FFT */
export function fftMag(seg) { const n = seg.length; const re = Float64Array.from(seg), im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const wr = Math.cos(a * k), wi = Math.sin(a * k); const ur = re[i + k], ui = im[i + k]; const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; } }
  const m = new Float64Array(n / 2); for (let k = 0; k < n / 2; k++) m[k] = Math.hypot(re[k], im[k]); return m; }
export function centroidPow(x, i0, len, sr = SR) { let n = 1; while (n < len) n <<= 1; const seg = new Float64Array(n); for (let i = 0; i < len; i++) seg[i] = (x[i0 + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / len)); const m = fftMag(seg); let a = 0, b = 0; for (let k = 1; k < m.length; k++) { const p = m[k] * m[k]; a += p * k * sr / n; b += p; } return a / b; }
export function analyze(x, { from = 0, to = 1e9 } = {}) {
  const y = hp2(x, 70); const e = env(y, 48); // 1ms frames
  const os = onsets(y, { jumpDb: 10, minAbove: 15, minGapMs: 25 });
  const floor = os[0]?.floorDb ?? -60;
  const res = [];
  for (let k = 0; k < os.length; k++) {
    const o = os[k]; if (o.t < from || o.t > to) continue;
    const f0 = Math.round(o.t * 1000); let pf = f0, pv = 0; for (let f = f0; f < f0 + 15 && f < e.length; f++) if (e[f] > pv) { pv = e[f]; pf = f; }
    const pkDb = db(pv);
    let dec = pf; while (dec < e.length && db(e[dec]) > pkDb - 30 && dec - pf < 600) dec++;
    const prevGap = k ? o.t - os[k - 1].t : 9, nextGap = k + 1 < os.length ? os[k + 1].t - o.t : 9;
    res.push({ t: o.t, f: pf, peakDb: pkDb, floor, decayMs: dec - pf, prevGap, nextGap, cent: centroidPow(y, pf * 48 - 48, 1440) });
  }
  return { y, e, os, res };
}
if (process.argv[1]?.endsWith('features.mjs')) {
  const [f, from = 0, to = 1e9] = process.argv.slice(2);
  const { res } = analyze(load(f), { from: +from, to: +to });
  for (const r of res) console.log(r.t.toFixed(3), r.peakDb.toFixed(1), 'dec', r.decayMs, 'cent', r.cent | 0, 'gaps', (r.prevGap * 1000) | 0, (r.nextGap * 1000) | 0);
}
