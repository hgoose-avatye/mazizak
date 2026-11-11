// Real Chrome routing/scheduling checks; no claim about human-perceived sound quality.
// Run Vite first, then node scripts/topre-check.mjs [http://localhost:4351/].
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:4351/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal'] });
const results = [];
const check = (name, cond) => { assert.ok(cond, name); results.push(name); };
const pattern = ['F1', 'Digit1', 'KeyQ', 'KeyA', 'KeyZ', 'Space', 'Enter', 'Backspace'];
const roles = ['downR0', 'downR1', 'downR2', 'downR3', 'downR4', 'spaceDown', 'enterDown', 'backspaceDown'];
async function session({ mobile = false, fail = false, slow = false } = {}) {
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1000, height: 800 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    window.__starts = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer?.length > 1) window.__starts.push(this.buffer.length);
      return start.apply(this, args);
    };
  });
  if (fail || slow) await page.route('**/sfx/keyboard/topre*', async route => {
    if (fail) return route.abort();
    await new Promise(resolve => setTimeout(resolve, 2200));
    await route.continue();
  });
  await page.goto(url + '#/keyboard');
  await page.evaluate(async () => {
    const { AudioEngine } = await import('/src/core/audio.ts');
    window.__plays = [];
    const play = AudioEngine.prototype.play;
    AudioEngine.prototype.play = function (...args) {
      const log = play.apply(this, args);
      window.__plays.push({ name: args[0], outcome: log?.outcome ?? 'missing' });
      return log;
    };
  });
  await page.waitForTimeout(slow ? 700 : 1800);
  const chip = label => page.getByRole('radio', { name: label, exact: true });
  const choose = async label => { await chip(label).click(); await page.evaluate(() => document.activeElement?.blur()); };
  const key = async code => { await page.keyboard.down(code); await page.keyboard.up(code); };
  const clear = () => page.evaluate(() => { window.__plays = []; window.__starts = []; });
  const logs = () => page.evaluate(() => ({ plays: window.__plays, starts: window.__starts }));
  return { page, context, errors, chip, choose, key, clear, logs };
}
try {
  for (const mobile of [false, true]) {
    const s = await session({ mobile });
    check(`six chips / mobile=${mobile}`, JSON.stringify(await s.page.getByRole('radio').allTextContents()) === JSON.stringify(['조약돌', '까랑까랑', '크리미', 'Topre', 'Turquoise Tealios', 'IBM Buckling Spring']));
    await s.choose('Topre'); await s.clear();
    for (const code of pattern) await s.key(code);
    let l = await s.logs();
    const expected = roles.flatMap((role, i) => [`kb:topre:${role}`, `kb:topre:${i < 5 ? 'up' : role.replace('Down', 'Up')}`]);
    check(`five rows and dedicated down/up / mobile=${mobile}`, JSON.stringify(l.plays.map(p => p.name)) === JSON.stringify(expected));
    check(`all 16 sounds started / mobile=${mobile}`, l.starts.length === 16 && l.plays.every(p => p.outcome === 'played'));
    // Chords on keys outside the miniature keyboard must remain independent.
    await s.clear();
    for (const code of ['Digit1', 'Digit2', 'KeyQ', 'KeyW', 'Enter', 'Backspace']) await s.page.keyboard.down(code);
    for (const code of ['Digit1', 'Digit2', 'KeyQ', 'KeyW', 'Enter', 'Backspace']) await s.page.keyboard.up(code);
    check(`independent chord / mobile=${mobile}`, (await s.logs()).starts.length === 12);
    // Hold Topre Enter while switching to creamy; release must remain Topre Enter.
    await s.clear(); await s.page.keyboard.down('Enter'); await s.choose('크리미'); await s.page.keyboard.up('Enter');
    l = await s.logs();
    check(`held release retains preset and role / mobile=${mobile}`, l.plays.at(-1)?.name === 'kb:topre:enterUp');
    for (const [label, count] of [['조약돌', 8], ['까랑까랑', 8], ['크리미', 4]]) {
      await s.choose(label); await s.clear();
      for (const code of ['KeyQ', 'KeyA', 'KeyZ', 'Space']) await s.key(code);
      check(`${label} regression / mobile=${mobile}`, (await s.logs()).starts.length === count);
    }
    await s.clear();
    for (let i = 0; i < 16; i++) { await s.choose(['Topre', '조약돌', '까랑까랑', '크리미'][i % 4]); await s.key('KeyA'); }
    check(`rapid switching / mobile=${mobile}`, (await s.logs()).starts.length === 28);
    await s.choose('Topre'); await s.clear();
    for (let i = 0; i < 80; i++) await s.key(pattern[i % pattern.length]);
    check(`80-keystroke burst / mobile=${mobile}`, (await s.logs()).starts.length === 160);
    // Pointer rows Q/A/Z and Space use the same routing.
    const rects = await s.page.evaluate(() => {
      const { innerWidth: w, innerHeight: h } = window;
      return { w, h };
    });
    if (mobile) {
      await s.clear();
      for (const [x, y] of [[105, 300], [195, 300], [287, 300]]) {
        await s.page.mouse.move(x, y); await s.page.mouse.down(); await s.page.mouse.up();
      }
      check(`pointer taps ${rects.w}x${rects.h}`, (await s.logs()).starts.length === 6);
    }
    await s.page.reload(); await s.page.waitForTimeout(1800);
    check(`Topre selection persists / mobile=${mobile}`, await s.chip('Topre').getAttribute('aria-checked') === 'true');
    check(`no page errors / mobile=${mobile}`, s.errors.length === 0);
    await s.context.close();
  }
  for (const opts of [{ fail: true }, { slow: true }]) {
    const s = await session(opts);
    await s.choose('Topre'); await s.clear();
    for (const code of ['KeyQ', 'Enter', 'Backspace']) await s.key(code);
    const loading = await s.logs();
    check(`load ${opts.fail ? 'failure fallback' : 'window keeps ready preset'}`, opts.fail ? loading.starts.length === 6 : loading.starts.length >= 3);
    if (opts.slow) {
      await s.page.waitForTimeout(4800); await s.clear(); await s.key('Enter');
      check('slow load eventually uses Topre Enter', (await s.logs()).plays[0]?.name === 'kb:topre:enterDown');
    }
    check('no errors during failed/slow load', s.errors.length === 0);
    await s.context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    window.__starts = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) { if (this.buffer?.length > 1) window.__starts++; return start.apply(this, args); };
  });
  await page.goto(url + 'keyboard-compare.html');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('12개 로드 완료'));
  check('comparison has all six presets', await page.locator('#preset option').count() === 6);
  for (const preset of ['pebble', 'clack', 'creamy-thocky', 'topre']) {
    await page.selectOption('#preset', preset);
    await page.evaluate(() => { window.__starts = 0; });
    await page.getByRole('button', { name: '같은 패턴 듣기' }).click(); await page.waitForTimeout(2700);
    check(`comparison ${preset} demo starts`, await page.evaluate(() => window.__starts) === (preset === 'creamy-thocky' ? 16 : 32));
  }
  check('comparison demo no errors', errors.length === 0);
  await context.close();
  console.log(JSON.stringify({ passed: results.length, checks: results, listening: 'NOT performed; routing and actual Web Audio start() calls only' }, null, 2));
} finally { await browser.close(); }
