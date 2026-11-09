// Keyboard defect check (C2 silence after preset switch, C3 GPU compile/upload on switch).
// Usage: npx vite --port 4331  &&  node scripts/kb-defects-check.mjs [http://localhost:4331/]   (DELAY=ms to slow clack samples, default 6000)
// Expect: C3_* all 0 and C2_* sound counts == key events (6 and 4).
import { chromium } from 'playwright-core';
const URL = process.argv[2] ?? 'http://localhost:4331/';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.addInitScript(() => {
  const w = window; w.__probe = { link: 0, compile: 0, tex: 0, starts: [] };
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const lp = C.prototype.linkProgram; C.prototype.linkProgram = function (...a) { w.__probe.link++; return lp.apply(this, a); };
    const cs = C.prototype.compileShader; C.prototype.compileShader = function (...a) { w.__probe.compile++; return cs.apply(this, a); };
    for (const fn of ['texImage2D','texSubImage2D','texStorage2D']) { const o = C.prototype[fn]; if (o) C.prototype[fn] = function (...a) { w.__probe.tex++; return o.apply(this, a); }; }
  }
  const st = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { if (this.buffer && this.buffer.length > 1) w.__probe.starts.push({ t: performance.now(), len: this.buffer.length }); return st.apply(this, a); };
});
// slow down clack sample delivery to expose the loading window (simulates mobile network)
await p.route('**/sfx/keyboard/clack*', async (r) => { await new Promise((s) => setTimeout(s, +(process.env.DELAY ?? 6000))); r.continue(); });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL + '#/keyboard'); await p.waitForTimeout(2500);
await p.mouse.click(195, 120); await p.waitForTimeout(800); // unlock audio (pointerup), outside keys
const tap = async (x, y) => { await p.mouse.move(x, y); await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up(); await p.waitForTimeout(60); };
const probe = () => p.evaluate(() => ({ ...window.__probe, starts: window.__probe.starts.length }));
const before = await probe();
// C3: switch to clack, count shader compiles/links/texture uploads across the next frames
const t0 = await p.evaluate(() => performance.now());
await p.getByRole('radio', { name: /까랑까랑/ }).click();
await p.waitForTimeout(300);
const afterSwitch = await probe();
// C2: press physical keys right after the switch (inside the delayed-load window)
await tap(105, 300); await tap(195, 300); await tap(287, 300);
await p.waitForTimeout(150);
const afterKeys = await probe();
await p.waitForTimeout(2 * +(process.env.DELAY ?? 6000) + 500); // json + wav both delayed → clack now loaded
await tap(105, 390); await tap(195, 390);
await p.waitForTimeout(150);
const afterLoaded = await probe();
// switch back to pebble, then clack again (should be cheap after first time / after fix)
await p.getByRole('radio', { name: /조약돌/ }).click(); await p.waitForTimeout(300);
const s1 = await probe();
await p.getByRole('radio', { name: /까랑까랑/ }).click(); await p.waitForTimeout(300);
const s2 = await probe();
const d = (a, b) => ({ link: b.link - a.link, compile: b.compile - a.compile, tex: b.tex - a.tex });
console.log(JSON.stringify({
  C3_firstClackSwitch: d(before, afterSwitch),
  C3_backToPebble: d(afterLoaded, s1),
  C3_secondClackSwitch: d(s1, s2),
  C2_soundsFor6KeyEventsWhileLoading: afterKeys.starts - afterSwitch.starts,
  C2_soundsFor4KeyEventsAfterLoaded: afterLoaded.starts - afterKeys.starts,
  errors: errs,
}, null, 1));
await b.close();
