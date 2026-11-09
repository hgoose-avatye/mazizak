// Per-role metrics of the shipped sprites (what the test asserts, plus extra detail).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { centroidPow } from './features.mjs';
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/sfx/keyboard');
const db = (v) => 20 * Math.log10(Math.max(v, 1e-9));
export function readSprite(name) {
  const map = JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8'));
  const b = fs.readFileSync(path.join(DIR, map.file));
  const pcm = new Int16Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length));
  return { map, data: Float32Array.from(pcm, (v) => v / 32768) };
}
export function slices(name) {
  const { map, data } = readSprite(name); const out = {};
  for (const [r, es] of Object.entries(map.entries)) out[r] = es.map((e) => ({ e, x: data.slice(e.start, e.start + e.length).map((v) => v * e.gain) }));
  return out;
}
const rms = (x, n = x.length) => Math.sqrt(x.subarray(0, n).reduce((s, v) => s + v * v, 0) / Math.min(n, x.length));
const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
function effLen(x) { // ms until the 2 ms envelope last exceeds peak − 30 dB
  const pk = peak(x); let last = 0;
  for (let i = 0; i + 96 <= x.length; i += 48) if (rms(x.subarray(i, i + 96)) > pk * 0.0316) last = i + 96;
  return (last / 48000) * 1000;
}
if (process.argv[1]?.endsWith('metrics.mjs')) {
  const res = {};
  for (const p of ['pebble', 'clack']) {
    const S = slices(p); res[p] = {};
    for (const [r, a] of Object.entries(S)) {
      const avg = (f) => a.reduce((s, q) => s + f(q), 0) / a.length;
      res[p][r] = {
        n: a.length, durMs: +avg((q) => q.x.length / 48).toFixed(0), effLenMs: +avg((q) => effLen(q.x)).toFixed(0),
        rms60Db: +db(avg((q) => rms(q.x, 2880))).toFixed(1), peakDb: +db(Math.max(...a.map((q) => peak(q.x)))).toFixed(1),
        centroidHz: +avg((q) => centroidPow(q.x, 0, Math.min(q.x.length, 2048))).toFixed(0),
      };
    }
  }
  console.log(JSON.stringify(res, null, 1));
}
