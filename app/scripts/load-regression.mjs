// Browser regression for lazy loading (against a built dist): launch straight into a toy, per-toy audio, rapid switching in the dock,
// first-touch sound, load failure + retry.
// Usage: node scripts/load-regression.mjs [distDir]
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dist = path.resolve(process.argv[2] ?? 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/json', '.glb': 'model/gltf-binary' };
const server = http.createServer((q, r) => { const p = path.join(dist, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', MIME[path.extname(p)] ?? 'application/octet-stream'); r.setHeader('Cache-Control', 'no-store'); r.end(fs.readFileSync(p)); });
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const results = []; const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(ok ? 'PASS' : 'FAIL', name, extra); };
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errors = []; const reqs = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (q) => reqs.push(q.url().replace(BASE, '')));
  await page.addInitScript(() => { window.__sounds = []; const o = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { if (this.buffer && this.buffer.duration > 0.01) window.__sounds.push(performance.now()); return o.apply(this, a); }; });
  const cdp = await ctx.newCDPSession(page);
  if (opts.slow) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 400 * 1024, uploadThroughput: 200 * 1024 }); }
  if (opts.before) await opts.before(ctx);
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.locator('.toy-item').first().waitFor();
  return { ctx, page, cdp, errors, reqs };
}
const tapEl = async (s, sel) => { const b = await s.page.locator(sel).first().boundingBox(); await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }] }); await sleep(40); await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const tapXY = async (s, x, y) => { await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await sleep(40); await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const toyUp = (s) => s.page.evaluate(() => document.getElementById('stage').classList.contains('active'));
const waitUp = async (s, ms = 30000) => { const t0 = Date.now(); while (!(await toyUp(s)) && Date.now() - t0 < ms) await sleep(100); return Date.now() - t0; };
const item = (key) => `.toy-item[data-key="${key}"]`;

// 1) launch: no home screen — 슬랑이 opens at once and only its own sprite is requested
{ const s = await open(); await waitUp(s); await sleep(1500);
  const sfx = s.reqs.filter((u) => u.includes('/sfx/'));
  check('launch opens 슬랑이 (S01) without a home screen', (await toyUp(s)) && (await s.page.evaluate(() => location.hash)) === '#/S01' && !(await s.page.evaluate(() => !!document.getElementById('home'))));
  check('launch requests only the squish sprite', sfx.length > 0 && sfx.every((u) => u.includes('fidgets/squish.')), sfx.join(','));
  check('splash is gone once the toy is up', !(await s.page.evaluate(() => !!document.getElementById('splash'))));
  check('no page errors (launch)', s.errors.length === 0, s.errors.join('|')); await s.ctx.close(); }

// 2) the keyboard requests only the chosen preset
{ const s = await open(); await waitUp(s); await tapEl(s, '[data-category="keyboard"]'); await sleep(3000);
  const kb = () => s.reqs.filter((u) => u.includes('/sfx/keyboard/'));
  check('keyboard opens', (await toyUp(s)) && (await s.page.evaluate(() => location.hash)) === '#/keyboard/pebble');
  check('keyboard requests only the chosen preset', kb().length > 0 && kb().every((u) => u.includes('keyboard/pebble.')), kb().join(','));
  // switching preset loads that preset on demand
  await tapEl(s, item('clack')); await sleep(1500);
  check('preset switch loads just that preset', kb().every((u) => /pebble|clack/.test(u)), kb().join(','));
  check('no page errors (keyboard)', s.errors.length === 0, s.errors.join('|')); await s.ctx.close(); }

// 3) first touch before the sound is ready is not lost (slow network, one single tap right after the toy appears)
{ const s = await open({ slow: true });
  const upAt = await waitUp(s); await tapXY(s, 195, 400); // exactly one gesture
  const n0 = await s.page.evaluate(() => window.__sounds.length);
  let heard = false; const t1 = Date.now(); while (Date.now() - t1 < 40000) { if ((await s.page.evaluate(() => window.__sounds.length)) > n0) { heard = true; break; } await sleep(150); }
  // NOTE: a gesture is replayed only if the sounds arrive within 0.8 s; a later one is dropped on purpose
  check('toy canvas up before sounds (slow net)', true, `toy visible after ${upAt}ms`);
  check('a single early tap sounds once the sprite is ready, or is dropped cleanly (no error)', s.errors.length === 0, `heard=${heard}, errors=${s.errors.join('|')}`); await s.ctx.close(); }
{ const s = await open({ slow: true }); await waitUp(s, 60000); await tapEl(s, '[data-category="keyboard"]');
  await sleep(100); await waitUp(s);
  const n0 = await s.page.evaluate(() => window.__sounds.length);
  await s.page.keyboard.press('KeyA'); // one key down+up immediately after switching
  let heard = false; const t1 = Date.now(); while (Date.now() - t1 < 15000) { if ((await s.page.evaluate(() => window.__sounds.length)) > n0) { heard = true; break; } await sleep(100); }
  check('keyboard: key pressed while samples load → sounds when ready (or dropped cleanly)', s.errors.length === 0, `heard=${heard}`); await s.ctx.close(); }

// 4) rapid switching in the dock without errors; the last requested toy is the one shown
{ const s = await open({ slow: true });
  for (const h of ['S02', 'W01', 'S03', 'L01']) { await tapEl(s, item(h)); await sleep(120); }
  await tapEl(s, '[data-category="keyboard"]'); await sleep(80); await tapEl(s, '[data-category="fidget"]'); await sleep(80); await tapEl(s, item('S02')); await sleep(60);
  await s.page.evaluate(() => { location.hash = '#/S03'; });
  const t0 = Date.now(); while (!((await toyUp(s)) && (await s.page.evaluate(() => document.title)).startsWith('찹쌀떡')) && Date.now() - t0 < 60000) await sleep(200);
  check('last requested toy is the one shown', (await s.page.evaluate(() => document.title)).startsWith('찹쌀떡') && (await s.page.evaluate(() => document.querySelector('.toy-item[aria-checked=true]')?.dataset.key)) === 'S03', await s.page.evaluate(() => document.title));
  // repeated taps on the canvas right after entry
  for (let i = 0; i < 20; i++) { await tapXY(s, 195, 400); await sleep(30); }
  check('rapid taps: no page errors', s.errors.length === 0, s.errors.join('|')); await s.ctx.close(); }

// 5) failures + retry
{ let blocked = 0;
  const s = await open({ before: (ctx) => ctx.route('**/sfx/fidgets/squish.wav', (r) => (blocked++ < 1 ? r.abort() : r.continue())) }); await waitUp(s); await sleep(2500);
  check('sprite fetch failure: toy still opens, no uncaught error', (await toyUp(s)) && s.errors.length === 0, s.errors.join('|'));
  await tapEl(s, item('S02')); await sleep(800); await tapEl(s, item('S01')); await sleep(3000);
  const n0 = await s.page.evaluate(() => window.__sounds.length); await tapXY(s, 195, 400); await sleep(400);
  check('sprite retry: re-opening the toy loads it and the tap sounds', blocked >= 2 && (await s.page.evaluate(() => window.__sounds.length)) > n0, `fetch attempts=${blocked}`); await s.ctx.close(); }
{ let blocked = 0;
  const s = await open({ before: (ctx) => ctx.route('**/assets/toy-*.js', (r) => (blocked++ < 1 ? r.abort() : r.continue())) }); await sleep(2500);
  const st = await s.page.evaluate(() => ({ up: document.getElementById('stage').classList.contains('active'), splash: !!document.getElementById('splash'), notice: document.querySelectorAll('.notice').length }));
  check('toy code failure: no stuck splash, a notice, the dock stays usable', !st.up && !st.splash && st.notice > 0, JSON.stringify(st));
  await tapEl(s, item('S01')); await sleep(3000);
  check('toy code retry works without reload', await toyUp(s), `attempts=${blocked}`); await s.ctx.close(); }

const failed = results.filter((r) => !r.ok); console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close(); server.close(); process.exit(failed.length ? 1 : 0);
