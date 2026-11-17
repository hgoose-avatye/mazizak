// Load-performance bench of a built dist/ (prod build, local static server, real Chrome, CDP network/CPU throttling) — dock UI (fe041b9+).
// Usage: node scripts/bench-load.mjs <distDir> <label>       env: RUNS=3 (median), COMPRESS=1 (gzip text/JSON like a typical host)
// Writes bench-out/load-<label>[-gzip].json with every run and the medians.
//
// The server answers like a host configured with the recommended cache policy: content-hashed files (assets/*-<hash>.js|css,
// sfx/**/<name>.<hash>.flac|json) → `Cache-Control: public, max-age=31536000, immutable`; everything else → `no-cache` + ETag (304).
// Cold measurements disable the browser cache; the revisit measurement keeps it.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const dist = path.resolve(process.argv[2] ?? 'dist');
const label = process.argv[3] ?? 'run';
const RUNS = +(process.env.RUNS ?? 3);
const COMPRESS = process.env.COMPRESS === '1';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav', '.flac': 'audio/flac', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const HASHED = /(^\/assets\/.+-[\w-]{8}\.(js|css|woff2)$)|(\.[0-9a-f]{10}\.(flac|json)$)/;
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(dist, url.replace(/\/$/, '/index.html'));
  if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end(); }
  const ext = path.extname(p);
  const body = fs.readFileSync(p);
  const etag = '"' + crypto.createHash('md5').update(body).digest('hex') + '"';
  const h = { 'Content-Type': MIME[ext] ?? 'application/octet-stream', ETag: etag, 'Cache-Control': HASHED.test(url) ? 'public, max-age=31536000, immutable' : 'no-cache' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); return res.end(); }
  if (COMPRESS && ['.html', '.js', '.css', '.json', '.wav', '.md', '.webmanifest'].includes(ext)) { h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding'; res.writeHead(200, h); return res.end(zlib.gzipSync(body, { level: 6 })); }
  res.writeHead(200, h); res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NETS = {
  normal: null,
  slow: { offline: false, latency: 150, downloadThroughput: (1.6 * 1000 * 1000) / 8, uploadThroughput: (750 * 1000) / 8 }, // 1.6 Mbps, RTT 150 ms (+ CPU ×4)
};
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

async function session(net, { cache = false, ctx: shared } = {}) {
  const ctx = shared ?? (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: !cache });
  if (NETS[net]) await cdp.send('Network.emulateNetworkConditions', NETS[net]);
  if (net === 'slow') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const reqs = new Map();
  let bytes = 0, rx = 0;
  const log = [];
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url.replace(BASE, '') }));
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.fromCache = e.response.fromDiskCache || e.response.fromMemoryCache; } });
  cdp.on('Network.requestServedFromCache', (e) => { const r = reqs.get(e.requestId); if (r) r.fromCache = true; });
  cdp.on('Network.dataReceived', (e) => { rx += e.encodedDataLength || e.dataLength; });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (!r) return; bytes += e.encodedDataLength; log.push({ url: r.url, bytes: e.encodedDataLength, status: r.status, fromCache: !!r.fromCache }); });
  // timestamps of every audible source start() (recorded sample or synth)
  await page.addInitScript(() => {
    window.__sounds = [];
    const o = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { if (this.buffer && this.buffer.duration > 0.01) window.__sounds.push(performance.now()); return o.apply(this, a); };
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, cdp, errors, bytes: () => bytes, rx: () => rx, log };
}
const settle = async (s, quiet, cap) => { const t0 = Date.now(); let last = -1, since = Date.now(); while (Date.now() - t0 < cap) { const b = s.rx(); if (b !== last) { last = b; since = Date.now(); } else if (Date.now() - since >= quiet) return; await sleep(200); } };
const tap = async (cdp, x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await sleep(50); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const sum = (log, re) => log.filter((l) => re.test(l.url)).reduce((a, l) => a + l.bytes, 0);
const dupes = (log) => { const n = {}; for (const l of log) if (/\/sfx\//.test(l.url) && !l.fromCache && l.status !== 304) n[l.url] = (n[l.url] ?? 0) + 1; return Object.entries(n).filter(([, c]) => c > 1).map(([u, c]) => `${u}×${c}`); };
// The app opens straight into a toy (no home screen since fe041b9): launch = the default toy (S01) on screen, splash gone.
const stageUp = (s) => s.page.evaluate(() => document.getElementById('stage').classList.contains('active') && !document.getElementById('splash'));
const waitUp = async (s, cap = 90000) => { const t0 = Date.now(); while (!(await stageUp(s)) && Date.now() - t0 < cap) await sleep(25); };
const stageXY = (s) => s.page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.5]; });
const launch = async (s, net) => { await s.page.goto(`${BASE}/`, { waitUntil: 'load' }); await waitUp(s); await settle(s, net === 'slow' ? 3000 : 1500, 90000); };
const tapSel = async (s, sel) => { const l = s.page.locator(sel).first(); await l.scrollIntoViewIfNeeded(); const b = await l.boundingBox(); await tap(s.cdp, b.x + b.width / 2, b.y + b.height / 2); };
const waitTitle = async (s, prefix, cap = 90000) => { const t0 = Date.now(); while (!((await stageUp(s)) && (await s.page.evaluate(() => document.title)).startsWith(prefix)) && Date.now() - t0 < cap) await sleep(25); };

// cold launch: first paint, the toy on screen, then touch the toy until the first sound (S01's first sound counts from navigation)
async function measureLaunch(net) {
  const s = await session(net);
  const t0 = Date.now();
  await s.page.goto(`${BASE}/`, { waitUntil: 'commit' });
  await waitUp(s);
  const toyVisibleMs = Date.now() - t0;
  const [x, y] = await stageXY(s);
  let first = null, interactions = 0;
  const deadline = Date.now() + (net === 'slow' ? 60000 : 20000);
  while (Date.now() < deadline) {
    await tap(s.cdp, x, y); interactions++;
    first = await s.page.evaluate(() => window.__sounds[0] ?? null);
    if (first != null) break;
    await sleep(40);
  }
  const nav = await s.page.evaluate(() => ({ fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null, start: performance.timeOrigin }));
  await settle(s, 3000, 60000);
  const r = { fcpMs: nav.fcp && Math.round(nav.fcp), toyVisibleMs, s01FirstSoundMs: first == null ? null : Math.round(first), interactionsBeforeSound: interactions, launchBytes: s.bytes(), launchAudioBytes: sum(s.log, /\/sfx\//), launchJsBytes: sum(s.log, /\.js$/), launchFontBytes: sum(s.log, /\.woff2$/), launchAudioRequests: s.log.filter((l) => /\/sfx\//.test(l.url)).map((l) => l.url.split('/').pop()), duplicateAudioRequests: dupes(s.log), errors: s.errors };
  await s.ctx.close();
  return r;
}
// keyboard: from the launched app, tap 키보드 in the dock, press keys until the first sound (counted from the dock tap)
async function measureKeyboard(net) {
  const s = await session(net);
  await launch(s, net);
  const bytes0 = s.bytes(), n0 = s.log.length;
  const t0 = await s.page.evaluate(() => performance.now());
  await tapSel(s, '[data-category="keyboard"]');
  let first = null, interactions = 0;
  const deadline = Date.now() + (net === 'slow' ? 40000 : 15000);
  while (Date.now() < deadline) {
    await s.page.keyboard.press('KeyA', { delay: 15 }); interactions++;
    first = await s.page.evaluate((t) => window.__sounds.find((v) => v > t) ?? null, t0);
    if (first != null) break;
    await sleep(40);
  }
  await settle(s, 1500, 30000);
  const log = s.log.slice(n0);
  const r = { firstSoundMs: first == null ? null : Math.round(first - t0), enterBytes: s.bytes() - bytes0, enterAudioBytes: sum(log, /\/sfx\//), enterJsBytes: sum(log, /\.js$/), interactionsBeforeSound: interactions, duplicateAudioRequests: dupes(s.log), errors: s.errors };
  await s.ctx.close();
  return r;
}
// one single touch right after the launched toy appears: chip shown? sound when, relative to the touch?
async function measureFirstInput(net) {
  const s = await session(net);
  await s.page.goto(`${BASE}/`, { waitUntil: 'commit' });
  await waitUp(s);
  const [x, y] = await stageXY(s);
  const tapAt = await s.page.evaluate(() => performance.now());
  await tap(s.cdp, x, y);
  await sleep(120);
  const chip = await s.page.evaluate(() => { const e = document.getElementById('sound-status'); return e && !e.hidden ? e.textContent : null; });
  await sleep(2500);
  const sounds = await s.page.evaluate((t) => window.__sounds.filter((v) => v >= t).map((v) => Math.round(v - t)), tapAt);
  const r = { chipShown: chip, soundsAfterTapMs: sounds, lateSound: sounds.length > 0 && sounds[0] > 1000 };
  await s.ctx.close();
  return r;
}
// switching in the dock (cache on): extra bytes for the second toy; returning to the first fetches nothing
async function measureSwitch(net, firstSel, firstTitle, secondSel, secondTitle) {
  const s = await session(net, { cache: true });
  await launch(s, net);
  const go = async (sel, title) => { await tapSel(s, sel); await waitTitle(s, title); await settle(s, net === 'slow' ? 4000 : 1500, 90000); };
  if (firstSel) await go(firstSel, firstTitle);
  const b1 = s.bytes(), n1 = s.log.length;
  await go(secondSel, secondTitle);
  const second = s.log.slice(n1);
  const b2 = s.bytes(), n2 = s.log.length;
  if (firstSel) await go(firstSel, firstTitle); else await go('.toy-item[data-key="S01"]', '슬랑이');
  const r = { extraBytesForSecondToy: b2 - b1, extraAudioBytesForSecondToy: sum(second, /\/sfx\//), bytesReturningToFirstToy: s.bytes() - b2, audioRequestsReturningToFirstToy: s.log.slice(n2).filter((l) => /\/sfx\//.test(l.url)).length, duplicateAudioRequests: dupes(s.log), errors: s.errors };
  await s.ctx.close();
  return r;
}
// a later visit (new page, same browser profile / HTTP cache): launch (S01), keyboard, W02
async function measureRevisit(net) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const visit = async () => {
    const s = await session(net, { cache: true, ctx });
    await s.page.evaluate(() => { try { localStorage.clear(); } catch {} }).catch(() => {});
    await launch(s, net);
    await tapSel(s, '[data-category="keyboard"]'); await waitTitle(s, '키보드'); await settle(s, 1500, 60000);
    await tapSel(s, '[data-category="fidget"]'); await waitTitle(s, '슬랑이'); await tapSel(s, '.toy-item[data-key="W02"]'); await waitTitle(s, '초콜릿'); await settle(s, 1500, 60000);
    await tapSel(s, '.toy-item[data-key="S01"]'); await waitTitle(s, '슬랑이'); // the next visit launches on S01 again
    const r = { audioBytes: sum(s.log, /\/sfx\//), audioRequests: s.log.filter((l) => /\/sfx\//.test(l.url)).length, audioFromCache: s.log.filter((l) => /\/sfx\//.test(l.url) && (l.fromCache || l.status === 304)).length, totalBytes: s.bytes() };
    await s.page.close();
    return r;
  };
  const first = await visit();
  const again = await visit();
  await ctx.close();
  return { firstVisit: first, revisit: again };
}

const median = (xs) => { const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const mergeRuns = (runs) => {
  const out = {};
  for (const k of Object.keys(runs[0])) out[k] = typeof runs[0][k] === 'number' ? median(runs.map((r) => r[k])) : runs.map((r) => r[k]);
  return out;
};

const result = { label, compress: COMPRESS, runs: RUNS, distBytes: 0, distAudioBytes: 0, nets: {} };
(function walk(d) { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else { result.distBytes += fs.statSync(p).size; if (/\.(wav|flac|mp3)$/.test(n)) result.distAudioBytes += fs.statSync(p).size; } } })(dist);
for (const net of ['normal', 'slow']) {
  const all = { launch: [], keyboard: [], firstInputS01: [], switchS01toS02: [], switchKeyboardToS01: [] };
  for (let i = 0; i < RUNS; i++) {
    all.launch.push(await measureLaunch(net));
    all.keyboard.push(await measureKeyboard(net));
    all.firstInputS01.push(await measureFirstInput(net));
    all.switchS01toS02.push(await measureSwitch(net, null, null, '.toy-item[data-key="S02"]', '모닝빵'));
    all.switchKeyboardToS01.push(await measureSwitch(net, '[data-category="keyboard"]', '키보드', '[data-category="fidget"]', '슬랑이'));
    console.error(`${label}${COMPRESS ? '-gzip' : ''} ${net} run ${i + 1}/${RUNS}`);
  }
  result.nets[net] = { median: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, mergeRuns(v)])), revisit: await measureRevisit(net) };
}
fs.mkdirSync('bench-out', { recursive: true });
const file = `bench-out/load-${label}${COMPRESS ? '-gzip' : ''}.json`;
fs.writeFileSync(file, JSON.stringify(result, null, 1));
console.log(file);
await browser.close();
server.close();
