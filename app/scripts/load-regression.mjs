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
// sound chunks are shared by several toys and named after them (squish.L01-L02-S01.<hash>.flac): a chunk "of" a toy is one whose name lists it
const chunkOf = (id, ext = '(json|flac)') => new RegExp(`/sfx/fidgets/squish\\.(?:[A-Z]\\d\\d-)*${id}(?:-[A-Z]\\d\\d)*\\.[0-9a-f]{10}\\.${ext}$`);
// S01's sounds sit in this many shared chunks; the failure checks below count requests per chunk
const S01_CHUNKS = 2;
const item = (key) => `.toy-item[data-key="${key}"]`;
const chip = (s) => s.page.evaluate(() => { const e = document.getElementById('sound-status'); return e && !e.hidden ? { text: e.textContent, retry: !!e.querySelector('button') } : null; });
const sounds = (s) => s.page.evaluate(() => window.__sounds.length);
// the background warm-up (main.ts warmAll) is done when no new sound request has started for 1.5 s
const waitWarm = async (s, ms = 30000) => { const t0 = Date.now(); let n = -1, since = Date.now(); while (Date.now() - t0 < ms) { const m = s.sfx().length; if (m !== n) { n = m; since = Date.now(); } else if (Date.now() - since > 1500) break; await sleep(200); } };
const dupes = (list) => list.filter((u, i) => list.indexOf(u) !== i);
// a spot on the toy itself (the stage sits between the header and the dock)
const stageXY = (s) => s.page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.5]; });

// 1) launch: no home screen — 슬랑이 opens at once and its own chunks are requested first (no other toy's audio, no WAV);
//    everything else is fetched in the background afterwards, so a dock switch then fetches nothing and never waits
{ const s = await open(); await waitUp(s);
  const sfx = s.sfx().slice(0, 2 * S01_CHUNKS);
  check('launch opens 슬랑이 (S01) without a home screen', (await toyUp(s)) && (await s.page.evaluate(() => location.hash)) === '#/S01' && !(await s.page.evaluate(() => !!document.getElementById('home'))));
  check('launch requests S01\'s chunks first (map + FLAC, hashed names)', sfx.length === 2 * S01_CHUNKS && sfx.every((u) => chunkOf('S01').test(u)), s.sfx().join(','));
  await waitWarm(s);
  check('background warm-up: every 말랑이 chunk and keyboard preset fetched once, no WAV', !s.sfx().some((u) => /\.wav$/.test(u)) && s.sfx().some((u) => /keyboard\/silent-peach-v3\./.test(u)) && s.sfx().some((u) => chunkOf('S02').test(u)) && dupes(s.sfx()).length === 0, `${s.sfx().length} requests`);
  const three = s.reqs.find((r) => /three/.test(r.url)), flac = s.reqs.find((r) => r.url.endsWith('.flac'));
  check('three.js and the sound are requested in parallel', !!three && !!flac && flac.t <= (s.done[three.url] ?? Infinity), `flac ${flac && three ? flac.t - three.t : '?'} ms after the three.js request; three.js took ${three && s.done[three.url] ? s.done[three.url] - three.t : '?'} ms`);
  check('splash is gone once the toy is up', !(await s.page.evaluate(() => !!document.getElementById('splash'))));
  const [x, y] = await stageXY(s); const n0 = await sounds(s); await tapXY(s, x, y); await sleep(400);
  check('S01 first touch sounds', (await sounds(s)) > n0);
  // dock: S02 then back to S01 — both already warm: nothing is fetched, and S02 sounds on its first touch
  const nWarm = s.sfx().length;
  await tapEl(s, item('S02')); await waitTitle(s, '모닝빵');
  const n2 = await sounds(s); await tapXY(s, x, y); await sleep(150);
  check('dock → S02: first touch sounds at once, no loading chip', (await sounds(s)) > n2 && (await chip(s)) === null, JSON.stringify(await chip(s)));
  await tapEl(s, item('S01')); await waitTitle(s, '슬랑이'); await sleep(500);
  check('dock S01→S02→S01: nothing fetched after the warm-up', s.sfx().length === nWarm, s.sfx().slice(nWarm).join(','));
  const n1 = await sounds(s); await tapXY(s, x, y); await sleep(400);
  check('S01 still sounds after the round trip (memory cache)', (await sounds(s)) > n1);
  check('no duplicate audio requests', dupes(s.sfx()).length === 0, dupes(s.sfx()).join(','));
  check('no page errors (launch / dock)', s.errors.length === 0, s.errors.join('|')); await s.ctx.close(); }

// 2) keyboard after the warm-up: opening it and switching presets fetch nothing, and every preset sounds on its first key press with no chip
{ const s = await open(); await waitUp(s); await waitWarm(s); const n = s.sfx().length;
  await tapEl(s, '[data-category="keyboard"]'); await waitTitle(s, '키보드'); await sleep(300);
  check('keyboard opens from the dock', (await toyUp(s)) && (await s.page.evaluate(() => location.hash)) === '#/keyboard/pebble');
  const n0 = await sounds(s); await s.page.keyboard.press('KeyA'); await sleep(150);
  check('keyboard first key press sounds', (await sounds(s)) > n0);
  for (const p of ['clack', 'silent-peach-v3', 'mongdol-pl87w', 'jjigae-topre', 'dojagi-space65', 'turquoise-tealios']) {
    await tapEl(s, item(p)); const k = await sounds(s); await s.page.keyboard.press('KeyA'); await sleep(120);
    check(`preset ${p}: sounds on the first press, no loading chip`, (await sounds(s)) > k && (await chip(s)) === null, JSON.stringify(await chip(s)));
  }
  check('preset switches fetch nothing after the warm-up', s.sfx().length === n, s.sfx().slice(n).join(','));
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
  const s = await open({ before: (ctx) => ctx.route(chunkOf('S01', 'flac'), (r) => { attempts++; return allow ? r.continue() : r.abort(); }) });
  await waitUp(s); await sleep(1500);
  const [x, y] = await stageXY(s); await tapXY(s, x, y); await sleep(300);
  const c = await chip(s);
  check('network failure: toy works, error chip with 다시 시도 after the touch', (await toyUp(s)) && !!c && c.retry && s.errors.length === 0, JSON.stringify(c));
  const failedAttempts = attempts; allow = true;
  check('network failure: bounded attempts before the user retries', failedAttempts <= 2 * S01_CHUNKS, `${failedAttempts} attempts`);
  if (c?.retry) await s.page.click('#sound-status button');
  await sleep(2500);
  check('retry: loads, chip gone', !(await chip(s)) && attempts > failedAttempts, `attempts=${attempts}`);
  const n0 = await sounds(s); await tapXY(s, x, y); await sleep(400);
  check('retry: the touch sounds', (await sounds(s)) > n0); await s.ctx.close(); }

// 6) a file the browser cannot decode → error chip without retry, never fetched again
{ let served = 0;
  const s = await open({ before: (ctx) => ctx.route(chunkOf('S01', 'flac'), (r) => { served++; r.fulfill({ status: 200, contentType: 'audio/flac', body: Buffer.from('fLaC this is not a flac stream at all') }); }) });
  await waitUp(s); await sleep(1500);
  const [x, y] = await stageXY(s); await tapXY(s, x, y); await sleep(300);
  const c = await chip(s);
  check('decode failure: error chip, no retry button', !!c && !c.retry && /재생할 수 없어요/.test(c.text), JSON.stringify(c));
  for (let i = 0; i < 2; i++) { await tapEl(s, item('S02')); await waitTitle(s, '모닝빵'); await tapEl(s, item('S01')); await waitTitle(s, '슬랑이'); await sleep(600); }
  check('decode failure: not fetched again on re-entry', served === S01_CHUNKS, `served ${served}×`);
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
