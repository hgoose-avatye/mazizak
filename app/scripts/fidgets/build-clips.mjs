// Pre-extract short clips from the licensed source recordings of the fidget toys.
//
//   wax    : apple77771 wakppuball-simulator recordings (CC BY 4.0)   public/sfx/wax/*.mp3          → public/sfx/fidgets/wax.{wav,json}
//   crunch : Freesound CC0 recordings (see SOURCES below)             scripts/fidgets/source/crunch/ → public/sfx/fidgets/crunch.{wav,json}
//
// Usage: FFMPEG=/path/to/ffmpeg node scripts/fidgets/build-clips.mjs     (re-runnable; output is deterministic)
//
// Clips are picked automatically from the waveform (strike detection on a 1 ms envelope). Nobody has listened to them:
// the JSON records the objective facts (source, times, peak, centroid) and `materialMatch`, never "verified timbre".
// Raw recordings and derived variants are counted separately: this script only EXTRACTS (variants = 0). Runtime
// speed/pitch jitter is applied by the player and is not counted as a recording.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, SR, db, env, onsets, peakOf, rmsOf } from './lib.mjs';
import { centroid } from '../kbsamples/lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/sfx/fidgets');
const ms = (v) => Math.round((v * SR) / 1000);
const GAP = ms(10);
const PEAK = Math.pow(10, -1 / 20);

const WAX_LICENSE = { license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', author: 'apple77771', url: 'https://github.com/apple77771/wakppuball-simulator', retrieved: '2026-11-11', usage: 'fidget W01/W02 wax crack + knead' };
const SOURCES = {
  wax: ['apple_crack_1', 'apple_crack_2', 'apple_knead_1', 'apple_knead_2', 'choco_crack_1', 'choco_crack_2', 'choco_knead_1', 'choco_knead_2'].map((n) => ({ id: `wax:${n}`, file: path.join(ROOT, `public/sfx/wax/${n}.mp3`), title: n, ...WAX_LICENSE, materialMatch: 'recording of the simulated wax ball (maintainer’s claim)' })),
  crunch: [
    { id: 'freesound:389657', file: 'fs_389657.mp3', title: 'Crinkling styrofoam; close.wav', author: 'TylerAM', url: 'https://freesound.org/people/TylerAM/sounds/389657/', tags: 'break crinkle crunch styrofoam' },
    { id: 'freesound:195797', file: 'fs_195797.mp3', title: 'styrofoam_polysterne_polysteren_cracks_cracking_plastic.wav', author: 'ondondvo', url: 'https://freesound.org/people/ondondvo/sounds/195797/', tags: 'cracking cracks plastic polystyrene styrofoam' },
    { id: 'freesound:541076', file: 'fs_541076.mp3', title: 'Beads.wav', author: 'Chelly01', url: 'https://freesound.org/people/Chelly01/sounds/541076/', tags: 'Beads Crunching Dropping Plastic Rattling Shaking' },
    { id: 'freesound:343795', file: 'fs_343795.mp3', title: 'Beads.wav', author: 'zmadyun', url: 'https://freesound.org/people/zmadyun/sounds/343795/', tags: 'multiple plastic sharp' },
    { id: 'freesound:567534', file: 'fs_567534.mp3', title: 'sugar granules.wav', author: 'Tnext54', url: 'https://freesound.org/people/Tnext54/sounds/567534/', tags: 'grainy granules sand sound-design sugar' },
  ].map((s) => ({ ...s, file: path.join(ROOT, 'scripts/fidgets/source/crunch', s.file), license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', retrieved: '2026-11-12', usage: 'fidget C01/C02 crunch', materialMatch: 'similar material only (not a recording of the toy)' })),
};

// ───────── analysis ─────────
function analyse(src) {
  const x = decode(src.file);
  const e = env(x, 48);
  const sorted = [...e].sort((a, b) => a - b);
  const floor = db(sorted[Math.floor(sorted.length * 0.1)]);
  const strikes = onsets(x, { jumpDb: 9, minAbove: 14, minGapMs: 45 }).map((o) => {
    // sample-accurate start: earliest sample within 3 ms before the main peak (searched 15 ms after the onset) above 15 % of it
    let pi = o.i, pv = 0;
    for (let i = Math.max(0, o.i - ms(4)); i < Math.min(x.length, o.i + ms(15)); i++) if (Math.abs(x[i]) > pv) { pv = Math.abs(x[i]); pi = i; }
    let s = pi;
    for (let i = Math.max(0, pi - ms(3)); i < pi; i++) if (Math.abs(x[i]) > 0.15 * pv) { s = i; break; }
    return { t: o.t, start: Math.max(0, s - ms(0.5)), peakDb: o.peakDb };
  });
  strikes.forEach((s, k) => { s.prev = k ? s.start - strikes[k - 1].start : 1e9; s.next = k + 1 < strikes.length ? strikes[k + 1].start - s.start : 1e9; });
  return { src, x, strikes, floor, maxPeakDb: Math.max(...strikes.map((s) => s.peakDb), -120) };
}

/** end of a decaying hit: last 2 ms RMS frame above clip peak −38 dB, capped */
function tailEnd(x, a, maxEnd) {
  const seg = x.subarray(a, maxEnd);
  const pk = peakOf(seg), thr = pk * Math.pow(10, -38 / 20), h = ms(2);
  for (let i = seg.length - h; i >= 0; i -= h) if (rmsOf(seg.subarray(i, i + h)) > thr) return a + Math.min(seg.length, i + h + ms(4));
  return a + ms(30);
}
const crest = (c) => peakOf(c) / Math.max(rmsOf(c), 1e-9);
function clipOf(an, a, b, extra = {}) {
  const raw = an.x.slice(a, b);
  return { src: an.src, a, b, raw, peakDb: db(peakOf(raw)), centroid: centroid(raw, 0, Math.min(2048, raw.length >> 1 << 1)), strikes: an.strikes.filter((s) => s.start >= a && s.start < b).length, crest: crest(raw), ...extra };
}
const overlaps = (list, c, pad = ms(20)) => list.some((o) => o.src === c.src && c.a < o.b + pad && c.b > o.a - pad);

// ───────── candidate generators ─────────
/** one isolated hit: from its start to the decay end, ending before the next strike */
function singles(an, { minLen = 60, maxLen = 240, isolation = 0 } = {}) {
  const out = [];
  for (const s of an.strikes) {
    if (s.prev < isolation) continue;
    const cap = Math.min(an.x.length, s.start + ms(maxLen), s.start + s.next - ms(6));
    if (cap - s.start < ms(minLen)) continue;
    const end = Math.max(s.start + ms(minLen), tailEnd(an.x, s.start, cap));
    out.push(clipOf(an, s.start, Math.min(end, cap), { strikePeakDb: s.peakDb }));
  }
  return out;
}
/** fixed-length window starting at a strike */
function windows(an, lenMs, { minStrikes = 3 } = {}) {
  const out = [];
  for (const s of an.strikes) {
    const b = s.start + ms(lenMs);
    if (b > an.x.length) continue;
    const c = clipOf(an, s.start, b, { strikePeakDb: s.peakDb });
    if (c.strikes >= minStrikes) out.push(c);
  }
  return out;
}
/** pick `n` clips by descending score, no overlap within a source, spread over time */
const MAX_BOOST_DB = 24;
function pick(cands, n, score) {
  cands = cands.filter((c) => c.peakDb >= -1 - MAX_BOOST_DB); // never amplify a clip by more than 24 dB to reach −1 dBFS
  const sorted = [...cands].sort((p, q) => score(q) - score(p) || p.a - q.a);
  const chosen = [];
  for (const c of sorted) { if (chosen.length >= n) break; if (!overlaps(chosen, c)) chosen.push(c); }
  return chosen.sort((p, q) => p.src.id.localeCompare(q.src.id) || p.a - q.a);
}

// ───────── pools ─────────
const pools = {};
function addPool(name, event, material, clips, note) { pools[name] = { event, material, note, clips }; }

const wax = SOURCES.wax.map(analyse);
for (const kind of ['apple', 'choco']) {
  const crackFiles = wax.filter((a) => a.src.title.startsWith(`${kind}_crack`)), kneadFiles = wax.filter((a) => a.src.title.startsWith(`${kind}_knead`));
  const hits = crackFiles.flatMap((a) => singles(a, { minLen: 70, maxLen: 260, isolation: 140 }).filter((c) => c.strikePeakDb >= a.maxPeakDb - 10));
  const init = pick(hits, 3, (c) => c.strikePeakDb);
  const rest = hits.filter((c) => !init.includes(c));
  const crack = pick(crackFiles.flatMap((a) => singles(a, { minLen: 60, maxLen: 200 }).filter((c) => c.strikePeakDb >= a.maxPeakDb - 22 && c.strikePeakDb <= a.maxPeakDb - 2)).filter((c) => !init.some((i) => i.src === c.src && Math.abs(i.a - c.a) < ms(300))), 6, (c) => c.strikePeakDb - Math.abs(c.peakDb + 20) * 0.1);
  const burst = pick(crackFiles.flatMap((a) => windows(a, 420, { minStrikes: 4 }).filter((c) => c.peakDb >= -20)), 3, (c) => c.strikes);
  const knead = pick(kneadFiles.flatMap((a) => windows(a, 560, { minStrikes: 3 })), 6, (c) => c.strikes - c.crest * 0.15);
  void rest;
  addPool(`${kind}.init`, 'init', 'wax', init, 'strongest isolated first-break hits');
  addPool(`${kind}.crack`, 'crack', 'wax', crack, 'single crack hits');
  addPool(`${kind}.burst`, 'crack', 'wax', burst, 'dense runs of ≥4 strikes (continuous breaking)');
  addPool(`${kind}.knead`, 'hold', 'wax', knead, 'crackle runs of the knead recordings');
}
const cr = SOURCES.crunch.map(analyse);
const by = (id) => cr.find((a) => a.src.id === id);
// C01 soap crunch: styrofoam (similar dry brittle foam), C02 sugar beads: plastic beads + sugar granules
const soapSrc = [by('freesound:389657'), by('freesound:195797')];
const beadSrc = [by('freesound:541076'), by('freesound:343795')];
const sugarSrc = [by('freesound:567534')];
addPool('soap.crunch', 'crunch', 'styrofoam', pick(soapSrc.flatMap((a) => singles(a, { minLen: 50, maxLen: 190 }).filter((c) => c.strikePeakDb >= a.maxPeakDb - 14)), 8, (c) => c.strikePeakDb), 'short crushing hits (styrofoam)');
addPool('soap.hold', 'hold', 'styrofoam', pick(soapSrc.flatMap((a) => windows(a, 640, { minStrikes: 5 }).filter((c) => c.peakDb <= a.maxPeakDb - 0)), 5, (c) => c.strikes - c.crest * 0.3), 'dense continuous crinkle windows (styrofoam)');
addPool('beads.crunch', 'crunch', 'plastic beads', pick(beadSrc.flatMap((a) => singles(a, { minLen: 35, maxLen: 150 }).filter((c) => c.strikePeakDb >= a.maxPeakDb - 14)), 8, (c) => c.strikePeakDb), 'short bead collisions (plastic beads)');
addPool('beads.hold', 'hold', 'sugar granules', pick(sugarSrc.flatMap((a) => windows(a, 640, { minStrikes: 4 })), 5, (c) => c.strikes - c.crest * 0.3), 'grainy friction windows (sugar granules)');

// ───────── write sprites ─────────
const CLASS = { init: 'impact', crack: 'impact', crunch: 'impact', hold: 'continuous' };
/** impact clips: max 20 ms RMS after a 150 Hz one-pole high-pass (same idea as sfx.ts loudness()); continuous clips: whole-clip RMS */
function level(y, cls) {
  if (cls === 'continuous') return rmsOf(y);
  const a = Math.exp((-2 * Math.PI * 150) / SR); let px = 0, py = 0; const h = new Float32Array(y.length);
  for (let i = 0; i < y.length; i++) { py = a * (py + y[i] - px); px = y[i]; h[i] = py; }
  const n = ms(20); let m = 0;
  for (let i = 0; i + n <= h.length || i === 0; i += ms(5)) { let e = 0; const k = Math.min(n, h.length - i); for (let j = i; j < i + k; j++) e += h[j] * h[j]; m = Math.max(m, e / Math.max(1, k)); if (i + n > h.length) break; }
  return Math.sqrt(m);
}
function build(file, groupNames, srcList) {
  // fade + peak-normalise each clip to −1 dBFS
  const prepared = {};
  for (const name of groupNames) prepared[name] = pools[name].clips.map((c) => {
    const y = Float32Array.from(c.raw);
    const fo = Math.min(y.length >> 1, ms(10)), fi = ms(0.5);
    for (let i = 0; i < y.length; i++) { let w = 1; if (i < fi) w *= i / fi; if (i >= y.length - fo) w *= 0.5 + 0.5 * Math.cos((Math.PI * (i - (y.length - fo))) / fo); y[i] *= w; }
    const k = PEAK / Math.max(peakOf(y), 1e-9);
    for (let i = 0; i < y.length; i++) y[i] *= k;
    return { ...c, y, boostDb: db(k) };
  });
  // within-pool loudness match: attenuate louder clips down to the quietest (RMS), gain ≤ 1
  for (const name of groupNames) { const rs = prepared[name].map((c) => level(c.y, CLASS[pools[name].event])); const t = Math.min(...rs); prepared[name].forEach((c, i) => { c.gain = Math.round((t / rs[i]) * 1e4) / 1e4; c.poolRmsDb = db(t); }); }
  const total = groupNames.reduce((n, g) => n + prepared[g].reduce((m, c) => m + c.y.length + GAP, 0), 0) - GAP;
  const sprite = new Float32Array(total);
  let pos = 0;
  const outPools = {};
  for (const name of groupNames) {
    outPools[name] = {
      event: pools[name].event,
      loudnessClass: CLASS[pools[name].event],
      material: pools[name].material,
      note: pools[name].note,
      recordings: prepared[name].length, // distinct extracted source passages
      variants: 0,
      entries: prepared[name].map((c) => {
        sprite.set(c.y, pos);
        const e = { start: pos, length: c.y.length, offset: Math.round((pos / SR) * 1e6) / 1e6, duration: Math.round((c.y.length / SR) * 1e6) / 1e6, gain: c.gain, src: c.src.id, srcStart: Math.round((c.a / SR) * 1e4) / 1e4, srcEnd: Math.round((c.b / SR) * 1e4) / 1e4, peakDbSource: Math.round(c.peakDb * 10) / 10, centroidHz: Math.round(c.centroid), strikes: c.strikes, boostDb: Math.round(c.boostDb * 10) / 10 };
        pos += c.y.length + GAP;
        return e;
      }),
    };
  }
  const wav = Buffer.alloc(44 + sprite.length * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + sprite.length * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(sprite.length * 2, 40);
  for (let i = 0; i < sprite.length; i++) wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sprite[i] * 32767))), 44 + i * 2);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${file}.wav`), wav);
  const used = new Set(Object.values(outPools).flatMap((p) => p.entries.map((e) => e.src)));
  const sources = Object.fromEntries(srcList.filter((s) => used.has(s.id)).map((s) => [s.id, { title: s.title, author: s.author, url: s.url, license: s.license, licenseUrl: s.licenseUrl, retrieved: s.retrieved, usage: s.usage, materialMatch: s.materialMatch, originalFile: path.relative(ROOT, s.file) }]));
  const recordings = Object.values(outPools).reduce((n, p) => n + p.recordings, 0);
  const map = {
    version: 1, file: `${file}.wav`, sampleRate: SR, channels: 1, bitDepth: 16, totalSamples: sprite.length,
    note: 'Clips were picked automatically from the waveform and have NOT been listened to. `recordings` = distinct passages extracted from the source files; `variants` = derived copies (none here — runtime speed/pitch jitter is not counted). Sprite clips are peak-normalised to −1 dBFS; `gain` (≤1) equalises RMS within a pool; relative loudness between event classes is set by the player.',
    counts: { sourceFiles: Object.keys(sources).length, extractedClips: recordings, derivedVariants: 0 },
    sources, pools: outPools,
  };
  fs.writeFileSync(path.join(OUT, `${file}.json`), JSON.stringify(map, null, 1) + '\n');
  console.log(`\n${file}: ${sprite.length} samples (${(sprite.length / SR).toFixed(2)} s), ${wav.length} bytes, ${recordings} clips from ${Object.keys(sources).length} source files`);
  for (const [n, p] of Object.entries(outPools)) console.log(`  ${n.padEnd(14)} ${p.event.padEnd(6)} src=${[...new Set(p.entries.map((e) => e.src.replace('freesound:', 'fs').replace('wax:', '')))].join(',')} n=${String(p.entries.length).padStart(2)} dur ${Math.min(...p.entries.map((e) => e.duration)).toFixed(2)}–${Math.max(...p.entries.map((e) => e.duration)).toFixed(2)}s centroid ${Math.round(p.entries.reduce((s, e) => s + e.centroidHz, 0) / p.entries.length)}Hz  gain ${Math.min(...p.entries.map((e) => e.gain)).toFixed(2)}–1  max boost +${Math.max(...p.entries.map((e) => e.boostDb)).toFixed(1)}dB`);
}
build('wax', ['apple.init', 'apple.crack', 'apple.burst', 'apple.knead', 'choco.init', 'choco.crack', 'choco.burst', 'choco.knead'], SOURCES.wax);
build('crunch', ['soap.crunch', 'soap.hold', 'beads.crunch', 'beads.hold'], SOURCES.crunch);

// ───────── credits (generated, so they cannot drift from the sprite metadata) ─────────
{
  const w = JSON.parse(fs.readFileSync(path.join(OUT, 'wax.json'), 'utf8')), c = JSON.parse(fs.readFileSync(path.join(OUT, 'crunch.json'), 'utf8'));
  const row = (id, s) => `| ${id} | ${s.title} | ${s.author} | ${s.url} | ${s.license} | ${s.retrieved} | ${s.materialMatch} |`;
  const t = `# Fidget sound credits (wax + crunch clips)

Generated by \`scripts/fidgets/build-clips.mjs\` — do not edit by hand. Pools, clip times and counts are in \`wax.json\` / \`crunch.json\`.

## Wax (W01 청사과, W02 초콜릿) — CC BY 4.0, attribution required

WAK-PPU-BALL sound effects by **apple77771**, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
Source: https://github.com/apple77771/wakppuball-simulator, pinned commit 6882bebcc312b3be3b871b0729e22ceacf5a2f01. The upstream
notice is preserved in \`../wax/LICENSE.md\`; the original, unmodified MP3 files stay in \`../wax/\`.

**Changes made (CC BY 4.0 §3(a)(1)(B)): the clips in \`wax.wav\` were modified** — cut out of the original recordings at detected strike
points (${w.counts.extractedClips} clips from ${w.counts.sourceFiles} files), faded in/out, peak-normalised to −1 dBFS and loudness-matched within each pool.
No filtering, EQ or pitch change is baked in. The upstream audio licence says the recordings are the maintainer's own; that claim was not independently verified.

| id | title | author | url | licence | retrieved | material |
|---|---|---|---|---|---|---|
${Object.entries(w.sources).map(([id, s]) => row(id, s)).join('\n')}

## Crunch (C01 비누 크런치, C02 슈가비즈 말랑이) — CC0 1.0

Recordings from Freesound, all marked Creative Commons 0 (https://creativecommons.org/publicdomain/zero/1.0/) on their pages on the retrieval date
(public HQ preview MP3s). CC0 needs no attribution; we credit the authors anyway. The files are in \`../../../scripts/fidgets/source/crunch/\`.

**These are NOT recordings of soap crunch slime or sugar beads.** They are similar materials used as stand-ins:
C01 uses styrofoam crushing/cracking; C02 uses plastic beads (collisions) and sugar granules (friction). Clips were picked automatically from the
waveform and **have not been listened to**. Changes: cut at detected strikes (${c.counts.extractedClips} clips from ${c.counts.sourceFiles} files), faded, peak-normalised to −1 dBFS, loudness-matched within each pool.

| id | title | author | url | licence | retrieved | material |
|---|---|---|---|---|---|---|
${Object.entries(c.sources).map(([id, s]) => row(id, s)).join('\n')}

## Counting

\`recordings\` = distinct passages cut from the files above; \`variants\` = derived copies (0). The player adds a ±3–5 % speed/pitch jitter and picks
clips so that none repeats back-to-back — that jitter is playback variation, not additional recordings.
`;
  fs.writeFileSync(path.join(OUT, 'CREDITS.md'), t);
  console.log('\nCREDITS.md written');
}
