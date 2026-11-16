// Decode + playback check of the shipped FLAC in real browser engines, against the source WAV sprites.
// Usage: node scripts/audio/verify-browsers.mjs        env: WEBKIT_PATH (a local Playwright WebKit build), BROWSERS=chrome,webkit,firefox
//
// For every engine and device rate (48 kHz, 44.1 kHz — decodeAudioData resamples to the context rate):
//  - keyboard presets / squishy: the whole decoded FLAC vs the whole decoded source WAV
//  - fidget chunks: every clip cut the way the app cuts it (offset/duration in seconds, gain) from the new chunk vs from the old sprite
//  - playback: one clip per file played through an OfflineAudioContext; the rendered output must equal the clip
// Prints the largest sample difference per group (0 = identical).
import { chromium, webkit, firefox } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIME = { '.json': 'application/json', '.flac': 'audio/flac', '.wav': 'audio/wav', '.html': 'text/html' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') { r.setHeader('Content-Type', 'text/html'); return r.end('<!doctype html><title>verify</title>'); }
  const p = path.join(ROOT, u);
  if (!(p.startsWith(path.join(ROOT, 'public/sfx')) || p.startsWith(path.join(ROOT, 'audio-src/sfx'))) || !fs.existsSync(p)) { r.statusCode = 404; return r.end(); }
  r.setHeader('Content-Type', MIME[path.extname(p)] ?? 'application/octet-stream');
  r.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const manifestSrc = fs.readFileSync(path.join(ROOT, 'src/audio/sfxManifest.ts'), 'utf8');
const grab = (name) => JSON.parse(manifestSrc.match(new RegExp(`export const ${name}[^=]*= (\\{[\\s\\S]*?\\n\\});`))[1]);
const jobs = {
  whole: [
    ...Object.entries(grab('SFX_KEYBOARD')).map(([id, f]) => ({ name: `keyboard/${id}`, src: `/audio-src/sfx/keyboard/${id}.json`, flac: `/public/${f.audio}`, map: `/public/${f.json}` })),
    { name: 'squishy', src: '/audio-src/sfx/squishy/squishy.json', flac: `/public/${grab('SFX_SQUISHY').audio}`, map: `/public/${grab('SFX_SQUISHY').json}` },
  ],
  chunks: Object.entries(grab('SFX_FIDGET_CHUNKS')).map(([name, f]) => ({ name, src: `/audio-src/sfx/fidgets/${name.split('.')[0]}.json`, flac: `/public/${f.audio}`, map: `/public/${f.json}` })),
};
const engines = {
  chrome: () => chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true }),
  webkit: () => webkit.launch(process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {}),
  firefox: () => firefox.launch(),
};
const out = {};
for (const name of (process.env.BROWSERS ?? 'chrome,webkit,firefox').split(',')) {
  let browser;
  try { browser = await engines[name](); } catch (e) { out[name] = { unavailable: String(e.message ?? e).split('\n')[0] }; console.log(name, 'unavailable'); continue; }
  const page = await browser.newPage();
  await page.goto(BASE + '/');
  out[name] = { version: browser.version() };
  for (const rate of [48000, 44100]) {
    out[name][rate] = await page.evaluate(async ({ jobs, rate }) => {
      const ctx = new OfflineAudioContext(1, rate, rate);
      const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r; };
      const decode = async (u) => ctx.decodeAudioData(await (await get(u)).arrayBuffer());
      const cut = (buf, offset, duration, gain = 1) => { const sr = buf.sampleRate, src = buf.getChannelData(0), i0 = Math.max(0, Math.round(offset * sr)), n = Math.max(1, Math.min(src.length - i0, Math.round(duration * sr))); const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = src[i0 + i] * gain; return o; };
      const diff = (a, b) => { if (a.length !== b.length) return Infinity; let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
      const play = async (clip) => { // render the clip through a real source node
        const oc = new OfflineAudioContext(1, clip.length, rate), b = oc.createBuffer(1, clip.length, rate);
        b.getChannelData(0).set(clip); const s = oc.createBufferSource(); s.buffer = b; s.connect(oc.destination); s.start(0);
        const r = await oc.startRendering(); return diff(r.getChannelData(0), clip);
      };
      const res = { whole: { maxDiff: 0, files: 0 }, clips: { maxDiff: 0, count: 0, lengthMismatch: 0 }, playback: { maxDiff: 0, count: 0 }, errors: [] };
      for (const j of jobs.whole) {
        try {
          const srcMap = await (await get(j.src)).json();
          const [a, b] = await Promise.all([decode(j.src.replace(/[^/]+$/, srcMap.file)), decode(j.flac)]);
          const d = diff(a.getChannelData(0), b.getChannelData(0));
          if (d === Infinity) { // same PCM, different decoded length: compare the common part and report the lengths
            const n = Math.min(a.length, b.length);
            res.whole.lengthMismatch = [...(res.whole.lengthMismatch ?? []), `${j.name}: wav ${a.length} vs flac ${b.length} (common part maxDiff ${diff(a.getChannelData(0).subarray(0, n), b.getChannelData(0).subarray(0, n))})`];
          } else res.whole.maxDiff = Math.max(res.whole.maxDiff, d);
          res.whole.files++;
          const c = b.getChannelData(0).subarray(0, Math.min(b.length, rate));
          res.playback.maxDiff = Math.max(res.playback.maxDiff, await play(c)); res.playback.count++;
        } catch (e) { res.errors.push(`${j.name}: ${e.message ?? e}`); }
      }
      const srcCache = {};
      for (const j of jobs.chunks) {
        try {
          const srcMap = await (await get(j.src)).json();
          srcCache[j.src] ??= decode(j.src.replace(/[^/]+$/, srcMap.file));
          const [old, neu, map] = await Promise.all([srcCache[j.src], decode(j.flac), get(j.map).then((r) => r.json())]);
          let first = null;
          for (const [pool, meta] of Object.entries(map.pools)) meta.entries.forEach((e, i) => {
            const o = srcMap.pools[pool].entries[i];
            const a = cut(old, o.offset, o.duration, o.gain), b = cut(neu, e.offset, e.duration, e.gain);
            if (a.length !== b.length) res.clips.lengthMismatch++;
            res.clips.maxDiff = Math.max(res.clips.maxDiff, diff(a, b));
            res.clips.count++;
            first ??= b;
          });
          res.playback.maxDiff = Math.max(res.playback.maxDiff, await play(first)); res.playback.count++;
        } catch (e) { res.errors.push(`${j.name}: ${e.message ?? e}`); }
      }
      return res;
    }, { jobs, rate });
    const r = out[name][rate];
    console.log(`${name} ${out[name].version} @${rate}: whole files ${r.whole.files} maxDiff ${r.whole.maxDiff}${r.whole.lengthMismatch ? ' LENGTH ' + r.whole.lengthMismatch.join('; ') : ''} · clips ${r.clips.count} maxDiff ${r.clips.maxDiff} lenMismatch ${r.clips.lengthMismatch} · playback ${r.playback.count} maxDiff ${r.playback.maxDiff}${r.errors.length ? ' · ERRORS ' + r.errors.join(' | ') : ''}`);
  }
  await browser.close();
}
fs.mkdirSync(path.join(ROOT, 'bench-out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'bench-out/verify-browsers.json'), JSON.stringify(out, null, 1));
server.close();
