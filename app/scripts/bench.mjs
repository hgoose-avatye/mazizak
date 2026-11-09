// Automated smoke test + desktop-Chrome measurements (NOT a substitute for real devices).
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/bench.mjs
// Drives the system Chrome via CDP with real touch events (pointerType=touch).
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const OUT = new URL('../bench-out/', import.meta.url).pathname;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HEADLESS = process.env.HEADED ? false : true;
const CPU_THROTTLE = Number(process.env.CPU_THROTTLE ?? 1);
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const cdp = await ctx.newCDPSession(page);
  if (CPU_THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id })) });
  return { page, ctx, cdp, touch, errors };
}

async function squishy(browser) {
  const { page, touch, errors } = await newPage(browser);
  await page.goto(`${BASE}/squishy.html?loop=demand`);
  await sleep(800);
  await page.screenshot({ path: `${OUT}squishy-0-idle.png` });
  await page.evaluate(() => window.__mzk.reset());
  const cx = 195, cy = 470;
  // 1) taps
  for (let i = 0; i < 8; i++) {
    await touch('touchStart', [[cx + (i % 3) * 20 - 20, cy - 30, 1]]);
    await sleep(120);
    await touch('touchEnd', []);
    await sleep(500);
  }
  // 2) long hold + screenshot at max depth
  await touch('touchStart', [[cx, cy - 40, 1]]);
  await sleep(900);
  await page.screenshot({ path: `${OUT}squishy-1-hold.png` });
  // 3) drag while holding
  for (let i = 0; i <= 20; i++) {
    await touch('touchMove', [[cx + i * 4, cy - 40 + i * 1, 1]]);
    await sleep(16);
  }
  await page.screenshot({ path: `${OUT}squishy-2-drag.png` });
  await touch('touchEnd', []);
  await sleep(90);
  await page.screenshot({ path: `${OUT}squishy-3-release-90ms.png` });
  await sleep(1500);
  // 4) two fingers
  await touch('touchStart', [[cx - 60, cy - 20, 1], [cx + 60, cy - 20, 2]]);
  await sleep(600);
  await page.screenshot({ path: `${OUT}squishy-4-two-finger.png` });
  await touch('touchEnd', []);
  await sleep(1800);
  const report = await page.evaluate(() => window.__mzk.report());
  return { report, errors };
}

async function squishyFrames(browser) {
  // steady-state frame measurement while continuously dragging (always-on loop)
  const { page, touch, errors } = await newPage(browser);
  await page.goto(`${BASE}/squishy.html?loop=always`);
  await sleep(800);
  await page.evaluate(() => window.__mzk.reset());
  await touch('touchStart', [[195, 430, 1]]);
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 4000) {
    await touch('touchMove', [[195 + Math.sin(i / 8) * 60, 430 + Math.cos(i / 11) * 30, 1]]);
    await sleep(8);
    i++;
  }
  await touch('touchEnd', []);
  await sleep(300);
  return { report: await page.evaluate(() => window.__mzk.report()), errors };
}

async function keyboard(browser) {
  const { page, touch, errors } = await newPage(browser);
  await page.goto(`${BASE}/keyboard.html`);
  await sleep(800);
  await page.screenshot({ path: `${OUT}keyboard-0-idle.png` });
  // key centers in CSS px (debug hook exposed by keyboard page)
  const pts = await page.evaluate(() => window.__mzkKeyCenters?.() ?? null);
  if (!pts) throw new Error('key centers not exposed');
  // rapid taps on each key
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 10; k++) {
      await touch('touchStart', [[pts[k][0], pts[k][1], 1]]);
      await sleep(40);
      await touch('touchEnd', []);
      await sleep(60);
    }
  // 5 simultaneous
  const five = [0, 2, 4, 6, 9].map((k, i) => [pts[k][0], pts[k][1], i + 1]);
  await touch('touchStart', five);
  await sleep(150);
  await page.screenshot({ path: `${OUT}keyboard-1-five-down.png` });
  await touch('touchEnd', []);
  await sleep(500);
  return { report: await page.evaluate(() => window.__mzk.report()), errors };
}

async function audioUnlock(browser, mode) {
  const { page, touch, errors } = await newPage(browser);
  await page.goto(`${BASE}/audio-test.html?mode=${mode}`);
  await sleep(500);
  const box = await page.locator('#pad').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await touch('touchStart', [[x, y, 1]]);
  await sleep(150);
  await touch('touchEnd', []);
  await sleep(400);
  // second touch (after first)
  await touch('touchStart', [[x, y, 1]]);
  await sleep(100);
  await touch('touchEnd', []);
  await sleep(300);
  const status = await page.locator('#status').innerText();
  return { mode, status, errors };
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: HEADLESS,
  args: ['--autoplay-policy=user-gesture-required', '--ignore-gpu-blocklist', '--enable-gpu'],
});
const result = { at: new Date().toISOString(), cpuThrottle: CPU_THROTTLE, headless: HEADLESS };
try {
  result.squishy = await squishy(browser);
  result.squishyFrames = await squishyFrames(browser);
  result.keyboard = await keyboard(browser);
  result.audio = [];
  for (const m of ['down', 'up', 'both', 'touchstart']) result.audio.push(await audioUnlock(browser, m));
} finally {
  await browser.close();
}
writeFileSync(`${OUT}bench-${CPU_THROTTLE}x.json`, JSON.stringify(result, null, 2));
console.log(`wrote ${OUT}bench-${CPU_THROTTLE}x.json`);
