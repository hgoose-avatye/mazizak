// Load-performance bench of a built dist/ (prod build, static server, real Chrome, CDP network throttling).
// Usage: node scripts/bench-load.mjs <distDir> [label]   (writes bench-out/load-<label>.json)
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const dist = path.resolve(process.argv[2] ?? 'dist');
const label = process.argv[3] ?? 'run';
const COMPRESS = process.env.COMPRESS === '1'; // gzip every compressible response, like a typical CDN
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown' };
const server = http.createServer((req, res) => {
  const p = path.join(dist, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end(); }
  const ext = path.extname(p);
  const body = fs.readFileSync(p);
  const h = { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-store' };
  if (COMPRESS && ['.html', '.js', '.css', '.json', '.wav', '.md'].includes(ext)) { h['Content-Encoding'] = 'gzip'; res.writeHead(200, h); return res.end(zlib.gzipSync(body, { level: 6 })); }
  res.writeHead(200, h); res.end(body);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NETS = {
  normal: null,
  slow: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }, // "slow 4G"
};
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

async function session(net) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (NETS[net]) await cdp.send('Network.emulateNetworkConditions', NETS[net]);
  if (net === 'slow') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const reqs = new Map();
  let bytes = 0, rx = 0; const log = [];
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, t: e.timestamp }));
  cdp.on('Network.dataReceived', (e) => { rx += e.encodedDataLength || e.dataLength; });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (!r) return; bytes += e.encodedDataLength; log.push({ url: r.url.replace(BASE, ''), bytes: e.encodedDataLength }); });
  // timestamp of the first audible source start() (recorded sample or synth) on any AudioContext
  await page.addInitScript(() => {
    window.__firstSound = null;
    const o = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { if (window.__firstSound == null && this.buffer && this.buffer.duration > 0.01) window.__firstSound = performance.now(); return o.apply(this, a); };
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, cdp, errors, bytes: () => bytes, rx: () => rx, log, mark: () => { const b = bytes; return () => bytes - b; } };
}
// wait until the network has been quiet for `quiet` ms (everything the page wants has arrived), at most `cap` ms
const settle = async (s, quiet, cap) => { const t0 = Date.now(); let last = -1, since = Date.now(); while (Date.now() - t0 < cap) { const b = s.rx(); if (b !== last) { last = b; since = Date.now(); } else if (Date.now() - since >= quiet) return; await sleep(200); } };
const tap = async (page, cdp, x, y) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(50);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

async function measureHome(net) {
  const s = await session(net);
  const t0 = Date.now();
  await s.page.goto(`${BASE}/`, { waitUntil: 'commit' });
  await s.page.waitForSelector('.card .shot', { state: 'attached' });
  await s.page.locator('.card').first().waitFor({ state: 'visible' });
  const homeMs = Date.now() - t0;
  const nav = await s.page.evaluate(() => ({ fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null }));
  await s.page.waitForLoadState('load'); await sleep(net === 'slow' ? 6000 : 4000); // let boot-time preloads and idle warm-ups finish
  const res = { homeVisibleMs: homeMs, fcpMs: nav.fcp && Math.round(nav.fcp), bytesAtHome: s.bytes(), audioBytesAtHome: s.log.filter((l) => /\/sfx\//.test(l.url)).reduce((a, l) => a + l.bytes, 0), jsBytesAtHome: s.log.filter((l) => /\.js$/.test(l.url)).reduce((a, l) => a + l.bytes, 0), requestsAtHome: s.log.length };
  await s.ctx.close();
  return res;
}
// enter a toy from the home screen (card tap), then keep interacting until the first sound is heard
async function measureToy(net, toyHref, interact) {
  const s = await session(net);
  await s.page.goto(`${BASE}/`, { waitUntil: 'load' });
  await s.page.locator('.card').first().waitFor({ state: 'visible' });
  await sleep(net === 'slow' ? 6000 : 3000);
  const homeBytes = s.bytes(), homeLogN = s.log.length;
  // choose category / card
  if (toyHref.startsWith('#/keyboard')) await s.page.click('[data-category="키캡"]');
  const card = s.page.locator(`a.card[href="${toyHref}"]`);
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  const t0 = await s.page.evaluate(() => performance.now());
  await tap(s.page, s.cdp, box.x + box.width / 2, box.y + box.height / 2);
  let first = null, interactions = 0;
  const deadline = Date.now() + (net === 'slow' ? 30000 : 12000);
  while (Date.now() < deadline) {
    await interact(s.page, s.cdp, interactions++);
    first = await s.page.evaluate(() => window.__firstSound);
    if (first != null) break;
    await sleep(40);
  }
  await sleep(1500);
  const out = { firstSoundMs: first == null ? null : Math.round(first - t0), toyEnterBytes: s.bytes() - homeBytes, toyEnterAudioBytes: s.log.slice(homeLogN).filter((l) => /\/sfx\//.test(l.url)).reduce((a, l) => a + l.bytes, 0), interactionsBeforeSound: interactions, errors: s.errors };
  await s.ctx.close();
  return out;
}
const keyInteract = async (page) => { await page.keyboard.press('KeyA', { delay: 15 }); };
const canvasTap = async (page, cdp) => { await tap(page, cdp, 195, 440); };
// leaving one toy for another: extra bytes of the SECOND toy after visiting the first
async function measureSwitch(net, firstHref, secondHref, cat1, cat2) {
  const s = await session(net);
  await s.page.goto(`${BASE}/`, { waitUntil: 'load' });
  await s.page.locator('.card').first().waitFor({ state: 'visible' });
  await sleep(2500);
  const go = async (href, cat) => { await s.page.evaluate(() => { location.hash = '#/'; }); await sleep(600); if (cat) await s.page.click(`[data-category="${cat}"]`); await s.page.evaluate((h) => { location.hash = h; }, href); await sleep(800); await settle(s, net === 'slow' ? 4000 : 1500, 90000); };
  await go(firstHref, cat1);
  const b1 = s.bytes();
  await go(secondHref, cat2);
  const out = { extraBytesForSecondToy: s.bytes() - b1, errors: s.errors };
  await s.ctx.close();
  return out;
}
const result = { label, compress: COMPRESS, distBytes: 0, nets: {} };
(function walk(d) { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); fs.statSync(p).isDirectory() ? walk(p) : (result.distBytes += fs.statSync(p).size); } })(dist);
const FIDGET_HREF = await (async () => { const s = await session('normal'); await s.page.goto(`${BASE}/`); await s.page.waitForSelector('a.card[data-toy]'); const h = await s.page.$$eval('a.card[data-toy]', (a) => a.map((x) => x.getAttribute('href'))); await s.ctx.close(); return h; })();
const fidget1 = FIDGET_HREF[0], fidget2 = FIDGET_HREF[1];
for (const net of ['normal', 'slow']) {
  const r = (result.nets[net] = {});
  r.home = await measureHome(net);
  r.keyboard = await measureToy(net, '#/keyboard/pebble', keyInteract);
  r.fidget = await measureToy(net, fidget1, canvasTap);
  r.switchFidgetToFidget = await measureSwitch(net, fidget1, fidget2);
  r.switchKeyboardToFidget = await measureSwitch(net, '#/keyboard/pebble', fidget1, '키캡', '말랑이');
  console.error(net, 'done');
}
result.fidgets = FIDGET_HREF;
mkdirSync('bench-out', { recursive: true });
writeFileSync(`bench-out/load-${label}${COMPRESS ? '-gzip' : ''}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close(); server.close();
