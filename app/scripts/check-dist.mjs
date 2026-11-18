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
// 2) no reference models / textures / audio outside the licensed sfx folders. The only models allowed are the two shipped on purpose
//    (모닝빵 / 찹쌀떡, public/models/, owner's permission record in models.json — checked in 6)
const SHIPPED_MODELS = new Set(['models/bread.glb', 'models/peachmochi.glb']);
for (const f of files) {
  const rel = path.relative(dist, f);
  if (/\.(glb|gltf|usdz)$/.test(rel) && !SHIPPED_MODELS.has(rel)) problems.push(`model shipped: ${rel}`);
  if ((/(^|\/)thumbs\/[A-Z]\d+\.png$/.test(rel) || /(^|\/)audio\//.test(rel)) && !rel.startsWith('sfx/')) problems.push(`reference asset shipped: ${rel}`);
}
// 2b) development-only pages (audio-test, lab-*, keyboard-compare, candidates, …) and their bundles must not ship: index.html is the only page
for (const f of files) {
  const rel = path.relative(dist, f);
  if (/\.html?$/.test(rel) && rel !== 'index.html') problems.push(`dev-only page shipped: ${rel}`);
  if (/(^|\/)assets\/(audio|labSound|keyboardCompare|candidates|keyboardAb|lab[A-Z]\w*|keycapLab)-[\w-]+\.js$/.test(rel)) problems.push(`dev-only bundle shipped: ${rel}`);
}
// 3) every shipped fidget chunk has a source with an allowed licence and a usage note
const fidgetMaps = files.filter((f) => /(^|\/)sfx\/fidgets\/[^/]+\.json$/.test(path.relative(dist, f)));
if (!fidgetMaps.length) problems.push('no fidget sound chunks in dist/sfx/fidgets');
for (const f of fidgetMaps) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8')), k = path.basename(f);
  for (const [n, p] of Object.entries(j.pools)) for (const e of p.entries) {
    const s = j.sources[e.src];
    if (!s) problems.push(`${k}/${n}: clip source ${e.src} unknown`);
    else if (!(['CC0 1.0', 'CC BY 4.0', 'CC BY 3.0'].includes(s.license) || (e.src.startsWith('own:') && s.license === 'Own recording (project owner)')) || !s.usage) problems.push(`${k}/${n}: ${e.src} licence/usage missing`);
  }
}
// 3b) sounds ship as lossless FLAC only (WAV sources stay in audio-src/), under content-hashed names, and every map points at a shipped file
for (const f of files) {
  const rel = path.relative(dist, f);
  if (!rel.startsWith('sfx/')) continue;
  if (/\.(wav|mp3|f32)$/i.test(rel)) problems.push(`uncompressed / source audio shipped: ${rel}`);
  if (/\.(flac|json)$/.test(rel) && !/\.[0-9a-f]{10}\.(flac|json)$/.test(rel)) problems.push(`sound file without a content hash: ${rel}`);
  if (rel.endsWith('.json')) { const file = JSON.parse(fs.readFileSync(f, 'utf8')).file; if (!fs.existsSync(path.join(path.dirname(f), file))) problems.push(`${rel} points at missing ${file}`); }
  if (rel.endsWith('.flac') && fs.readFileSync(f).subarray(0, 4).toString('ascii') !== 'fLaC') problems.push(`${rel} is not FLAC`);
}
// 4) menu thumbnails are our own renders (small JPEGs in thumbs/menu/), never the reference app's PNG thumbnails
const menuThumbs = files.filter((f) => /(^|\/)thumbs\/menu\//.test(path.relative(dist, f)));
if (!menuThumbs.length) problems.push('no menu thumbnails in dist/thumbs/menu');
for (const f of menuThumbs) {
  if (!/\.jpg$/.test(f)) problems.push(`menu thumbnail is not a jpg: ${path.relative(dist, f)}`);
  else if (fs.statSync(f).size > 60000) problems.push(`menu thumbnail over 60 KB: ${path.relative(dist, f)}`);
}
// 5) a keyboard sprite that still carries the local-only marker must not ship; the cleared third-party presets must carry the owner's clearance record
for (const f of files.filter((f) => /(^|\/)sfx\/keyboard\/[^/]+\.json$/.test(f))) {
  const t = fs.readFileSync(f, 'utf8'), rel = path.relative(dist, f);
  if (/LOCAL_DEVELOPMENT_ONLY|NOT_FOR_PUBLIC_DISTRIBUTION/.test(t)) problems.push(`${rel} still carries the local-only marker`);
  if (/\/(Users|private)\//.test(t)) problems.push(`${rel} contains a local absolute path`);
}
for (const id of ['box-jade', 'silent-peach-v3', 'mongdol-pl87w', 'jjigae-topre', 'dojagi-space65']) {
  const f = files.find((x) => new RegExp(`(^|/)sfx/keyboard/${id}\\.[0-9a-f]{10}\\.json$`).test(path.relative(dist, x)));
  if (!f) { problems.push(`cleared preset ${id} missing from dist/sfx/keyboard`); continue; }
  if (JSON.parse(fs.readFileSync(f, 'utf8')).clearance?.statedBy !== 'project owner') problems.push(`${id}.json has no clearance record`);
}
// 6) the shipped models: valid, small, and the owner's permission record travels with them
for (const rel of SHIPPED_MODELS) {
  const f = path.join(dist, rel);
  if (!fs.existsSync(f)) { problems.push(`${rel} missing from dist`); continue; }
  const b = fs.readFileSync(f);
  if (b.toString('ascii', 0, 4) !== 'glTF') problems.push(`${rel} is not a glb`);
  if (b.length > 1_000_000) problems.push(`${rel} is ${b.length} bytes (over 1 MB: pack it with scripts/fidgets/pack-reference-models.mjs)`);
}
for (const f of ['models/models.json']) if (!fs.existsSync(path.join(dist, f))) problems.push(`${f} missing from dist`);
try { if (JSON.parse(fs.readFileSync(path.join(dist, 'models/models.json'), 'utf8')).clearance?.statedBy !== 'project owner') problems.push('models/models.json has no permission record'); } catch { problems.push('models/models.json unreadable'); }
if (problems.length) { console.error('dist check FAILED:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log(`dist check OK: ${files.length} files, no local-reference strings or models, fidget chunks licensed, sounds FLAC-only with hashed names`);
