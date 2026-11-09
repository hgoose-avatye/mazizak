// Renders real in-app 3D frames into home-card thumbnails and PWA icons.
// Usage (dev server running): BASE=http://localhost:4319 node scripts/assets.mjs
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:4319';
const PUB = new URL('../public/', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HIDE = '#toy-ui, .stats, .notice { display: none !important; }';

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });

async function render(hash, size, scale, file, type = 'jpeg') {
  const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  // reduceMotion: no entry bounce / idle demo in the captured frame
  await page.addInitScript(() => localStorage.setItem('mzk-settings-v1', JSON.stringify({ reduceMotion: true })));
  await page.goto(`${BASE}/${hash}`);
  await page.addStyleTag({ content: HIDE });
  await sleep(1500);
  await page.screenshot({ path: `${PUB}${file}`, type, ...(type === 'jpeg' ? { quality: 86 } : {}) });
  await ctx.close();
}

await render('#/squishy', 232, 2, 'thumbs/squishy.jpg');
await render('#/keyboard', 232, 2, 'thumbs/keyboard.jpg');
await render('#/squishy', 512, 1, 'icons/icon-512.png', 'png');
await render('#/squishy', 192, 1, 'icons/icon-192.png', 'png');
await render('#/squishy', 180, 1, 'icons/icon-180.png', 'png');
await browser.close();
console.log('assets written');
