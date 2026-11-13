// creamy-thocky regression/behaviour check in real Chrome (mobile viewport).
// Usage: npx vite --port 4341 &  node scripts/creamy-check.mjs [http://localhost:4341/]
// Counts AudioBufferSourceNode.start() calls (sounds actually scheduled). It does NOT judge how anything sounds.
import { chromium } from 'playwright-core';
const URL = process.argv[2] ?? 'http://localhost:4341/';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal'] });
const results = {};
const ok = (name, cond, extra = '') => { results[name] = cond ? 'PASS' : `FAIL ${extra}`; };

async function session(label, { failCreamy = false, mobile = true } = {}) {
  const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1000, height: 800 } });
  const p = await ctx.newPage();
  const errs = [], warns = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warns.push(m.text()); });
  await p.addInitScript(() => {
    window.__starts = [];
    const st = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { if (this.buffer && this.buffer.length > 1) window.__starts.push(this.buffer.length); return st.apply(this, a); };
  });
  if (failCreamy) await p.route('**/sfx/keyboard/creamy-thocky*', (r) => r.abort());
  await p.goto(URL + '#/keyboard');
  await p.waitForTimeout(2500);
  await p.mouse.click(195, 120); await p.waitForTimeout(600); // unlock audio
  const starts = () => p.evaluate(() => window.__starts.slice());
  const key = async (code) => { await p.evaluate(() => document.activeElement?.blur?.()); await p.keyboard.down(code); await p.waitForTimeout(40); await p.keyboard.up(code); await p.waitForTimeout(40); };
  const chip = (re) => p.getByRole('radio', { name: re });
  return { p, ctx, errs, warns, starts, key, chip, label };
}

// 1) creamy-thocky is listed and plays key-downs only
{
  const s = await session('normal');
  const names = await s.p.getByRole('radio').allTextContents();
  ok('chips_listed', ['조약돌', '얼음', '크림'].every((n) => names.some((t) => t.includes(n))), JSON.stringify(names));
  await s.chip(/크림/).click(); await s.p.waitForTimeout(1500);
  ok('chip_checked', (await s.chip(/크림/).getAttribute('aria-checked')) === 'true');
  const a = (await s.starts()).length;
  for (const k of ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'KeyC', 'Space']) await s.key(k);
  const L = (await s.starts()).slice(a);
  ok('creamy_each_key_one_sound(10 keys → 10 starts, no release sound)', L.length === 10, `starts=${L.length}`);
  // creamy clips are 5.9k–8.2k samples @48k; pebble down/up buffers are < 5.2k → the buffers played must all be creamy-sized
  ok('creamy_buffers_are_creamy_clips', L.every((n) => n > 5500), JSON.stringify(L));
  // pointer taps on keys too
  const b2 = (await s.starts()).length;
  for (const [x, y] of [[105, 300], [195, 300], [287, 300]]) { await s.p.mouse.move(x, y); await s.p.mouse.down(); await s.p.waitForTimeout(50); await s.p.mouse.up(); await s.p.waitForTimeout(50); }
  ok('creamy_pointer_taps', (await s.starts()).length - b2 === 3, `${(await s.starts()).length - b2}`);
  // regression: pebble + clack still play down AND up
  for (const [re, n] of [[/조약돌/, 'pebble'], [/얼음/, 'clack']]) {
    await s.chip(re).click(); await s.p.waitForTimeout(1500);
    const c0 = (await s.starts()).length;
    for (const k of ['KeyQ', 'KeyW', 'KeyE', 'Space']) await s.key(k);
    const m = (await s.starts()).length - c0;
    ok(`${n}_regression_down+up(4 keys → 8 starts)`, m === 8, `starts=${m}`);
  }
  // 2) fast preset switching while typing: never silent, never errors
  const f0 = (await s.starts()).length; let downs = 0;
  const order = [/크림/, /조약돌/, /얼음/, /크림/, /얼음/, /조약돌/, /크림/, /조약돌/, /크림/, /얼음/];
  for (const re of order) { await s.chip(re).click(); await s.key('KeyA'); downs++; }
  const sw = (await s.starts()).length - f0;
  ok('rapid_switch_every_press_audible', sw >= downs, `starts=${sw} presses=${downs}`);
  // 3) continuous typing burst on creamy
  await s.chip(/크림/).click(); await s.p.waitForTimeout(300);
  const g0 = (await s.starts()).length;
  const ks = ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'KeyC', 'Space'];
  await s.p.evaluate(() => document.activeElement?.blur?.());
  for (let i = 0; i < 60; i++) { await s.p.keyboard.down(ks[i % 10]); await s.p.keyboard.up(ks[i % 10]); await s.p.waitForTimeout(25); }
  ok('creamy_burst_60_keys', (await s.starts()).length - g0 === 60, `starts=${(await s.starts()).length - g0}`);
  // 4) reload keeps selection
  await s.p.reload(); await s.p.waitForTimeout(2500);
  ok('selection_persisted', (await s.chip(/크림/).getAttribute('aria-checked')) === 'true');
  ok('no_page_errors(normal)', s.errs.length === 0, JSON.stringify(s.errs));
  await s.ctx.close();
}

// 5) load failure → synthesized fallback (key down AND up), warning logged, no crash
{
  const s = await session('fail', { failCreamy: true });
  await s.chip(/크림/).click(); await s.p.waitForTimeout(1500);
  const a = (await s.starts()).length;
  for (const k of ['KeyQ', 'KeyW', 'Space']) await s.key(k);
  const m = (await s.starts()).length - a;
  ok('load_failure_falls_back_to_synth(3 keys → 6 starts)', m === 6, `starts=${m}`);
  ok('load_failure_warns', s.warns.some((w) => /creamy-thocky.*failed/.test(w)), JSON.stringify(s.warns.slice(0, 3)));
  ok('no_page_errors(fail)', s.errs.length === 0, JSON.stringify(s.errs));
  await s.ctx.close();
}

// 6) selecting creamy while it is still loading (slow network): previous preset keeps sounding, no silence
{
  const s = await session('slow', {});
  await s.p.route('**/sfx/keyboard/creamy-thocky*', async (r) => { await new Promise((q) => setTimeout(q, 3000)); r.continue(); });
  await s.p.reload(); await s.p.waitForTimeout(2500); await s.p.mouse.click(195, 120);
  await s.chip(/크림/).click();
  const a = (await s.starts()).length;
  for (const k of ['KeyQ', 'KeyW', 'KeyE']) await s.key(k);
  const during = (await s.starts()).length - a;
  ok('loading_window_not_silent(3 keys ≥ 3 starts)', during >= 3, `starts=${during}`);
  await s.p.waitForTimeout(8000);
  const c = (await s.starts()).length;
  await s.key('KeyQ');
  ok('after_load_creamy_plays', (await s.starts()).length - c === 1);
  ok('no_page_errors(slow)', s.errs.length === 0, JSON.stringify(s.errs));
  await s.ctx.close();
}

// 7) desktop viewport smoke
{
  const s = await session('desktop', { mobile: false });
  await s.chip(/크림/).click(); await s.p.waitForTimeout(1500);
  const a = (await s.starts()).length; await s.key('KeyQ');
  ok('desktop_smoke', (await s.starts()).length - a === 1 && s.errs.length === 0, JSON.stringify(s.errs));
  await s.ctx.close();
}
console.log(JSON.stringify(results, null, 1));
await b.close();
process.exit(Object.values(results).some((v) => v !== 'PASS') ? 1 : 0);
