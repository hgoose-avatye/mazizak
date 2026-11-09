// Foam recovery check in Chrome: press/hold/release and capture frames over time + release records.
// Usage: BASE=http://localhost:4319 node scripts/foam-check.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4319';
const OUT = new URL('../bench-out/foam/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => localStorage.setItem('mzk-settings-v1', JSON.stringify({ reduceMotion: true })));
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
await page.goto(`${BASE}/#/squishy`);
await page.addStyleTag({ content: '#toy-ui{display:none!important}' });
await sleep(1200);

const cx = 195, cy = 440;
// 1) long press 1.5 s, release, film recovery
await touch('touchStart', [[cx, cy, 1]]);
await sleep(1500);
await page.screenshot({ path: `${OUT}a-0-held.png` });
await touch('touchEnd', []);
for (const t of [100, 400, 900, 1600, 2600]) {
  await sleep(t - (t === 100 ? 0 : [100, 400, 900, 1600, 2600][[100, 400, 900, 1600, 2600].indexOf(t) - 1]));
  await page.screenshot({ path: `${OUT}a-${t}ms.png` });
}
await sleep(1500);
// 2) quick taps in sequence at different spots, then re-press during recovery
for (const [x, y] of [[150, 430], [240, 430], [195, 470]]) {
  await touch('touchStart', [[x, y, 1]]);
  await sleep(120);
  await touch('touchEnd', []);
  await sleep(150);
}
await page.screenshot({ path: `${OUT}b-multi-dents.png` });
await touch('touchStart', [[150, 430, 1]]);
await sleep(400);
await touch('touchEnd', []);
await sleep(3500);
// 3) stretch then release
await touch('touchStart', [[cx - 50, cy, 1], [cx + 50, cy, 2]]);
for (let i = 0; i <= 20; i++) {
  await touch('touchMove', [[cx - 50 - i * 4, cy, 1], [cx + 50 + i * 4, cy, 2]]);
  await sleep(16);
}
await sleep(600);
await page.screenshot({ path: `${OUT}c-stretch.png` });
await touch('touchEnd', []);
await sleep(500);
await page.screenshot({ path: `${OUT}c-stretch-release-500ms.png` });
await sleep(3000);
const rep = await page.evaluate(() => window.__mzk.report());
writeFileSync(`${OUT}report.json`, JSON.stringify(rep, null, 2));
console.log('errors', errors);
console.log('frames', JSON.stringify(rep.frames.interval));
console.log(JSON.stringify(rep.toyReport.releases, null, 0));
await browser.close();
