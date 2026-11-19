// Ad gate end to end in a real browser with the stand-in ad (?ads=mock): 3 free kinds a day, then 광고 보고 열기.
// Needs a dev server: BASE=http://127.0.0.1:4371 node scripts/ad-gate-check.mjs
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4371';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failed++; };

async function open(query, hash = '#/S01') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failed++; });
  await page.goto(`${BASE}/${query}${hash}`);
  await page.waitForSelector('#splash', { state: 'detached', timeout: 20000 });
  return { ctx, page };
}
const item = (page, key) => page.locator(`.toy-item[data-key="${key}"]`);
const pick = async (page, key) => { await item(page, key).click(); await page.waitForTimeout(250); };
const sheetOpen = (page) => page.locator('#ad-sheet').isVisible();
const hash = (page) => page.evaluate(() => location.hash);
const gateReady = (page) => page.waitForFunction(() => document.querySelector('.toy-item[data-locked]'), null, { timeout: 15000 });

{
  const { ctx, page } = await open('?ads=mock&adsec=3&adskip=1');
  await gateReady(page);
  ok((await page.locator('#collection-count').textContent()).includes('오늘 무료 2개'), 'launch toy takes the first free slot');
  await pick(page, 'S02');
  ok((await hash(page)) === '#/S02' && !(await sheetOpen(page)), '2nd kind opens free');
  await pick(page, 'S03');
  ok((await hash(page)) === '#/S03' && !(await sheetOpen(page)), '3rd kind opens free');
  ok((await item(page, 'W01').getAttribute('data-locked')) === 'true', '4th kind is marked AD');
  ok((await item(page, 'S01').getAttribute('data-locked')) === 'false', 'a free kind is not marked');
  await pick(page, 'S01');
  ok((await hash(page)) === '#/S01' && !(await sheetOpen(page)), 'back to a free kind: no ad');

  await pick(page, 'W01');
  ok(await sheetOpen(page), 'locked kind → ad sheet');
  ok((await hash(page)) === '#/S01', '… and the toy did not change');
  await page.locator('.ad-later').click();
  ok(!(await sheetOpen(page)) && (await hash(page)) === '#/S01', '다음에 할게요 closes, stays on the toy');

  await pick(page, 'W01');
  await page.locator('#ad-watch').click();
  await page.waitForSelector('.mock-ad');
  ok(await page.locator('.mock-ad-skip').isDisabled(), 'skip is not offered at once');
  ok((await page.locator('.mock-ad-badge').textContent()) === '광고', '광고 badge');
  await page.waitForSelector('.mock-ad-skip:not([disabled])', { timeout: 6000 });
  await page.locator('.mock-ad-skip').click(); // skipped: no reward
  await page.waitForTimeout(200);
  ok(await sheetOpen(page), 'skipping the ad keeps the sheet');
  ok((await page.locator('#ad-status').textContent()).includes('끝까지'), '… with a hint');
  ok((await hash(page)) === '#/S01', '… and no unlock');

  await page.waitForTimeout(400); // next ad loads (300 ms in the mock)
  await page.locator('#ad-watch').click();
  await page.waitForSelector('.mock-ad');
  await page.waitForSelector('.mock-ad-close', { timeout: 6000 });
  ok(Number(await page.locator('.mock-ad-bar').getAttribute('aria-valuenow')) === 100, 'progress bar reaches the end');
  await page.locator('.mock-ad-close').click();
  await page.waitForTimeout(400);
  ok(!(await sheetOpen(page)) && (await hash(page)) === '#/W01', 'watched to the end → opens the kind');
  ok((await item(page, 'W01').getAttribute('data-locked')) === 'false', '… on screen, not marked');

  await pick(page, 'S02');
  ok((await hash(page)) === '#/S02', 'switch away to a free kind');
  ok((await item(page, 'W01').getAttribute('data-locked')) === 'true', 'the ad-opened kind locks again');

  // keyboard presets count the same way; the category switch goes through the gate too
  await page.locator('[data-category="keyboard"]').click();
  await page.waitForTimeout(300);
  ok(await sheetOpen(page), 'keyboard category (4th kind) → ad sheet');
  await page.keyboard.press('Escape');
  ok(!(await sheetOpen(page)), 'Escape closes the ad sheet');

  // persisted: a reload keeps today's counts; a link to a locked kind shows the open toy instead of an ad
  await page.goto(`${BASE}/?ads=mock&adsec=3&adskip=1#/W02`);
  await page.reload();
  await page.waitForSelector('#splash', { state: 'detached', timeout: 20000 });
  ok((await hash(page)) !== '#/W02' && !(await sheetOpen(page)), 'link to a locked kind at launch: no ad, opens an open toy');
  await ctx.close();
}

{
  const { ctx, page } = await open('?ads=mock-fail');
  await gateReady(page);
  await pick(page, 'S02'); await pick(page, 'S03');
  await pick(page, 'W01');
  ok(await sheetOpen(page), 'no-fill: sheet still offered');
  await page.locator('#ad-watch').click();
  await page.waitForFunction(() => location.hash === '#/W01', null, { timeout: 6000 }).catch(() => {});
  ok((await hash(page)) === '#/W01' && !(await sheetOpen(page)), 'no ad to show → opens anyway (never stuck)');
  await ctx.close();
}

{
  const { ctx, page } = await open('');
  await page.waitForTimeout(2500);
  for (const k of ['S02', 'S03', 'W01', 'W02']) await pick(page, k);
  ok((await hash(page)) === '#/W02' && !(await sheetOpen(page)), 'outside Toss (no ads): every kind opens');
  ok((await page.locator('.toy-item[data-locked="true"]').count()) === 0, '… and nothing is marked AD');
  await ctx.close();
}

await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
