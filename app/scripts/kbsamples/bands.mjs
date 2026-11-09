import { load, SR, db } from './lib.mjs';
import { fftMag } from './features.mjs';
const [f, ...ts] = process.argv.slice(2);
const x = load(f); const edges = [0, 40, 80, 150, 300, 600, 1200, 2400, 5000, 10000, 24000];
const acc = new Float64Array(edges.length - 1); const N = 4096; // 85ms
for (const t of ts.map(Number)) { const i0 = Math.round(t * SR) - 48; const seg = new Float64Array(N); for (let i = 0; i < N; i++) seg[i] = (x[i0 + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); const m = fftMag(seg); if (!m.every(Number.isFinite)) { console.error("nan at", t); continue; } for (let k = 1; k < m.length; k++) { const fr = k * SR / N; const b = edges.findIndex((e, j) => fr >= e && fr < edges[j + 1]); if (b >= 0) acc[b] += m[k] ** 2; } }
const tot = acc.reduce((a, b) => a + b);
console.log(edges.slice(0, -1).map((e, j) => `${e}-${edges[j + 1]}:${(10 * Math.log10(acc[j] / tot)).toFixed(0)}`).join(' '));
