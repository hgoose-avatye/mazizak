// Browser regression for lazy loading (against a built dist): launch straight into a toy, per-toy FLAC chunks, rapid switching in the
// dock, the sound-loading chip and the first touch, network / decode failures and retry.
// Usage: node scripts/load-regression.mjs [distDir]      env: BROWSER=chrome|webkit|firefox (WEBKIT_PATH for a local Playwright WebKit)
import { chromium, webkit, firefox } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dist = path.resolve(process.argv[2] ?? 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.flac': 'audio/flac', '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/json', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.md': 'text/markdown' };
const server = http.createServer((q, r) => { const p = path.join(dist, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', MIME[path.extname(p)] ?? 'application/octet-stream'); r.setHeader('Cache-Control', 'no-store'); r.end(fs.readFileSync(p)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BROWSER = process.env.BROWSER ?? 'chrome';
const browser = BROWSER === 'webkit' ? await webkit.launch(process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {}) : BROWSER === 'firefox' ? await firefox.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const CDP = BROWSER === 'chrome';
const results = []; const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(ok ? 'PASS' : 'FAIL', name, extra); };
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...(BROWSER === 'firefox' ? {} : { deviceScaleFactor: 2, isMobile: true }), hasTouch: true });
  const page = await ctx.newPage(); const errors = []; const reqs = []; const done = {};
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (q) => reqs.push({ url: q.url().replace(BASE, ''), t: Date.now() }));
  page.on('requestfinished', (q) => { done[q.url().replace(BASE, '')] = Date.now(); });
  await page.addInitScript(() => { window.__sounds = []; const o = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { if (this.buffer && this.buffer.duration > 0.01) window.__sounds.push(performance.now()); return o.apply(this, a); }; });
  const cdp = CDP ? await ctx.newCDPSession(page) : null;
  if (opts.slow && cdp) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 90000 }); }
  if (opts.before) await opts.before(ctx);
  await page.goto(BASE + '/' + (opts.hash ?? ''), { waitUntil: 'load' }); await page.locator('.toy-item').first().waitFor();
  const sfx = () => reqs.filter((r) => r.url.includes('/sfx/')).map((r) => r.url);
  return { ctx, page, cdp, errors, reqs, done, sfx };
}
const center = async (s, sel) => { const l = s.page.locator(sel).first(); await l.scrollIntoViewIfNeeded(); const b = await l.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const tapXY = async (s, x, y) => { if (s.cdp) { await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await sleep(40); await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } else await s.page.mouse.click(x, y); };
const hold = async (s, x, y, ms = 700) => { if (s.cdp) { await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await sleep(ms); await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } else { await s.page.mouse.move(x, y); await s.page.mouse.down(); await sleep(ms); await s.page.mouse.up(); } };
const tapEl = async (s, sel) => { const [x, y] = await center(s, sel); await tapXY(s, x, y); };
const toyUp = (s) => s.page.evaluate(() => document.getElementById('stage').classList.contains('active'));
const waitUp = async (s, ms = 60000) => { const t0 = Date.now(); while (!(await toyUp(s)) && Date.now() - t0 < ms) await sleep(50); return Date.now() - t0; };
const waitTitle = async (s, prefix, ms = 60000) => { const t0 = Date.now(); while (!((await toyUp(s)) && (await s.page.evaluate(() => document.title)).startsWith(prefix)) && Date.now() - t0 < ms) await sleep(100); };
const item = (key) => `.toy-item[data-key="${key}"]`;
const chip = (s) => s.page.evaluate(() => { const e = document.getElementById('sound-status'); return e && !e.hidden ? { text: e.textContent, retry: !!e.querySelector('button') } : null; });
const sounds = (s) => s.page.evaluate(() => window.__sounds.length);
const dupes = (list) => list.filter((u, i) => list.indexOf(u) !== i);
// a spot on the toy itself (the stage sits between the header and the dock)
const stageXY = (s) => s.page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.5]; });

// 1) launch: no home screen — 슬랑이 opens at once and only its own chunk is requested (no other toy's audio, no WAV)
{ const s = await open(); await waitUp(s); await sleep(2000);
  const sfx = s.sfx();
  check('launch opens 슬랑이 (S01) without a home screen', (await toyUp(s)) && (await s.page.evaluate(() => location.hash)) === '#/S01' && !(await s.page.evaluate(() => !!document.getElementById('home'))));
  check('launch requests only S01\'s chunk (map + FLAC, hashed names)', sfx.length === 2 && sfx.every((u) => /\/sfx\/fidgets\/squish\.S01\.[0-9a-f]{10}\.(json|flac)$/.test(u)), sfx.join(','));
  check('no audio of other toys / no WAV at launch (dock thumbnails fetch no sound)', !sfx.some((u) => /\.wav$|keyboard|squishy\/|picks|crunch|wax/.test(u)), sfx.join(','));
  const three = s.reqs.find((r) => /three/.test(r.url)), flac = s.reqs.find((r) => r.url.endsWith('.flac'));
  check('three.js and the sound are requested in parallel', !!three && !!flac && flac.t <= (s.done[three.url] ?? Infinity), `flac ${flac && three ? flac.t - three.t : '?'} ms after the three.js request; three.js took ${three && s.done[three.url] ? s.done[three.url] - three.t : '?'} ms`);
  check('splash is gone once the toy is up', !(await s.page.evaluate(() => !!document.getElementById('splash'))));
  const [x, y] = await stageXY(s); const n0 = await sounds(s); await tapXY(s, x, y); await sleep(400);
  check('S01 first touch sounds', (await sounds(s)) > n0);
  // dock: S02 then back to S01 — S02 fetches only its own chunk, returning fetches nothing
  await tapEl(s, item('S02')); await waitTitle(s, '모닝빵'); await sleep(2000);
  await tapEl(s, item('S01')); await waitTitle(s, '슬랑이'); await sleep(1500);
  const after = s.sfx().slice(2);
  check('dock S01→S02→S01: only S02\'s chunk is added, nothing on return', after.length === 2 && after.every((u) => /squish\.S02\./.test(u)), after.join(','));
  const n1 = await sounds(s); await tapXY(s, x, y); await sleep(400);
  check('S01 still sounds after the round trip (memory cache)', (await sounds(s)) > n1);
  check('no duplicate audio requests', dupes(s.sfx()).length === 0, dupes(s.sfx()).join(','));
  check('no page errors (launch / dock)', s.errors.length === 0, s.errors.join('|')); await s.ctx.close(); }

// 2) the keyboard requests only the chosen preset; switching preset loads only that one
{ const s = await open(); await waitUp(s); await sleep(1500); const n = s.sfx().length;
  await tapEl(s, '[data-category="keyboard"]'); await waitTitle(s, '키보드'); await sleep(2000);
  const kb = () => s.sfx().slice(n);
  check('keyboard opens from the dock', (await toyUp(s)) && (await s.page.evaluate(() => location.hash)) === '#/keyboard/pebble');
  check('keyboard requests only the chosen preset (map + FLAC)', kb().length === 2 && kb().every((u) => /\/sfx\/keyboard\/pebble\.[0-9a-f]{10}\.(json|flac)$/.test(u)), kb().join(','));
  const n0 = await sounds(s); await s.page.keyboard.press('KeyA'); await sleep(300);
  check('keyboard first key press sounds', (await sounds(s)) > n0);
  await tapEl(s, item('clack')); await sleep(1500);
  check('preset switch loads just that preset', kb().length === 4 && kb().slice(2).every((u) => /keyboard\/clack\./.test(u)), kb().join(','));
  check('no page errors (keyboard)', s.errors.length === 0, s.errors.join('|')); await s.ctx.close(); }

// 3) first input while the sounds load (slow network): no chip before a touch; the chip from the first touch when the sound is not ready
//    (else the touch sounds); the chip hides itself; a sound is never played more than 1 s after the touch that caused it
if (CDP) {
  for (const [name, hash, act] of [['S01 (launch)', '', (s, x, y) => tapXY(s, x, y)], ['keyboard (launch)', '#/keyboard/pebble', (s) => s.page.keyboard.press('KeyA')], ['W02 (launch)', '#/W02', (s, x, y) => hold(s, x, y)]]) {
    const s = await open({ slow: true, hash }); await waitUp(s);
    const before = await chip(s);
    const [x, y] = await stageXY(s);
    const tapAt = await s.page.evaluate(() => performance.now()); await act(s, x, y); await sleep(100);
    const c = await chip(s);
    let goneAt = null; const t1 = Date.now(); while (Date.now() - t1 < 60000) { if (!(await chip(s))) { goneAt = Date.now() - t1; break; } await sleep(50); }
    await sleep(1500);
    const all = await s.page.evaluate((t) => window.__sounds.filter((v) => v >= t).map((v) => Math.round(v - t)), tapAt);
    check(`${name}: no chip before the first touch`, before === null, JSON.stringify(before));
    check(`${name}: chip "소리 불러오는 중" on the first touch if the sound is not ready, else the touch sounds`, c ? /소리 불러오는 중/.test(c.text) : all.length > 0 && all[0] <= 1000, `chip=${JSON.stringify(c)} sounds=${all.join(',')}`);
    check(`${name}: chip hides itself when the sounds are ready`, goneAt !== null, `after ${goneAt} ms`);
    check(`${name}: no late sound for that touch (first sound ≤ 1 s or none)`, all.length === 0 || all[0] <= 1000, `sounds at ${all.join(',')} ms`);
    const n0 = await sounds(s); await act(s, x, y); await sleep(600);
    check(`${name}: the next touch sounds`, (await sounds(s)) > n0);
    await s.ctx.close();
  }
}

// 4) rapid switching in the dock without errors or duplicate downloads; the last requested toy is the one shown
{ const s = await open(CDP ? { slow: true } : {});
  for (const h of ['S02', 'W01', 'S03', 'L01']) { await tapEl(s, item(h)); await sleep(120); }
  await tapEl(s, '[data-category="keyboard"]'); await sleep(80); await tapEl(s, '[data-category="fidget"]'); await sleep(80); await tapEl(s, item('S02')); await sleep(60);
  await s.page.evaluate(() => { location.hash = '#/S03'; });
  await waitTitle(s, '찹쌀떡');
  check('last requested toy is the one shown', (await s.page.evaluate(() => document.title)).startsWith('찹쌀떡') && (await s.page.evaluate(() => document.querySelector('.toy-item[aria-checked=true]')?.dataset.key)) === 'S03', await s.page.evaluate(() => document.title));
  const [x, y] = await stageXY(s);
  for (let i = 0; i < 20; i++) { await tapXY(s, x, y); await sleep(30); }
  await sleep(CDP ? 15000 : 3000);
  check('rapid switching: no audio file requested twice', dupes(s.sfx()).length === 0, dupes(s.sfx()).join(','));
  check('rapid taps: no page errors', s.errors.length === 0, s.errors.join('|')); await s.ctx.close(); }

// 5) network failure → error chip with 다시 시도 after the touch → retry works (the network stays down until then)
{ let attempts = 0, allow = false;
  const s = await open({ before: (ctx) => ctx.route(/\/sfx\/fidgets\/squish\.S01\.[0-9a-f]+\.flac$/, (r) => { attempts++; return allow ? r.continue() : r.abort(); }) });
  await waitUp(s); await sleep(1500);
  const [x, y] = await stageXY(s); await tapXY(s, x, y); await sleep(300);
  const c = await chip(s);
  check('network failure: toy works, error chip with 다시 시도 after the touch', (await toyUp(s)) && !!c && c.retry && s.errors.length === 0, JSON.stringify(c));
  const failedAttempts = attempts; allow = true;
  check('network failure: bounded attempts before the user retries', failedAttempts <= 2, `${failedAttempts} attempts`);
  if (c?.retry) await s.page.click('#sound-status button');
  await sleep(2500);
  check('retry: loads, chip gone', !(await chip(s)) && attempts > failedAttempts, `attempts=${attempts}`);
  const n0 = await sounds(s); await tapXY(s, x, y); await sleep(400);
  check('retry: the touch sounds', (await sounds(s)) > n0); await s.ctx.close(); }

// 6) a file the browser cannot decode → error chip without retry, never fetched again
{ let served = 0;
  const s = await open({ before: (ctx) => ctx.route(/\/sfx\/fidgets\/squish\.S01\.[0-9a-f]+\.flac$/, (r) => { served++; r.fulfill({ status: 200, contentType: 'audio/flac', body: Buffer.from('fLaC this is not a flac stream at all') }); }) });
  await waitUp(s); await sleep(1500);
  const [x, y] = await stageXY(s); await tapXY(s, x, y); await sleep(300);
  const c = await chip(s);
  check('decode failure: error chip, no retry button', !!c && !c.retry && /재생할 수 없어요/.test(c.text), JSON.stringify(c));
  for (let i = 0; i < 2; i++) { await tapEl(s, item('S02')); await waitTitle(s, '모닝빵'); await tapEl(s, item('S01')); await waitTitle(s, '슬랑이'); await sleep(600); }
  check('decode failure: not fetched again on re-entry', served === 1, `served ${served}×`);
  check('decode failure: no page errors', s.errors.length === 0, s.errors.join('|')); await s.ctx.close(); }

// 7) toy code failure → no stuck splash, a notice, the dock stays usable; retry without reload
//    (KNOWN, pre-existing in WebKit: the engine caches a failed dynamic import, so the retry needs a reload there)
{ let blocked = 0;
  const s = await open({ before: (ctx) => ctx.route('**/assets/toy-*.js', (r) => (blocked++ < 1 ? r.abort() : r.continue())) }); await sleep(2500);
  const st = await s.page.evaluate(() => ({ up: document.getElementById('stage').classList.contains('active'), splash: !!document.getElementById('splash'), notice: document.querySelectorAll('.notice').length }));
  check('toy code failure: no stuck splash, a notice, the dock stays usable', !st.up && !st.splash && st.notice > 0, JSON.stringify(st));
  await tapEl(s, item('S01')); await sleep(3000);
  check(`toy code retry works without reload${BROWSER === 'webkit' ? ' (known WebKit limitation)' : ''}`, await toyUp(s), `attempts=${blocked}`); await s.ctx.close(); }

const failed = results.filter((r) => !r.ok); console.log(`\n[${BROWSER}] ${results.length - failed.length}/${results.length} passed`);
await browser.close(); server.close(); process.exit(failed.length ? 1 : 0);
