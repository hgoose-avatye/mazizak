// Every toy in the dock plays: enter each fidget and keyboard preset from the real UI (built dist), touch it, count the sounds.
// Usage: node scripts/play-all.mjs [distDir]    env: BROWSER=chrome|webkit (WEBKIT_PATH)
import { chromium, webkit } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dist = path.resolve(process.argv[2] ?? 'dist');
const T = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.flac': 'audio/flac', '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const server = http.createServer((q, r) => { const p = path.join(dist, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', T[path.extname(p)] ?? 'application/octet-stream'); r.end(fs.readFileSync(p)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const B = process.env.BROWSER ?? 'chrome';
const browser = B === 'webkit' ? await webkit.launch({ executablePath: process.env.WEBKIT_PATH }) : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage(); const errors = [], reqs = [];
page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => /\[sfx\]/.test(m.text()) && errors.push(m.text()));
page.on('request', (q) => /\/sfx\//.test(q.url()) && reqs.push(q.url().split('/sfx/')[1]));
await page.addInitScript(() => { window.__sounds = []; const o = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { if (this.buffer && this.buffer.duration > 0.01) window.__sounds.push(performance.now()); return o.apply(this, a); }; });
await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.locator('.toy-item').first().waitFor();
const up = async (title) => { const t0 = Date.now(); while (Date.now() - t0 < 30000) { if (await page.evaluate((t) => document.getElementById('stage').classList.contains('active') && document.title.startsWith(t), title)) return true; await sleep(100); } return false; };
const xy = await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.5]; });
const press = async (ms) => { await page.mouse.move(xy[0], xy[1]); await page.mouse.down(); for (let k = 0; k < ms / 50; k++) { await page.mouse.move(xy[0] + (k % 6) * 6, xy[1] + (k % 4) * 8); await sleep(50); } await page.mouse.up(); };
const rows = [];
const fidgets = await page.$$eval('.toy-item', (a) => a.map((b) => [b.dataset.key, (b.querySelector('.name') ?? b).textContent.trim()]));
for (const [key, name] of fidgets) {
  await page.locator(`.toy-item[data-key="${key}"]`).scrollIntoViewIfNeeded(); await page.click(`.toy-item[data-key="${key}"]`);
  const ok = await up(name); await sleep(1500);
  const n0 = await page.evaluate(() => window.__sounds.length);
  for (let i = 0; i < 4; i++) { await page.mouse.click(xy[0], xy[1]); await sleep(150); }
  await press(900); await sleep(300);
  rows.push({ toy: `${key} ${name}`, opened: ok, sounds: (await page.evaluate(() => window.__sounds.length)) - n0 });
}
await page.click('[data-category="keyboard"]'); await up('키보드');
const presets = await page.$$eval('.toy-item', (a) => a.map((b) => [b.dataset.key, (b.querySelector('.name') ?? b).textContent.trim()]));
for (const [key, name] of presets) {
  await page.locator(`.toy-item[data-key="${key}"]`).scrollIntoViewIfNeeded(); await page.click(`.toy-item[data-key="${key}"]`);
  await sleep(1800);
  const n0 = await page.evaluate(() => window.__sounds.length);
  for (const k of ['KeyQ', 'KeyA', 'KeyS', 'Space', 'KeyZ']) { await page.keyboard.press(k, { delay: 40 }); await sleep(80); }
  rows.push({ toy: `keyboard ${key} ${name}`, opened: await page.evaluate((p) => location.hash === '#/keyboard/' + p, key), sounds: (await page.evaluate(() => window.__sounds.length)) - n0 });
}
for (const r of rows) console.log((r.opened && r.sounds > 0 ? 'PASS' : 'FAIL'), r.toy.padEnd(34), 'sounds', r.sounds);
const dup = reqs.filter((u, i) => reqs.indexOf(u) !== i);
console.log(`[${B}] ${rows.filter((r) => r.opened && r.sounds > 0).length}/${rows.length} toys play · ${reqs.length} sound files fetched, ${dup.length} duplicates${dup.length ? ' ' + dup.join(',') : ''} · ${reqs.filter((u) => /\.wav$/.test(u)).length} WAV · errors: ${errors.length ? errors.join(' | ') : 'none'}`);
await browser.close(); server.close(); process.exit(rows.every((r) => r.opened && r.sounds > 0) && !dup.length && !errors.length ? 0 : 1);
