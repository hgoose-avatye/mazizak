// Build the "clack" (까랑까랑) sprite from recorded bank B of branch sound/recorded-ab:
// Freesound 755222 "Keyboard slow typing with Gateron Blue switches + low echo" (forfii, CC0).
// Source: scripts/kbsamples/source/clack-b/ (27 mono 48 kHz 16-bit WAVs + clack-b.json), cut and level-matched by that
// branch's scripts/sound/build_bank.py; they are copied here UNCHANGED (no re-trim, no re-level).
// Output: public/sfx/keyboard/clack.{wav,json}   (replaces the previous WhiteFox sprite built by build.mjs)
//
// The toy plays recorded keyboard samples with +6 dB makeup; branch B was designed for gain 0, so every entry carries
// gain = 10^(-6/20) to land at the same loudness as in branch B.
//
// Usage: node scripts/kbsamples/build-clack-b.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'scripts/kbsamples/source/clack-b');
const OUT = path.join(ROOT, 'public/sfx/keyboard');
const SR = 48000;
const GAP = 480; // 10 ms silence between entries
const GAIN = Math.round(Math.pow(10, -6 / 20) * 1e4) / 1e4;
const ROLES = ['down', 'up', 'spaceDown', 'spaceUp'];

function readWav(file) {
  const b = fs.readFileSync(file);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 12, fmt, data;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = v.getUint32(p + 4, true), body = p + 8;
    if (id === 'fmt ') fmt = { tag: v.getUint16(body, true), ch: v.getUint16(body + 2, true), sr: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    if (id === 'data') data = new Int16Array(b.buffer.slice(b.byteOffset + body, b.byteOffset + body + size));
    p = body + size + (size & 1);
  }
  if (!fmt || fmt.tag !== 1 || fmt.ch !== 1 || fmt.bits !== 16 || fmt.sr !== SR) throw new Error(`${file}: need 16-bit mono ${SR} Hz PCM, got ${JSON.stringify(fmt)}`);
  return data;
}

const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'clack-b.json'), 'utf8'));
const clips = [];
for (const r of ROLES) for (const f of manifest.roles[r].files) clips.push({ role: r, file: f, pcm: readWav(path.join(SRC, f)) });
const total = clips.reduce((n, c) => n + c.pcm.length + GAP, -GAP);
const sprite = new Int16Array(total);
const entries = Object.fromEntries(ROLES.map((r) => [r, []]));
let pos = 0;
for (const c of clips) {
  sprite.set(c.pcm, pos);
  entries[c.role].push({
    start: pos,
    length: c.pcm.length,
    offset: Math.round((pos / SR) * 1e6) / 1e6,
    duration: Math.round((c.pcm.length / SR) * 1e6) / 1e6,
    gain: GAIN,
    src: 'freesound:755222',
    file: c.file,
  });
  pos += c.pcm.length + GAP;
}

const wav = Buffer.alloc(44 + sprite.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + sprite.length * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(sprite.length * 2, 40);
Buffer.from(sprite.buffer).copy(wav, 44);
fs.writeFileSync(path.join(OUT, 'clack.wav'), wav);

const src = manifest.sources[0];
const map = {
  version: 1,
  preset: 'clack',
  file: 'clack.wav',
  sampleRate: SR,
  channels: 1,
  bitDepth: 16,
  totalSamples: sprite.length,
  source: 'Gateron Blue click — freesound:755222 by forfii, CC0 (recorded bank B of branch sound/recorded-ab)',
  notes:
    'Replaces the earlier WhiteFox/Hako Violet sprite (git: c6d7209). Clips were cut and level-matched by sound/recorded-ab scripts/sound/build_bank.py and are copied unchanged. ' +
    'Entry gain 0.5012 (−6 dB) cancels the toy’s +6 dB makeup so the loudness equals branch B. The source is the Freesound public HQ preview (OGG ~192 kbps), not the original upload. Not listened to by the author of this file.',
  sources: { 'freesound:755222': { title: src.title, author: src.author, url: src.url, license: src.license, licenseUrl: src.licenseUrl, sha256: src.sha256, retrieved: src.verified, file: src.media } },
  srcTimesAre: 'not recorded here: the cut points live in sound/recorded-ab sound-src/edit-spec.json + candidates-keyboard.json',
  entries,
};
fs.writeFileSync(path.join(OUT, 'clack.json'), JSON.stringify(map, null, 1) + '\n');
console.log(Object.fromEntries(ROLES.map((r) => [r, entries[r].length])), `${sprite.length} samples, ${wav.length} bytes, gain ${GAIN}`);
