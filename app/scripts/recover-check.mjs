// Recover-sound handling: re-press cancels it, quick taps don't stack it, reset/leave stop it.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:4319';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('mzk-settings-v1', JSON.stringify({ reduceMotion: true })));
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
const plays = async () => (await page.evaluate(() => window.__mzk.report())).toyReport.soundPlays.filter((p) => p.name === 'sq:recover').map((p) => p.outcome);
await page.goto(`${BASE}/#/squishy`);
await sleep(1500);
// A) long hold, release, re-press 60 ms later
await touch('touchStart', [[195, 440, 1]]); await sleep(1500); await touch('touchEnd', []); await sleep(60);
await touch('touchStart', [[195, 440, 1]]); await sleep(300);
console.log('A re-press after long hold → recover outcomes:', await plays());
await touch('touchEnd', []); await sleep(3500);
// B) 10 quick taps
for (let i = 0; i < 10; i++) { await touch('touchStart', [[195, 440, 1]]); await sleep(60); await touch('touchEnd', []); await sleep(120); }
await sleep(500);
const all = await plays();
console.log('B after 10 quick taps → total recover logs so far:', all.length, all);
// C) long hold, release, reset 300 ms later
await sleep(3000);
await touch('touchStart', [[195, 440, 1]]); await sleep(1200); await touch('touchEnd', []); await sleep(300);
await page.evaluate(() => document.querySelector('[data-action=reset]').click());
await sleep(200);
console.log('C reset mid-recovery → last recover outcome:', (await plays()).slice(-1));
await b.close();
