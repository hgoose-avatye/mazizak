// Build Turquoise Tealios and Buckling Spring from the 24 unmodified kbsim MP3s.
// No trim, EQ, pitch shift or per-clip normalisation: preserve the source's relative levels.
// Usage: node scripts/kbsamples/build-kbsim-presets.mjs (CHROME_PATH overrides system Chrome).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
for (const [preset, upstream] of [['turquoise-tealios', 'turquoise'], ['ibm-buckling-spring', 'buckling']]) {
const source = path.join(root, `scripts/kbsamples/source/${preset}`);
const out = path.join(root, 'public/sfx/keyboard');
const sr = 48000, gap = 480;
const spec = [
  ...Array.from({ length: 5 }, (_, i) => ['down', `press/GENERIC_R${i}.mp3`]),
  ['up', 'release/GENERIC.mp3'],
  ['spaceDown', 'press/SPACE.mp3'], ['spaceUp', 'release/SPACE.mp3'],
  ['enterDown', 'press/ENTER.mp3'], ['enterUp', 'release/ENTER.mp3'],
  ['backspaceDown', 'press/BACKSPACE.mp3'], ['backspaceUp', 'release/BACKSPACE.mp3'],
];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const clips = [];
try {
  const page = await browser.newPage();
  for (const [role, name] of spec) {
    const bytes = fs.readFileSync(path.join(source, name));
    const data = await page.evaluate(async ({ b64, sr }) => {
      const ctx = new OfflineAudioContext(1, 1, sr);
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const decoded = await ctx.decodeAudioData(bytes.buffer);
      const mono = new Float32Array(decoded.length);
      for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
        const x = decoded.getChannelData(ch);
        for (let i = 0; i < x.length; i++) mono[i] += x[i] / decoded.numberOfChannels;
      }
      return Array.from(mono);
    }, { b64: bytes.toString('base64'), sr });
    clips.push({ role, name, data, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
} finally { await browser.close(); }
const totalSamples = clips.reduce((n, c) => n + c.data.length + gap, -gap);
const wav = Buffer.alloc(44 + totalSamples * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(totalSamples * 2, 40);
const entries = {};
let pos = 0;
for (const c of clips) {
  for (let i = 0; i < c.data.length; i++) {
    if (!Number.isFinite(c.data[i]) || Math.abs(c.data[i]) >= 1) throw new Error(`${c.name}: invalid/clipping sample`);
    wav.writeInt16LE(Math.round(c.data[i] * 32767), 44 + (pos + i) * 2);
  }
  (entries[c.role] ??= []).push({ start: pos, length: c.data.length, offset: pos / sr, duration: c.data.length / sr, gain: 1, src: c.name, sha256: c.sha256 });
  pos += c.data.length + gap;
}
const map = {
  version: 1, preset, file: `${preset}.wav`, sampleRate: sr, channels: 1, totalSamples, rowDown: true,
  source: { url: 'https://github.com/tplai/kbsim', commit: 'ba103f3b0afa9dab80447aa2e7e2ed80b6bd80e4', path: `src/assets/audio/${upstream}`, copyright: 'Copyright (c) Thomas Lai', license: 'MIT', recordingProvenance: 'Unverified: no separate recording authorship or rights statement found in upstream.' },
  changes: 'Chromium MP3 decode; stereo averaged to mono; resampled to 48 kHz; quantised to 16-bit PCM; 10 ms sprite gaps. No trim, EQ, pitch or level changes.',
  entries,
};
fs.writeFileSync(path.join(out, `${preset}.wav`), wav);
fs.writeFileSync(path.join(out, `${preset}.json`), JSON.stringify(map, null, 2) + '\n');
console.log(`${preset}: ${clips.length} sources → ${totalSamples} samples / ${wav.length} bytes`);

}
