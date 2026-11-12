// Merge a lab-compare export ("제외 목록 JSON 복사") into scripts/fidgets/exclusions.json, then rebuild with build-clips.mjs.
// Usage: node scripts/fidgets/apply-verdicts.mjs export.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'exclusions.json');
const incoming = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).exclude ?? [];
const cur = JSON.parse(fs.readFileSync(file, 'utf8'));
let added = 0;
for (const e of incoming) {
  if (!e.src || typeof e.srcStart !== 'number') continue;
  if (cur.exclude.some((x) => x.src === e.src && Math.abs(x.srcStart - e.srcStart) <= (x.tol ?? 0.03))) continue;
  cur.exclude.push({ src: e.src, srcStart: Math.round(e.srcStart * 1000) / 1000, tol: e.tol ?? 0.03, reason: e.reason ?? 'listener' });
  added++;
}
fs.writeFileSync(file, JSON.stringify(cur, null, 2) + '\n');
console.log(`exclusions.json: +${added} (total ${cur.exclude.length}). Now run: FFMPEG=... node scripts/fidgets/build-clips.mjs`);
