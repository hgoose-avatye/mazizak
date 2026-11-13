// Production-build guard: nothing from the local-only reference route may ship, and every shipped fidget sound must carry
// licence metadata. Usage: npm run build && node scripts/check-dist.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (!fs.existsSync(dist)) { console.error('dist/ missing — run npm run build first'); process.exit(2); }
const files = [];
(function walk(d) { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(dist);
const problems = [];
// 1) forbidden strings in text assets
const FORBIDDEN = ['__original-wakppu', 'MANZIZAK_ORIGINAL_WAKPPU_DIR', '/Applications/Wakppu.app', 'ORIGINAL-APP', 'VITE_ORIGINAL_SOUNDS', '__original-wak', 'MANZIZAK_ORIGINAL_APP_DIR', '/Applications/Runner.app', '__local-fidgets', 'MANZIZAK_LOCAL', 'manzizak-fidget-reference', 'manzizak-local-presets', '/private/tmp/', 'installed-app', '7WDcH26JU5Q'];
for (const f of files.filter((f) => /\.(js|css|html|json|md|map)$/.test(f))) {
  const t = fs.readFileSync(f, 'utf8');
  for (const s of FORBIDDEN) if (t.includes(s)) problems.push(`${path.relative(dist, f)} contains "${s}"`);
}
// 2) no reference models / textures / audio outside the licensed sfx folders
for (const f of files) {
  const rel = path.relative(dist, f);
  if (/\.(glb|gltf|usdz)$/.test(rel)) problems.push(`model shipped: ${rel}`);
  if ((/(^|\/)thumbs\/[A-Z]\d+\.png$/.test(rel) || /(^|\/)audio\//.test(rel)) && !rel.startsWith('sfx/')) problems.push(`reference asset shipped: ${rel}`);
}
// 3) every shipped fidget sprite pool has a source with an allowed licence and a usage note
for (const k of ['wax', 'crunch', 'squish', 'picks']) {
  const j = JSON.parse(fs.readFileSync(path.join(dist, `sfx/fidgets/${k}.json`), 'utf8'));
  for (const [n, p] of Object.entries(j.pools)) for (const e of p.entries) {
    const s = j.sources[e.src];
    if (!s) problems.push(`${k}/${n}: clip source ${e.src} unknown`);
    else if (!['CC0 1.0', 'CC BY 4.0', 'CC BY 3.0'].includes(s.license) || !s.usage) problems.push(`${k}/${n}: ${e.src} licence/usage missing`);
  }
}
for (const f of ['CREDITS.md', 'PICKS-CREDITS.md']) if (!fs.existsSync(path.join(dist, 'sfx/fidgets', f))) problems.push(`sfx/fidgets/${f} missing`);
if (problems.length) { console.error('dist check FAILED:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log(`dist check OK: ${files.length} files, no local-reference strings or models, fidget sprites licensed`);
