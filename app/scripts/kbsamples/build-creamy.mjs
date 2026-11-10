// Build the "creamy-thocky" keyboard sprite from the CC BY 4.0 Mechvibes pack "My Sound Pack" (Chevy).
// Source files: scripts/kbsamples/source/creamy-thocky/*.ogg (+ original config.json, kept for provenance).
// Input (decoded, NOT committed): bench-out/audio-src/creamy-thocky/<name>.wav
//   for f in scripts/kbsamples/source/creamy-thocky/*.ogg; do
//     ffmpeg -i "$f" -c:a pcm_s16le "bench-out/audio-src/creamy-thocky/$(basename "${f%.ogg}").wav"; done
// Output: public/sfx/keyboard/creamy-thocky.{wav,json}
//
// Usage: node scripts/kbsamples/build-creamy.mjs
//
// What is (and is not) done — see public/sfx/keyboard/CREDITS.md:
//   • each source clip is used whole as one key-DOWN sound (that is how the Mechvibes pack plays it);
//     clips are NOT split into down/up halves and the pack's key mapping is NOT used (unverified by ear)
//   • leading/trailing near-silence (below peak −45 / −50 dB) trimmed, 0.5 ms fade-in + 8 ms fade-out
//   • peak-normalised to −1 dBFS in the sprite; JSON `gain` (≤ 1) then matches clip loudness (RMS)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IN = path.join(ROOT, 'bench-out/audio-src/creamy-thocky');
const OUT = path.join(ROOT, 'public/sfx/keyboard');
const SR = 48000;
const GAP = 480; // 10 ms of silence between sprite entries (same as pebble/clack)
const MAX_GAIN_DB = 26; // guard against excessive amplification
const PEAK = Math.pow(10, -1 / 20);
const db = (v) => 20 * Math.log10(Math.max(v, 1e-9));
// pool order: the pack's default-key clip first
const CLIPS = ['OtherKeys', '2', 'BackSpace', 'Shift', 'Space'];

function readWav(file) {
  const b = fs.readFileSync(file);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 12, fmt, data;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = v.getUint32(p + 4, true), body = p + 8;
    if (id === 'fmt ') fmt = { tag: v.getUint16(body, true), ch: v.getUint16(body + 2, true), sr: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    if (id === 'data') { const n = size / 2; data = new Float32Array(n); for (let i = 0; i < n; i++) data[i] = v.getInt16(body + i * 2, true) / 32768; }
    p = body + size + (size & 1);
  }
  if (!fmt || fmt.tag !== 1 || fmt.ch !== 1 || fmt.bits !== 16 || fmt.sr !== SR) throw new Error(`${file}: need 16-bit mono ${SR} Hz PCM, got ${JSON.stringify(fmt)}`);
  return data;
}
const peakOf = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rmsOf = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

const stats = [];
const proc = CLIPS.map((name) => {
  const raw = readWav(path.join(IN, `${name}.wav`));
  const pk = peakOf(raw);
  // start: 0.5 ms before the first sample above peak −45 dB. Only near-silence is trimmed: quiet lead-in material
  // (e.g. BackSpace has ~80 ms at −30…−40 dB before its loud hit) is kept, because without listening we cannot tell
  // whether it is part of the keystroke or noise.
  const on = raw.findIndex((v) => Math.abs(v) >= pk * Math.pow(10, -45 / 20));
  const start = Math.max(0, on - Math.round(0.0005 * SR));
  // end: last 2 ms RMS frame above peak −50 dB
  const thr = pk * Math.pow(10, -50 / 20), hop = 96;
  let end = raw.length;
  for (let i = raw.length - hop; i >= start; i -= hop) { if (rmsOf(raw.subarray(i, i + hop)) > thr) { end = Math.min(raw.length, i + hop + Math.round(0.004 * SR)); break; } }
  const seg = raw.slice(start, end);
  const g = PEAK / pk;
  if (db(g) > MAX_GAIN_DB) throw new Error(`${name}: needs ${db(g).toFixed(1)} dB of gain (> ${MAX_GAIN_DB})`);
  const fi = Math.round(0.0005 * SR), fo = Math.round(0.008 * SR);
  const y = seg.map((v, i) => {
    let w = 1;
    if (i < fi) w *= i / fi;
    if (i >= seg.length - fo) w *= 0.5 + 0.5 * Math.cos((Math.PI * (i - (seg.length - fo))) / fo);
    return v * g * w;
  });
  stats.push({ name, srcPeakDb: db(pk), srcRmsDb: db(rmsOf(raw)), trimStartMs: (start / SR) * 1000, trimEndMs: ((raw.length - end) / SR) * 1000, boostDb: db(g), y });
  return { name, y, start, end };
});
// loudness match: attenuate louder clips down to the quietest (RMS over the whole trimmed clip) → gain ≤ 1
const rmsAll = proc.map((c) => rmsOf(c.y));
const target = Math.min(...rmsAll);

let total = 0;
for (const c of proc) total += c.y.length + GAP;
total -= GAP;
const sprite = new Float32Array(total);
const entries = [];
let pos = 0;
proc.forEach((c, i) => {
  sprite.set(c.y, pos);
  const gain = Math.round((target / rmsAll[i]) * 1e4) / 1e4;
  entries.push({
    start: pos,
    length: c.y.length,
    offset: Math.round((pos / SR) * 1e6) / 1e6,
    duration: Math.round((c.y.length / SR) * 1e6) / 1e6,
    gain,
    src: `mechvibes:my-sound-pack-5/${c.name}.ogg`,
    srcStart: Math.round((c.start / SR) * 1e4) / 1e4,
    srcEnd: Math.round((c.end / SR) * 1e4) / 1e4,
  });
  stats[i].gain = gain;
  stats[i].outPeakDb = db(peakOf(c.y) * gain);
  stats[i].outRmsDb = db(rmsAll[i] * gain);
  stats[i].outLenMs = (c.y.length / SR) * 1000;
  pos += c.y.length + GAP;
});

// 16-bit mono PCM WAV
const wav = Buffer.alloc(44 + sprite.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + sprite.length * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(sprite.length * 2, 40);
for (let i = 0; i < sprite.length; i++) wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sprite[i] * 32767))), 44 + i * 2);
fs.writeFileSync(path.join(OUT, 'creamy-thocky.wav'), wav);

const map = {
  version: 1,
  preset: 'creamy-thocky',
  file: 'creamy-thocky.wav',
  sampleRate: SR,
  channels: 1,
  bitDepth: 16,
  totalSamples: sprite.length,
  upMode: 'none',
  source: 'My Sound Pack by Chevy (Mechvibes) — CC BY 4.0 as labelled on the pack page',
  notes:
    'Each source clip is used whole as a key-DOWN sound. Release (up/spaceUp) is intentionally empty (upMode "none": no release sound). ' +
    'spaceDown is empty (falls back to the down pool). The pack config.json key mapping was NOT used: its Space/Shift/Escape assignments look swapped ' +
    'and could not be verified by listening. Each source clip shows two strong transients ~80–110 ms apart (possibly press + release); not confirmed by ear. See CREDITS.md.',
  sources: {
    'mechvibes:my-sound-pack-5': {
      title: 'My Sound Pack',
      author: 'Chevy',
      url: 'https://mechvibes.com/sound-packs/my-sound-pack-5',
      license: 'CC BY 4.0 (label on the pack page; uploader’s underlying rights not independently verified)',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      retrieved: '2026-11-10',
      file: 'https://mechvibes.com/api/sound-packs/mv-2263bade9c724dd98ef92e743a6303b2/download',
      originals: 'scripts/kbsamples/source/creamy-thocky/*.ogg',
    },
  },
  entries: { down: entries, up: [], spaceDown: [], spaceUp: [] },
};
fs.writeFileSync(path.join(OUT, 'creamy-thocky.json'), JSON.stringify(map, null, 1) + '\n');

console.log('clip        srcPeak  srcRMS  trim(start/end ms)  boost  gain   outPeak outRMS  len(ms)');
for (const s of stats)
  console.log(`${s.name.padEnd(10)} ${s.srcPeakDb.toFixed(1).padStart(7)} ${s.srcRmsDb.toFixed(1).padStart(7)}  ${s.trimStartMs.toFixed(1).padStart(6)}/${s.trimEndMs.toFixed(1).padEnd(6)}  ${('+' + s.boostDb.toFixed(1)).padStart(6)} ${s.gain.toFixed(3)}  ${s.outPeakDb.toFixed(1).padStart(6)} ${s.outRmsDb.toFixed(1).padStart(6)}  ${s.outLenMs.toFixed(0)}`);
console.log(`sprite: ${sprite.length} samples (${(sprite.length / SR).toFixed(3)} s), ${wav.length} bytes`);
