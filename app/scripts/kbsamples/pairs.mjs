import { load, onsets, SR, centroid, db } from './lib.mjs';
const [f, from = 0, to = 1e9, quiet = 0.3] = process.argv.slice(2);
const x = load(f); const os = onsets(x, { jumpDb: 10, minAbove: 15, minGapMs: 25 });
for (let k = 1; k < os.length; k++) {
  const o = os[k]; if (o.t < +from || o.t > +to) continue;
  if (o.t - os[k - 1].t < +quiet) continue;
  const fol = os.slice(k + 1).filter((p) => p.t - o.t < 0.6).map((p) => `+${((p.t - o.t) * 1000).toFixed(0)}ms:${p.peakDb.toFixed(0)}/${(centroid(x, p.i, 1024) | 0)}`);
  console.log(o.t.toFixed(3), o.peakDb.toFixed(0), (centroid(x, o.i, 1024) | 0) + 'Hz', '|', fol.join(' '));
}
