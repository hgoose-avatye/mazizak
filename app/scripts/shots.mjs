// Visual + interaction smoke test of the SPA in system Chrome (mobile emulation, real CDP touch events).
// Usage: BASE=http://localhost:4319 node scripts/shots.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4319';
const OUT = new URL('../bench-out/shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push('console: ' + m.text()));
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
const tap = async (x, y, hold = 90) => {
  await touch('touchStart', [[x, y, 1]]);
  await sleep(hold);
  await touch('touchEnd', []);
};
const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` });
const out = { errors };

await page.goto(`${BASE}/`);
await sleep(700);
await shot('01-home');

// enter squishy via card tap
const card = await page.locator('.card[data-toy=squishy]').boundingBox();
await tap(card.x + card.width / 2, card.y + card.height / 2);
await sleep(1200);
await shot('02-squishy-idle');
const cx = 195, cy = 470;
await touch('touchStart', [[cx, cy - 40, 1]]);
await sleep(800);
await shot('03-squishy-hold');
for (let i = 0; i <= 15; i++) {
  await touch('touchMove', [[cx + i * 5, cy - 40 + i * 2, 1]]);
  await sleep(16);
}
await shot('04-squishy-drag');
await touch('touchEnd', []);
await sleep(70);
await shot('05-squishy-release');
await sleep(1500);
// two-finger stretch
await touch('touchStart', [[cx - 50, cy - 10, 1], [cx + 50, cy - 10, 2]]);
await sleep(120);
for (let i = 0; i <= 20; i++) {
  await touch('touchMove', [[cx - 50 - i * 4, cy - 10, 1], [cx + 50 + i * 4, cy - 10, 2]]);
  await sleep(16);
}
await sleep(200);
await shot('06-squishy-stretch');
await touch('touchEnd', []);
await sleep(1500);
// color swatch
const sw = await page.locator('.swatch').nth(1).boundingBox();
await tap(sw.x + sw.width / 2, sw.y + sw.height / 2);
await sleep(400);
await shot('07-squishy-mint');
out.squishy = await page.evaluate(() => window.__mzk.report());

// settings sheet
await page.locator('[data-action=settings]').nth(1).click();
await sleep(400);
await shot('08-settings');
await page.locator('.primary').click();
await sleep(200);

// back → home → keyboard
await page.locator('[data-action=back]').click();
await sleep(500);
const kc = await page.locator('.card[data-toy=keyboard]').boundingBox();
await tap(kc.x + kc.width / 2, kc.y + kc.height / 2);
await sleep(1200);
await shot('09-keyboard-idle');
const rects = (await page.evaluate(() => window.__mzk.report())).toyReport.keyRectsPx;
for (let r = 0; r < 2; r++) for (const k of rects) await tap(k.cx, k.cy, 40);
const five = [0, 2, 4, 6, 9].map((id, i) => [rects[id].cx, rects[id].cy, i + 1]);
await touch('touchStart', five);
await sleep(150);
await shot('10-keyboard-five');
await touch('touchEnd', []);
await sleep(400);
const chip = await page.locator('.chip').nth(1).boundingBox();
await tap(chip.x + chip.width / 2, chip.y + chip.height / 2);
await sleep(400);
await shot('11-keyboard-clack');
out.keyboard = await page.evaluate(() => window.__mzk.report());
await browser.close();
writeFileSync(`${OUT}report.json`, JSON.stringify(out, null, 2));
console.log('errors:', errors.length ? errors : 'none');
