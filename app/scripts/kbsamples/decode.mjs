// Decode source MP3s (bench-out/audio-src/keyboard/*.mp3) to mono Float32 @48k via system Chrome.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2];
const SR = 48000;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage();
await page.setContent('<html></html>');
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.mp3'))) {
  const out = path.join(dir, f.replace(/\.mp3$/, '.f32'));
  if (fs.existsSync(out)) continue;
  const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
  const res = await page.evaluate(async ({ b64, SR }) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ctx = new OfflineAudioContext(1, 1, SR);
    const buf = await ctx.decodeAudioData(bin.buffer);
    const n = buf.length, m = new Float32Array(n);
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) m[i] += d[i] / buf.numberOfChannels; }
    let s = ''; const u8 = new Uint8Array(m.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { ch: buf.numberOfChannels, sr: buf.sampleRate, n, data: btoa(s) };
  }, { b64, SR });
  fs.writeFileSync(out, Buffer.from(res.data, 'base64'));
  console.log(f, 'ch', res.ch, 'sr', res.sr, 'sec', (res.n / res.sr).toFixed(2));
}
await browser.close();
