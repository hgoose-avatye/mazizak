// Quick report of the candidate crunch sources (scripts/fidgets/source/crunch/*.mp3).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, SR, db, env, onsets, peakOf, rmsOf } from './lib.mjs';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'source/crunch');
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mp3')).sort()) {
  const x = decode(path.join(dir, f));
  const e = env(x, 48), sorted = [...e].sort((a, b) => a - b);
  const o = onsets(x, { jumpDb: 9, minAbove: 14, minGapMs: 45 });
  console.log(`${f.padEnd(16)} ${(x.length / SR).toFixed(2)}s peak ${db(peakOf(x)).toFixed(1)} rms ${db(rmsOf(x)).toFixed(1)} floor ${db(sorted[Math.floor(sorted.length * 0.1)]).toFixed(1)} strikes=${o.length}`);
}
