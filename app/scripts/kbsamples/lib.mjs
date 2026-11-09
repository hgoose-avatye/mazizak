import fs from 'node:fs';
export const SR = 48000;
export const load = (f) => { const b = fs.readFileSync(f); return new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice(); };
export const db = (v) => 20 * Math.log10(Math.max(v, 1e-9));
/** high-passed (1-pole ~300Hz) copy for transient detection */
export function hp(x, fc = 300) { const a = Math.exp(-2 * Math.PI * fc / SR); const y = new Float32Array(x.length); let px = 0, py = 0; for (let i = 0; i < x.length; i++) { py = a * (py + x[i] - px); px = x[i]; y[i] = py; } return y; }
/** RMS envelope, hop samples */
export function env(x, hop = 48) { const n = Math.floor(x.length / hop), e = new Float32Array(n); for (let k = 0; k < n; k++) { let s = 0; for (let i = k * hop; i < (k + 1) * hop; i++) s += x[i] * x[i]; e[k] = Math.sqrt(s / hop); } return e; }
export function percentile(a, p) { const s = Float32Array.from(a).sort(); return s[Math.floor(p * (s.length - 1))]; }
/** onsets: frames where env jumps >= jumpDb over previous 3ms min and exceeds floor+minAbove */
export function onsets(x, { hop = 48, jumpDb = 12, minAbove = 18, minGapMs = 30 } = {}) {
  const e = env(hp(x), hop); const floor = percentile(e, 0.2);
  const out = []; let last = -1e9;
  for (let k = 4; k < e.length; k++) {
    const prev = Math.min(e[k - 1], e[k - 2], e[k - 3], e[k - 4]);
    if (db(e[k]) - db(prev) >= jumpDb && db(e[k]) - db(floor) >= minAbove && (k - last) * hop / SR * 1000 >= minGapMs) {
      // peak within next 10ms
      let pk = 0; for (let j = k; j < Math.min(e.length, k + 10); j++) pk = Math.max(pk, e[j]);
      out.push({ t: k * hop / SR, i: k * hop, peakDb: db(pk), floorDb: db(floor) }); last = k;
    }
  }
  return out;
}
/** spectral centroid via naive DFT on n-sample window (Hann), bins step */
export function centroid(x, start, n = 2048) {
  const N = n; let num = 0, den = 0;
  const w = new Float32Array(N); for (let i = 0; i < N; i++) w[i] = (x[start + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  for (let k = 1; k < N / 2; k += 2) { let re = 0, im = 0; const c = 2 * Math.PI * k / N; for (let i = 0; i < N; i++) { re += w[i] * Math.cos(c * i); im -= w[i] * Math.sin(c * i); } const m = Math.hypot(re, im); num += m * k * SR / N; den += m; }
  return num / den;
}
