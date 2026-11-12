// Strike detection report for the apple77771 wax recordings (public/sfx/wax/*.mp3).
// Usage: FFMPEG=/path/to/ffmpeg node scripts/fidgets/analyze-wax.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, SR, db, env, onsets, peakOf } from './lib.mjs';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/sfx/wax');
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mp3')).sort()) {
  const x = decode(path.join(dir, f));
  const o = onsets(x, { jumpDb: 9, minAbove: 14, minGapMs: 45 });
  const e = env(x, 48);
  const floor = db([...e].sort((a, b) => a - b)[Math.floor(e.length * 0.1)]);
  console.log(`${f.padEnd(16)} ${(x.length / SR).toFixed(2)}s peak ${db(peakOf(x)).toFixed(1)} floor ${floor.toFixed(1)}  strikes=${o.length}: ` + o.map((s) => `${s.t.toFixed(2)}(${s.peakDb.toFixed(0)})`).join(' '));
}
