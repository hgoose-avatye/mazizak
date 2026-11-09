import { load, SR, db } from './lib.mjs';
import { analyze, fftMag } from './features.mjs';
const [f, from = 0, to = 1e9, minPk = -40] = process.argv.slice(2);
const x = load(f); const { y, e, res } = analyze(x, { from: +from, to: +to });
const N = 2048;
const rows = [];
for (const r of res) {
  if (r.peakDb < +minPk) continue;
  const i0 = r.f * 48 - 96; const seg = new Float64Array(N); for (let i = 0; i < N; i++) seg[i] = (y[i0 + i] || 0) * (i < 96 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (i - 96) / (N - 96)));
  const m = fftMag(seg); let lf = 0, mid = 0, hf = 0, tot = 0;
  for (let k = 1; k < m.length; k++) { const fr = k * SR / N, p = m[k] ** 2; tot += p; if (fr < 300) lf += p; else if (fr < 2500) mid += p; else hf += p; }
  // energy-decay: time until cumulative energy reaches 90% in next 200ms
  let cum = 0, tot2 = 0; for (let k = r.f; k < r.f + 200 && k < e.length; k++) tot2 += e[k] ** 2; let t90 = 0; for (let k = r.f; k < r.f + 200 && k < e.length; k++) { cum += e[k] ** 2; if (cum >= 0.9 * tot2) { t90 = k - r.f; break; } }
  rows.push({ t: r.t, pk: r.peakDb, lf: 10 * Math.log10(lf / tot), hf: 10 * Math.log10(hf / tot), t90, prev: r.prevGap * 1000 | 0, next: r.nextGap * 1000 | 0 });
}
for (const q of rows) console.log(q.t.toFixed(3), q.pk.toFixed(1), 'lf', q.lf.toFixed(1), 'hf', q.hf.toFixed(1), 't90', q.t90, 'gaps', q.prev, q.next);
