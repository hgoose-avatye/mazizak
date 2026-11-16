// WAV vs FLAC decode experiment (experiment only: nothing in the app uses FLAC). Usage: node scripts/flac-experiment.mjs <dir with wav/ and flac/>
import { chromium, webkit, firefox } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dir = path.resolve(process.argv[2]);
const server = http.createServer((q, r) => { const p = path.join(dir, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(dir) || !fs.existsSync(p)) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', p.endsWith('.wav') ? 'audio/wav' : p.endsWith('.flac') ? 'audio/flac' : 'text/html'); r.end(fs.readFileSync(p)); });
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>x</title>');
const names = fs.readdirSync(path.join(dir, 'wav')).map((f) => f.slice(0, -4));
const launchers = { chrome: () => chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true }), webkit: () => webkit.launch(process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {}), firefox: () => firefox.launch() };
const out = {};
for (const [bn, launch] of Object.entries(launchers)) {
  let browser; try { browser = await launch(); } catch (e) { out[bn] = { unavailable: String(e).split('\n')[0] }; continue; }
  const page = await browser.newPage(); await page.goto(base + '/index.html');
  out[bn] = await page.evaluate(async ({ names }) => {
    const AC = window.AudioContext || window.webkitAudioContext;
    const res = {};
    for (const n of names) {
      const ctx = new AC({ sampleRate: 48000 });
      const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.arrayBuffer(); };
      const w = await get(`wav/${n}.wav`);
      let f; try { f = await get(`flac/${n}.flac`); } catch (e) { res[n] = { error: String(e) }; continue; }
      const time = async (ab) => { const ts = []; let buf; for (let i = 0; i < 5; i++) { const c = ab.slice(0); const t = performance.now(); try { buf = await ctx.decodeAudioData(c); } catch (e) { return { error: String(e && e.message || e) }; } ts.push(performance.now() - t); } ts.sort((a, b) => a - b); return { ms: +ts[2].toFixed(1), buf }; };
      const a = await time(w), b = await time(f);
      if (b.error) { res[n] = { wavMs: a.ms, flacError: b.error }; continue; }
      const x = a.buf.getChannelData(0), y = b.buf.getChannelData(0);
      let max = 0; for (let i = 0; i < Math.min(x.length, y.length); i++) max = Math.max(max, Math.abs(x[i] - y[i]));
      res[n] = { wavMs: a.ms, flacMs: b.ms, sameLength: x.length === y.length, maxAbsDiff: max, decodedMB: +(x.length * 4 / 1048576).toFixed(2) };
      ctx.close();
    }
    return res;
  }, { names });
  await browser.close();
}
console.log(JSON.stringify(out, null, 1));
server.close();
