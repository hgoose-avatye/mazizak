// usage: node decode.mjs <srcdir> <outdir>  -> decodes every .mp3 to mono float32 @44100 (.f32)
import { chromium } from 'playwright-core';
import fs from 'node:fs'; import path from 'node:path';
const [src, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); await p.setContent('<html></html>');
for (const f of fs.readdirSync(src).filter(f => f.endsWith('.mp3'))) {
  const o = path.join(out, f.replace(/\.mp3$/, '.f32'));
  if (fs.existsSync(o)) continue;
  const b64 = fs.readFileSync(path.join(src, f)).toString('base64');
  const res = await p.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buf = await ctx.decodeAudioData(bin.buffer);
    const n = buf.length, m = new Float32Array(n);
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) m[i] += d[i] / buf.numberOfChannels; }
    let s = ''; const u8 = new Uint8Array(m.buffer); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { sr: buf.sampleRate, ch: buf.numberOfChannels, data: btoa(s) };
  }, b64);
  fs.writeFileSync(o, Buffer.from(res.data, 'base64'));
  console.log(f, res.sr, 'ch', res.ch, (fs.statSync(o).size / 4 / 44100).toFixed(2) + 's');
}
await b.close();
