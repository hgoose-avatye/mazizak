import fs from 'node:fs';
import { load, onsets, SR, centroid } from './lib.mjs';
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.f32'))) {
  const x = load(dir + '/' + f); const os = onsets(x, { jumpDb: 10, minAbove: 15, minGapMs: 25 });
  if (!os.length) { console.log(f, 'no events'); continue; }
  const pk = os.map((o) => o.peakDb).sort((a, b) => b - a); const top = pk[Math.floor(pk.length * 0.1)];
  const strong = os.filter((o) => o.peakDb >= top - 12);
  const cs = strong.slice(0, 80).map((o) => centroid(x, o.i, 1024)).sort((a, b) => a - b);
  const iso = os.filter((o, k) => k > 0 && o.t - os[k - 1].t > 0.3 && o.peakDb >= top - 15).length;
  console.log(f.padEnd(28), 'dur', (x.length / SR).toFixed(0).padStart(4), 'ev', String(os.length).padStart(5), 'floor', os[0].floorDb.toFixed(0), 'p90', top.toFixed(0), 'centroidMed', (cs[cs.length >> 1] | 0), 'isolated', iso);
}
