// Builds the shipped sound files from the source folder:   node --experimental-transform-types scripts/audio/pack-sfx.mjs [--check]
//
//   audio-src/sfx/**            source of truth (16-bit WAV sprites + JSON maps + credits; edited by the build scripts in scripts/)
//   public/sfx/**               GENERATED: lossless FLAC + JSON maps, content-hashed names (cacheable forever), credits copied verbatim
//   src/audio/sfxManifest.ts    GENERATED: hashed URLs per keyboard preset / squishy / fidget chunk, and the chunks each fidget toy needs
//
// Keyboard presets and the squishy sprite are one file per toy already: same PCM, same offsets, only WAV → FLAC.
// Fidget sprites are shared by several toys (S01 needs 0.36 MB of the 3.6 MB squish.wav), so they are repacked into chunks: the pools
// used by exactly the same set of toys go together (a pool two toys share is downloaded once, never twice). Each clip keeps its PCM
// samples, length, gain, pool order and every other field; only `start`/`offset` (its place in the new file) and `file` change.
// Unused pools are not shipped.
//
// Resampling safety: decodeAudioData resamples to the device rate (44.1 or 48 kHz). To make the decoded clip identical to the one cut from
// the old sprite, every copied region (a) keeps GUARD samples of its original neighbourhood on both sides and (b) moves by a multiple of
// sampleRate/25 samples (40 ms), so the resampling grid lands on the same phase for any device rate that is a multiple of 25 Hz.
//
// --check: rebuild in memory and fail if public/sfx or the manifest differ from what is committed (plus the lossless checks below).
// Every run verifies: FLAC decodes (libFLAC, MD5 on) to exactly the PCM it was made from, and every clip's samples in the new file equal
// the samples of that clip in the source WAV.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { encodeFlac, decodeFlac, ENCODER, COMPRESSION } from './flac.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'audio-src/sfx');
const OUT = path.join(ROOT, 'public/sfx');
const MANIFEST = path.join(ROOT, 'src/audio/sfxManifest.ts');
const CHECK = process.argv.includes('--check');
const GUARD = 2048;
const { FIDGET_SOUND, MIX_SOUND, WAX_STAGES } = await import(path.join(ROOT, 'src/toys/fidgets/soundBank.ts'));

const readWav = (file) => {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${file}: not a WAV`);
  let p = 12, fmt, data;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), n = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(p + 8), channels: b.readUInt16LE(p + 10), sampleRate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = b.subarray(p + 8, p + 8 + n);
    p += 8 + n + (n & 1);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.bits !== 16 || fmt.channels !== 1) throw new Error(`${file}: expected 16-bit mono PCM, got ${JSON.stringify(fmt)}`);
  const pcm = new Int16Array(data.length / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = data.readInt16LE(i * 2);
  return { sampleRate: fmt.sampleRate, pcm };
};
const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
const json = (o) => JSON.stringify(o, null, 1) + '\n';
const round6 = (x) => Math.round(x * 1e6) / 1e6;
const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** files to write: published path (relative to public/sfx) → bytes */
const files = new Map();
const manifest = { keyboard: {}, squishy: null, fidgetChunks: {}, fidgetToys: {} };
const report = [];

async function emit(dir, base, pcm, sampleRate, map) {
  const flac = await encodeFlac(pcm, sampleRate);
  const d = await decodeFlac(flac);
  if (d.sampleRate !== sampleRate || d.channels !== 1 || d.bitsPerSample !== 16 || !equal(d.pcm, pcm)) throw new Error(`${dir}/${base}: FLAC does not decode to the source PCM`);
  const audio = `${dir}/${base}.${hash(flac)}.flac`;
  const body = Buffer.from(json({ ...map, file: path.basename(audio) }));
  const meta = `${dir}/${base}.${hash(body)}.json`;
  files.set(audio, Buffer.from(flac));
  files.set(meta, body);
  return { json: `sfx/${meta}`, audio: `sfx/${audio}`, flacBytes: flac.length, wavBytes: 44 + pcm.length * 2 };
}

// ---- keyboard presets and the squishy sprite: one file per toy, re-encoded only ----
for (const f of fs.readdirSync(path.join(SRC, 'keyboard')).filter((f) => f.endsWith('.json')).sort()) {
  const id = f.slice(0, -5);
  const map = JSON.parse(fs.readFileSync(path.join(SRC, 'keyboard', f), 'utf8'));
  const { sampleRate, pcm } = readWav(path.join(SRC, 'keyboard', map.file));
  const r = await emit('keyboard', id, pcm, sampleRate, map);
  manifest.keyboard[id] = { json: r.json, audio: r.audio };
  report.push(['keyboard/' + id, r.wavBytes, r.flacBytes]);
}
{
  const map = JSON.parse(fs.readFileSync(path.join(SRC, 'squishy/squishy.json'), 'utf8'));
  const { sampleRate, pcm } = readWav(path.join(SRC, 'squishy', map.file));
  const r = await emit('squishy', 'squishy', pcm, sampleRate, map);
  manifest.squishy = { json: r.json, audio: r.audio };
  report.push(['squishy/squishy', r.wavBytes, r.flacBytes]);
}

// ---- fidget sprites → per-toy-set chunks ----
const usage = {}; // source → pool → Set(toy)
const use = (toy, ref) => {
  if (!ref) return;
  for (const p of [ref.pool, ref.alt?.pool].filter(Boolean)) ((usage[ref.source] ??= {})[p] ??= new Set()).add(toy);
  if (ref.layer) ((usage[ref.layer.source] ??= {})[ref.layer.pool] ??= new Set()).add(toy); // a blended-in pool ships with the toy too
};
for (const [toy, m] of Object.entries(FIDGET_SOUND)) for (const r of Object.values(m)) use(toy, r);
for (const [toy, m] of Object.entries(MIX_SOUND)) for (const r of Object.values(m)) use(toy, r);
for (const [toy, m] of Object.entries(WAX_STAGES)) for (const r of Object.values(m)) use(toy, r);

for (const source of Object.keys(usage).sort()) {
  const sprite = JSON.parse(fs.readFileSync(path.join(SRC, `fidgets/${source}.json`), 'utf8'));
  const { sampleRate: sr, pcm: src } = readWav(path.join(SRC, 'fidgets', sprite.file));
  if (sr !== sprite.sampleRate) throw new Error(`${source}: JSON says ${sprite.sampleRate} Hz, WAV is ${sr} Hz`);
  const ALIGN = sr / 25;
  if (!Number.isInteger(ALIGN)) throw new Error(`${source}: ${sr} Hz is not a multiple of 25`);
  // group pools by the exact set of toys using them (pools missing from the sprite were dropped by the clip audit: nothing to ship)
  const groups = new Map();
  for (const [pool, toys] of Object.entries(usage[source])) {
    if (!sprite.pools[pool]) continue;
    const key = [...toys].sort().join('-');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pool);
  }
  const unused = Object.keys(sprite.pools).filter((p) => !usage[source][p]);
  if (unused.length) report.push([`fidgets/${source}: not shipped (no toy uses them): ${unused.join(', ')}`]);
  for (const [key, pools] of [...groups].sort()) {
    pools.sort((a, b) => sprite.pools[a].entries[0].start - sprite.pools[b].entries[0].start);
    // regions of the source to copy: every clip ± GUARD, merged when they touch
    const spans = [];
    for (const p of pools) for (const e of sprite.pools[p].entries) {
      const a = Math.min(e.start, Math.floor(e.offset * sr)), b = Math.max(e.start + e.length, Math.ceil((e.offset + e.duration) * sr));
      spans.push([Math.max(0, a - GUARD), Math.min(src.length, b + GUARD)]);
    }
    spans.sort((x, y) => x[0] - y[0]);
    const regions = [];
    for (const s of spans) { const last = regions[regions.length - 1]; if (last && s[0] <= last[1] + ALIGN) last[1] = Math.max(last[1], s[1]); else regions.push([...s]); }
    // place them: same phase modulo ALIGN; a region that starts at the source's first sample stays at sample 0 (it is the first)
    let cursor = 0;
    for (const r of regions) {
      const at = r[0] === 0 ? 0 : cursor + ((((r[0] - cursor) % ALIGN) + ALIGN) % ALIGN);
      if (r[0] === 0 && cursor !== 0) throw new Error('region at sample 0 is not first');
      r.push(at);
      cursor = at + (r[1] - r[0]);
    }
    const out = new Int16Array(cursor); // gaps stay digital silence; a region that ends at the source's last sample ends the new file too
    if (regions.some((r, i) => r[1] === src.length && i !== regions.length - 1)) throw new Error('region at the end is not last');
    for (const [a, b, at] of regions) out.set(src.subarray(a, b), at);
    const shiftOf = (s) => { const r = regions.find(([a, b]) => s >= a && s < b); if (!r) throw new Error('clip outside regions'); return r[2] - r[0]; };
    const newPools = {}, srcIds = new Set();
    for (const p of pools) {
      const meta = sprite.pools[p];
      newPools[p] = {
        ...meta,
        entries: meta.entries.map((e) => {
          const shift = shiftOf(e.start);
          if (shift % ALIGN) throw new Error('unaligned shift');
          srcIds.add(e.src);
          return { ...e, start: e.start + shift, offset: round6(e.offset + (shift / ALIGN) * 0.04) };
        }),
      };
    }
    // lossless per clip: the samples a clip is cut from (by start/length and by offset/duration) are the same in both files
    for (const p of pools) sprite.pools[p].entries.forEach((e, i) => {
      const n = newPools[p].entries[i];
      if (!equal(out.subarray(n.start, n.start + n.length), src.subarray(e.start, e.start + e.length))) throw new Error(`${source}/${p}#${i}: samples differ`);
      const o0 = Math.round(e.offset * sr), o1 = Math.round(n.offset * sr), len = Math.round(e.duration * sr);
      if (o1 - o0 !== n.start - e.start || !equal(out.subarray(o1, o1 + len), src.subarray(o0, o0 + len))) throw new Error(`${source}/${p}#${i}: offset/duration window differs`);
      if (n.duration !== e.duration || n.length !== e.length || n.gain !== e.gain) throw new Error(`${source}/${p}#${i}: clip fields changed`);
    });
    const name = `${source}.${key}`;
    const map = {
      version: sprite.version,
      chunkOf: sprite.file,
      toys: key.split('-'),
      sampleRate: sr,
      totalSamples: out.length,
      sources: Object.fromEntries([...srcIds].sort().map((id) => [id, sprite.sources[id]])),
      pools: newPools,
    };
    const r = await emit('fidgets', name, out, sr, map);
    manifest.fidgetChunks[name] = { json: r.json, audio: r.audio };
    for (const t of map.toys) (manifest.fidgetToys[t] ??= []).push(name);
    report.push([`fidgets/${name}  (${pools.join(', ')})`, r.wavBytes, r.flacBytes]);
  }
}
for (const t of Object.keys(manifest.fidgetToys)) manifest.fidgetToys[t].sort();

// ---- credits / licences: copied verbatim ----
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of walk(SRC)) if (/\.(md|txt)$/i.test(f)) files.set(path.relative(SRC, f), fs.readFileSync(f));

const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const ts = `// GENERATED by scripts/audio/pack-sfx.mjs from audio-src/sfx — do not edit. Encoder: ${ENCODER}, level ${COMPRESSION}.
// Content-hashed URLs (relative to the page): a changed sound gets a new name, an unchanged one is cached forever.
export interface SfxFile { json: string; audio: string }
export const SFX_KEYBOARD: Record<string, SfxFile> = ${JSON.stringify(sortObj(manifest.keyboard), null, 2)};
export const SFX_SQUISHY: SfxFile = ${JSON.stringify(manifest.squishy, null, 2)};
/** fidget sound chunks: the pools used by exactly the same set of toys */
export const SFX_FIDGET_CHUNKS: Record<string, SfxFile> = ${JSON.stringify(sortObj(manifest.fidgetChunks), null, 2)};
/** the chunks each fidget toy loads (and nothing else) */
export const SFX_FIDGET_TOYS: Record<string, string[]> = ${JSON.stringify(sortObj(manifest.fidgetToys), null, 2)};
`;

if (CHECK) {
  const problems = [];
  const have = fs.existsSync(OUT) ? walk(OUT).map((f) => path.relative(OUT, f)) : [];
  for (const f of have) if (!files.has(f)) problems.push(`stale file in public/sfx: ${f}`);
  for (const [f, b] of files) if (!fs.existsSync(path.join(OUT, f)) || !fs.readFileSync(path.join(OUT, f)).equals(b)) problems.push(`public/sfx/${f} is missing or differs`);
  if (!fs.existsSync(MANIFEST) || fs.readFileSync(MANIFEST, 'utf8') !== ts) problems.push('src/audio/sfxManifest.ts differs');
  if (problems.length) { console.error('sfx check FAILED (run npm run pack:sfx):\n - ' + problems.join('\n - ')); process.exit(1); }
  console.log(`sfx check OK: ${files.size} files match audio-src/sfx; every FLAC decodes to its source PCM; every clip sample-identical`);
} else {
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const [f, b] of files) { fs.mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true }); fs.writeFileSync(path.join(OUT, f), b); }
  fs.writeFileSync(MANIFEST, ts);
  let w = 0, fl = 0;
  for (const r of report) { if (r.length === 1) { console.log(r[0]); continue; } w += r[1]; fl += r[2]; console.log(`${r[0].padEnd(64)} wav ${String(r[1]).padStart(8)}  flac ${String(r[2]).padStart(8)}  ${((100 * r[2]) / r[1]).toFixed(1)}%`); }
  console.log(`total: wav-equivalent ${w}  flac ${fl}  (${((100 * fl) / w).toFixed(1)}%) · ${files.size} files written to public/sfx · lossless checks passed`);
}
