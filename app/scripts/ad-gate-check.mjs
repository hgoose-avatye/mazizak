// Ad gate end to end in a real browser with the stand-in ad (?ads=mock): the launch toy is free, then 3 free picks a day
// (a notice counts them down), then 광고 보고 열기. Needs a dev server: BASE=http://127.0.0.1:4371 node scripts/ad-gate-check.mjs
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4371';
const MOCK = '?ads=mock&adsec=3&adskip=1';
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
const notice = (page) => page.evaluate(() => document.querySelector('.notice')?.textContent ?? '');
const count = (page) => page.locator('#collection-count').textContent();
const gateReady = (page) => page.waitForFunction(() => document.querySelector('#collection-count')?.textContent.includes('오늘 무료'), null, { timeout: 15000 });
async function watchToEnd(page) {
  await page.waitForTimeout(400); // the next ad loads (300 ms in the mock)
  await page.locator('#ad-watch').click();
  await page.waitForSelector('.mock-ad-close', { timeout: 8000 });
  await page.locator('.mock-ad-close').click();
  await page.waitForTimeout(400);
}

{
  const { ctx, page } = await open(MOCK);
  await gateReady(page);
  ok((await count(page)).includes('오늘 무료 3회'), 'launch toy is not counted (무료 3회)');
  ok(!(await page.locator('#toy-list').textContent()).includes('AD') && (await page.locator('.item-lock').count()) === 0, 'no AD marks in the dock');

  await pick(page, 'S02');
  ok((await hash(page)) === '#/S02' && (await notice(page)).includes('남은 무료 2/3회'), '1st pick: opens, notice 남은 무료 2/3회');
  await pick(page, 'S03');
  ok((await notice(page)).includes('남은 무료 1/3회'), '2nd pick: 남은 무료 1/3회');
  await pick(page, 'S03');
  ok((await notice(page)).includes('1/3회') && (await count(page)).includes('오늘 무료 1회'), 're-tapping the toy on screen costs nothing');
  await pick(page, 'S01');
  ok((await hash(page)) === '#/S01' && (await notice(page)).includes('다 썼어요'), '3rd pick (back to the launch toy, counted): 다 썼어요');
  ok((await count(page)).includes('오늘 무료 0회'), 'dock shows 오늘 무료 0회');

  await pick(page, 'S02');
  ok(await sheetOpen(page), 'a kind picked before → ad sheet now');
  ok((await hash(page)) === '#/S01', '… and the toy did not change');
  await page.locator('.ad-later').click();
  ok(!(await sheetOpen(page)) && (await hash(page)) === '#/S01', '다음에 할게요 closes, stays on the toy');

  await pick(page, 'W01');
  await page.locator('#ad-watch').click();
  await page.waitForSelector('.mock-ad');
  ok(await page.locator('.mock-ad-skip').isDisabled(), 'skip is not offered at once');
  await page.waitForSelector('.mock-ad-skip:not([disabled])', { timeout: 6000 });
  await page.locator('.mock-ad-skip').click(); // skipped: no reward
  await page.waitForTimeout(200);
  ok(await sheetOpen(page) && (await page.locator('#ad-status').textContent()).includes('끝까지') && (await hash(page)) === '#/S01', 'skipping keeps the sheet, no unlock');

  await watchToEnd(page);
  ok(!(await sheetOpen(page)) && (await hash(page)) === '#/W01', 'watched to the end → opens');
  ok((await count(page)).includes('오늘 무료 0회'), '… without using a free pick');

  await pick(page, 'S02');
  ok(await sheetOpen(page), 'next pick → ad sheet again');
  await watchToEnd(page);
  ok((await hash(page)) === '#/S02', '… watched → opens');
  await pick(page, 'W01');
  ok(await sheetOpen(page), 'the ad-opened kind locks again once left');
  await page.keyboard.press('Escape');
  ok(!(await sheetOpen(page)), 'Escape closes the ad sheet');

  await page.locator('[data-category="keyboard"]').click();
  await page.waitForTimeout(300);
  ok(await sheetOpen(page), 'keyboard category switch counts as a pick → ad sheet');
  await page.keyboard.press('Escape');

  // a reload keeps today's count; the toy the app opens on is never charged, even from a link
  // (a new tab of the same browser: a hash-only goto in this tab would be an in-app switch, not a launch)
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => { console.log('pageerror', e.message); failed++; });
  await tab.goto(`${BASE}/${MOCK}#/W02`);
  await tab.waitForSelector('#splash', { state: 'detached', timeout: 20000 });
  await gateReady(tab);
  ok((await hash(tab)) === '#/W02' && !(await sheetOpen(tab)), 'launch on a link: opens, no ad');
  ok((await count(tab)).includes('오늘 무료 0회'), '… today\'s count kept in a new launch');
  await pick(tab, 'W01');
  ok(await sheetOpen(tab), '… and the next pick needs an ad');
  await ctx.close();
}

{
  const { ctx, page } = await open('?ads=mock-fail');
  await gateReady(page);
  for (const k of ['S02', 'S03', 'W01']) await pick(page, k);
  await pick(page, 'W02');
  ok(await sheetOpen(page), 'no-fill: sheet still offered');
  await page.locator('#ad-watch').click();
  await page.waitForFunction(() => location.hash === '#/W02', null, { timeout: 6000 }).catch(() => {});
  ok((await hash(page)) === '#/W02' && !(await sheetOpen(page)), 'no ad to show → opens anyway (never stuck)');
  await ctx.close();
}

{
  // automated browser, no ?ads: the gate is off (outside Toss nothing is locked; the dev default skips webdriver)
  const { ctx, page } = await open('');
  await page.waitForTimeout(2500);
  for (const k of ['S02', 'S03', 'W01', 'W02', 'L01']) await pick(page, k);
  ok((await hash(page)) === '#/L01' && !(await sheetOpen(page)), 'gate off: every kind opens');
  ok(!(await count(page)).includes('무료') && !(await notice(page)).includes('무료'), '… and no free-pick count or notice');
  await ctx.close();
}

await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
