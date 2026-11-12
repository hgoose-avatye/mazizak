// Quick objective report for a directory of candidate recordings: duration, peak, noise floor, strike density, centroid.
// Usage: FFMPEG=... node scripts/fidgets/analyze-dir.mjs <dir>
import fs from 'node:fs';
import path from 'node:path';
import { decode, SR, db, env, onsets, peakOf, rmsOf } from './lib.mjs';
import { centroid } from '../kbsamples/lib.mjs';
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter((n) => /\.(mp3|wav)$/.test(n)).sort()) {
  const x = decode(path.join(dir, f));
  const e = env(x, 48), sorted = [...e].sort((a, b) => a - b);
  const o = onsets(x, { jumpDb: 9, minAbove: 14, minGapMs: 45 });
  const floor = db(sorted[Math.floor(sorted.length * 0.1)]), pk = db(peakOf(x));
  const mid = x.subarray(Math.floor(x.length / 2) - 1024, Math.floor(x.length / 2) + 1024);
  console.log(f.padEnd(14), `${(x.length / SR).toFixed(1)}s`.padEnd(8), `peak ${pk.toFixed(1)}`.padEnd(12), `rms ${db(rmsOf(x)).toFixed(1)}`.padEnd(11), `floor ${floor.toFixed(1)}`.padEnd(12), `snr ${(pk - floor).toFixed(0)}`.padEnd(8), `strikes/s ${(o.length / (x.length / SR)).toFixed(1)}`.padEnd(15), mid.length === 2048 ? `centroid ${Math.round(centroid(mid, 0, 2048))}Hz` : '');
}
