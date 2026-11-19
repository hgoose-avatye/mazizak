// Responsive / adaptive layout regression check: real DOM boxes, real toy state and real CDP touch input, across a fixed set of
// representative viewports plus seeded random ones. Not a device lab: Chrome's emulation does not reproduce a real fold, hinge,
// browser toolbars, touch hardware or GPU speed — those stay "unverified" until checked on a device.
//
// Usage (dev server, which exposes window.__MANZIZAK__):
//   npx vite --port 4362 &   BASE=http://127.0.0.1:4362 node scripts/responsive-check.mjs [--seed 1234] [--random 24] [--quick]
// A failure prints the viewport, DPR, safe-area insets and the seed; re-run with that --seed to reproduce the same viewports.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = process.env.BASE ?? 'http://127.0.0.1:4362';
const SEED = Number(arg('--seed', Date.now() % 100000));
const RANDOM = Number(arg('--random', 24));
const QUICK = process.argv.includes('--quick');
const OUT = new URL('../bench-out/responsive/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// [label, w, h, dpr, safe-area insets {t,r,b,l}] — samples, not device specs
const notch = { t: 47, r: 0, b: 34, l: 0 }, notchL = { t: 0, r: 47, b: 21, l: 47 }, none = { t: 0, r: 0, b: 0, l: 0 };
const FIXED = [
  ['small-phone', 320, 568, 2, none], ['phone', 360, 800, 3, { t: 24, r: 0, b: 16, l: 0 }], ['phone-mid', 390, 844, 3, notch],
  ['phone-large', 430, 932, 3, { t: 59, r: 0, b: 34, l: 0 }], ['fold-cover', 344, 882, 3, { t: 28, r: 0, b: 16, l: 0 }],
  ['fold-open', 674, 842, 2.5, { t: 28, r: 0, b: 16, l: 0 }], ['tablet-portrait', 768, 1024, 2, { t: 24, r: 0, b: 20, l: 0 }],
  ['tablet-landscape', 1024, 768, 2, { t: 24, r: 0, b: 20, l: 0 }], ['desktop', 1440, 900, 1, none],
  ['phone-landscape', 844, 390, 3, notchL], ['phone-large-landscape', 932, 430, 3, notchL], ['small-landscape', 568, 320, 2, none],
  ['split-short', 390, 480, 3, none], ['short-desktop', 1280, 560, 1, none], ['ultrawide', 2200, 700, 1, none],
  ['zoom-200%', 195, 422, 6, none], ['flip-tall', 280, 653, 3, { t: 24, r: 0, b: 16, l: 0 }], ['fold-open-landscape', 842, 674, 2.5, none],
];

// seeded viewports: very narrow, short, wide-and-low, narrow-and-tall, high DPR
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const RANDOMS = Array.from({ length: QUICK ? 6 : RANDOM }, (_, i) => {
  const w = Math.round(280 + rnd() * 1900), aspect = 0.4 + rnd() * 2.8, h = Math.max(300, Math.min(1400, Math.round(w / aspect)));
  return [`random-${i}`, w, h, pick([1, 1.5, 2, 2.625, 3, 3.5]), rnd() < 0.4 ? (w > h ? notchL : notch) : none];
});

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const failures = [], results = [];
let checks = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(w, h, dpr, inset) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 1000, hasTouch: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  // Chrome cannot emulate env(safe-area-inset-*): every layout rule reads them through --safe-*, so those are overridden
  await p.addInitScript((i) => document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = `:root{--safe-t:${i.t}px!important;--safe-r:${i.r}px!important;--safe-b:${i.b}px!important;--safe-l:${i.l}px!important}`;
    document.head.append(s);
  }), inset);
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id ?? 1 })) });
  return { ctx, p, cdp, touch, errors };
}
const report = (p) => p.evaluate(() => window.__MANZIZAK__.report());
async function go(p, hash, id) {
  await p.evaluate((h) => { location.hash = h; }, hash);
  await p.waitForFunction((i) => { const r = window.__MANZIZAK__?.report(); return r && (i === 'keyboard' ? r.keyRectsPx?.length : r.id === i); }, id, { timeout: 20000 });
  await p.evaluate(() => document.fonts.ready);
  await sleep(250);
}

/** Layout invariants measured in the live DOM. */
function layoutProbe(inset) {
  const vw = innerWidth, vh = innerHeight, out = { problems: [] };
  const bad = (m) => out.problems.push(m);
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) bad(`horizontal scroll ${de.scrollWidth} > ${vw}`);
  if (de.scrollHeight > vh + 1) bad(`vertical page scroll ${de.scrollHeight} > ${vh}`);
  const stage = document.querySelector('#stage').getBoundingClientRect();
  out.stage = [stage.left, stage.top, stage.width, stage.height].map(Math.round);
  if (stage.width < 160 || stage.height < 160) bad(`stage too small ${out.stage}`);
  const vis = (e) => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  const controls = [...document.querySelectorAll('.head-actions button, #dock-toggle, .cat-seg button, #variants button')].filter(vis);
  // the selected toy and whatever else of the list is fully in view
  const list = document.querySelector('#toy-list'), lr = list.getBoundingClientRect();
  const lc = getComputedStyle(list), box = { l: lr.left + parseFloat(lc.paddingLeft), r: lr.right - parseFloat(lc.paddingRight), t: lr.top + parseFloat(lc.paddingTop), b: lr.bottom - parseFloat(lc.paddingBottom) };
  // "in view" = inside the list's content box; an item scrolled under the list's own end padding (home-indicator room) is mid-scroll
  const items = [...list.querySelectorAll('.toy-item')].filter((e) => { const r = e.getBoundingClientRect(); return vis(e) && r.left >= box.l - 1 && r.right <= box.r + 1 && r.top >= box.t - 1 && r.bottom <= box.b + 1; });
  const sel = list.querySelector('[aria-checked=true]');
  if (document.querySelector('#dock-toggle').getAttribute('aria-expanded') === 'true' && !items.includes(sel)) bad('selected toy not scrolled into view');
  out.minTarget = Infinity;
  for (const el of [...controls, ...items]) {
    const r = el.getBoundingClientRect(), name = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 12) || el.id;
    const primary = !el.matches('#dock-toggle, .cat-seg button'); // drawer toggle / category tabs: secondary, WCAG 2.5.8 24 px
    const min = Math.min(r.width, r.height);
    if (primary) out.minTarget = Math.min(out.minTarget, min);
    if (min < (primary ? 40 : 24)) bad(`small target "${name}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    if (r.left < inset.l - 0.5 || r.right > vw - inset.r + 0.5 || r.top < inset.t - 0.5 || r.bottom > vh - inset.b + 0.5) bad(`"${name}" outside safe area [${[r.left, r.top, r.right, r.bottom].map(Math.round)}]`);
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !(el === hit || el.contains(hit))) bad(`"${name}" covered by ${hit?.id || hit?.className || hit?.tagName}`);
  }
  // text that should never be cut: the toy's name (wraps), drawer labels (ellipsis allowed on toy names only)
  const nm = document.querySelector('#now-name');
  if (vis(nm) && nm.scrollWidth > nm.clientWidth + 1) bad('toy name clipped');
  for (const el of document.querySelectorAll('.cat-seg button, .head-actions button'))
    if (vis(el) && el.scrollWidth > el.clientWidth + 1) bad(`text clipped in "${el.textContent.trim()}"`);
  return out;
}

/** The toy is on the stage, not under the UI, and touch lands where it is drawn. */
async function toyProbe(o, kind) {
  const { p, touch } = o;
  const r = await report(p);
  const st = await p.locator('#stage').boundingBox();
  const b = r.screenBox, problems = [];
  const tol = 6;
  if (b.x0 < -tol || b.y0 < -tol || b.x1 > st.width + tol || b.y1 > st.height + tol) problems.push(`toy outside stage box=${JSON.stringify(b)} stage=${Math.round(st.width)}×${Math.round(st.height)}`);
  // points that must show the toy (canvas on top): toy centre + inner box; keyboard: every key centre
  const pts = kind === 'keyboard'
    ? r.keyRectsPx.map((k) => [k.cx, k.cy, k.id])
    : [[0.5, 0.5], [0.3, 0.4], [0.7, 0.4], [0.5, 0.75]].map(([fx, fy]) => [b.x0 + (b.x1 - b.x0) * fx, b.y0 + (b.y1 - b.y0) * fy]);
  const covered = await p.evaluate(({ pts, ox, oy }) => pts.filter(([x, y]) => document.elementFromPoint(ox + x, oy + y)?.tagName !== 'CANVAS').map(([x, y]) => [Math.round(x), Math.round(y), document.elementFromPoint(ox + x, oy + y)?.className]), { pts, ox: st.x, oy: st.y });
  if (covered.length) problems.push(`toy covered by UI at ${JSON.stringify(covered)}`);
  // presses on the toy right beside a control must stay on the toy (Chrome's touch adjustment used to snap them onto the control)
  const state = () => p.evaluate(() => [document.querySelector('#dock-toggle').getAttribute('aria-expanded'), document.querySelector('#sound-btn').getAttribute('aria-pressed'), document.querySelector('#sheet').hidden, location.hash].join('|'));
  const s0 = await state();
  const near = await p.evaluate(() => [...document.querySelectorAll('.head-actions button, #dock-toggle')].filter((e) => e.getClientRects().length).flatMap((e) => {
    const r = e.getBoundingClientRect();
    return [[r.left + r.width / 2, r.bottom + 7], [r.left + r.width / 2, r.top - 7], [r.left - 7, r.top + r.height / 2]];
  }).filter(([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS'));
  for (const [x, y] of near) {
    await touch('touchStart', [[x, y]]); await sleep(40); await touch('touchEnd', []); await sleep(60);
    if ((await state()) !== s0) { problems.push(`tap on the toy at ${Math.round(x)},${Math.round(y)} triggered a nearby control`); break; }
  }
  const out = { box: b, problems };
  if (kind === 'keyboard') {
    out.minKey = Math.min(...r.keyRectsPx.map((k) => Math.min(k.w, k.h)));
    // tap keys at their drawn centre: the key that registers must be that key (render ↔ hit-test agreement)
    const keys = QUICK ? [0, 4, 9] : r.keyRectsPx.map((k) => k.id);
    for (const id of keys) {
      const k = r.keyRectsPx.find((q) => q.id === id);
      const n = (await report(p)).keyRecords.length;
      await touch('touchStart', [[st.x + k.cx, st.y + k.cy]]); await sleep(60); await touch('touchEnd', []);
      const ok = await p.waitForFunction((n) => window.__MANZIZAK__.report().keyRecords.length > n, n, { timeout: 2000 }).then(() => true, () => false);
      const got = ok ? (await report(p)).keyRecords.at(-1).keyId : null;
      if (got !== id) problems.push(`tap on key ${id} centre registered ${got}`);
    }
    if ((await report(p)).held !== 0) problems.push('key left held after taps');
  } else {
    const cx = st.x + (b.x0 + b.x1) / 2, cy = st.y + (b.y0 + b.y1) / 2;
    await touch('touchStart', [[cx, cy]]); await sleep(120);
    if ((await report(p)).contacts < 1) problems.push('touch on the toy centre did not reach the toy');
    await touch('touchEnd', []); await sleep(80);
    // an empty stage corner must not grab the toy
    const ex = st.x + 8, ey = st.y + st.height - 8;
    const onToy = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', [ex, ey]);
    if (onToy && (ex - st.x < b.x0 || ey - st.y > b.y1)) {
      await touch('touchStart', [[ex, ey]]); await sleep(80);
      if ((await report(p)).contacts > 0) problems.push('touch on empty stage corner grabbed the toy');
      await touch('touchEnd', []);
    }
  }
  return out;
}

async function runViewport([label, w, h, dpr, inset], deep) {
  const o = await open(w, h, dpr, inset);
  const res = { label, w, h, dpr, inset, problems: [] };
  try {
    await o.p.goto(`${BASE}/#/S01`);
    await o.p.waitForFunction(() => window.__MANZIZAK__?.report()?.id === 'S01', null, { timeout: 30000 });
    for (const [hash, id, kind] of [['#/S01', 'S01', 'fidget'], ['#/keyboard/pebble', 'keyboard', 'keyboard']]) {
      await go(o.p, hash, id);
      const lay = await o.p.evaluate(layoutProbe, inset);
      const toy = await toyProbe(o, kind);
      res[kind] = { stage: lay.stage, minTarget: lay.minTarget, box: toy.box, minKey: toy.minKey };
      res.problems.push(...lay.problems.map((m) => `${kind}: ${m}`), ...toy.problems.map((m) => `${kind}: ${m}`));
      if (deep) await o.p.screenshot({ path: `${OUT}${label}-${kind}.png` });
    }
    // settings sheet: fully on screen (scrolls inside if it must), close button reachable
    await o.p.locator('[data-action=settings]').first().click();
    await sleep(350);
    const sheet = await o.p.evaluate(() => {
      const pn = document.querySelector('.sheet-panel').getBoundingClientRect(), c = document.querySelector('.sheet-close').getBoundingClientRect();
      const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      return { inView: pn.top >= -0.5 && pn.bottom <= innerHeight + 0.5 && pn.left >= -0.5 && pn.right <= innerWidth + 0.5, closeHit: !!hit?.closest('.sheet-close') };
    });
    if (!sheet.inView) res.problems.push('settings sheet off screen');
    if (!sheet.closeHit) res.problems.push('settings close button not reachable');
    if (deep) await o.p.screenshot({ path: `${OUT}${label}-settings.png` });
    await o.p.keyboard.press('Escape');
    await o.p.waitForFunction(() => document.querySelector('#sheet').hidden); await sleep(300);
    // folding the drawer gives the toy more room and keeps its controls reachable
    const before = await o.p.locator('#stage').boundingBox();
    await o.p.locator('#dock-toggle').click();
    const grew = await o.p.waitForFunction((a) => { const r = document.querySelector('#stage').getBoundingClientRect(); return r.width * r.height > a; }, before.width * before.height, { timeout: 2000 }).then(() => true, () => false);
    if (!grew) res.problems.push('folding the drawer did not enlarge the stage');
    await sleep(200);
    const lay = await o.p.evaluate(layoutProbe, inset);
    res.problems.push(...lay.problems.map((m) => `folded: ${m}`));
    if (deep) await o.p.screenshot({ path: `${OUT}${label}-folded.png` });
    await o.p.locator('#dock-toggle').click(); await sleep(150);
    res.problems.push(...o.errors.map((e) => 'page error: ' + e));
  } catch (e) {
    res.problems.push('exception: ' + String(e).split('\n')[0]);
  } finally {
    await o.ctx.close();
  }
  checks++;
  results.push(res);
  if (res.problems.length) failures.push(res);
  console.log(`${res.problems.length ? 'FAIL' : 'ok  '} ${label} ${w}×${h}@${dpr}` + (res.problems.length ? '\n   - ' + res.problems.join('\n   - ') : `  keys≥${res.keyboard?.minKey}px targets≥${Math.round(Math.min(res.fidget?.minTarget, res.keyboard?.minTarget))}px`));
}

/** Rotation / fold / split-screen while the app is in use: state kept, in-flight touches end cleanly, input maps to the new frame. */
async function dynamicChecks() {
  const o = await open(390, 844, 3, notch);
  const { p, touch } = o, res = { label: 'dynamic', problems: [] }, bad = (m) => res.problems.push(m);
  try {
    await p.goto(`${BASE}/#/W01`);
    await p.waitForFunction(() => window.__MANZIZAK__?.report()?.id === 'W01', null, { timeout: 30000 });
    await sleep(300);
    const centre = async () => { const r = await report(p), st = await p.locator('#stage').boundingBox(); return [st.x + (r.screenBox.x0 + r.screenBox.x1) / 2, st.y + (r.screenBox.y0 + r.screenBox.y1) / 2]; };
    // crack the shell: firm presses until faces break (the state that must survive every resize below)
    for (let i = 0; i < 14 && !(await report(p)).brokenFaces; i++) {
      const [x, y] = await centre();
      await touch('touchStart', [[x + (i % 3 - 1) * 12, y + (i % 2) * 10]]);
      for (let k = 1; k <= 8; k++) { await touch('touchMove', [[x + (i % 3 - 1) * 12, y + (i % 2) * 10 + k * 4]]); await sleep(30); }
      await sleep(250); await touch('touchEnd', []); await sleep(150);
    }
    const cracked = (await report(p)).brokenFaces;
    if (!cracked) bad('could not crack 왁뿌볼 to set up the state test (no state to compare)');
    await p.evaluate(() => { document.querySelector('#dock-toggle').click(); }); // a UI state that must survive too
    await sleep(500);
    // cracks keep spreading for a moment after a press: wait until the count is still, so only a resize could change it
    for (let last = -1, i = 0; i < 20; i++) { const n = (await report(p)).brokenFaces; if (n === last) break; last = n; await sleep(400); }
    const frames0 = await p.evaluate(() => window.__MANZIZAK__.frames());
    // portrait → landscape → fold cover → unfolded → split-screen narrow → back, holding a finger on the toy across the first one
    const [x, y] = await centre();
    await touch('touchStart', [[x, y]]);
    await touch('touchMove', [[x + 20, y + 10]]); await sleep(120);
    if ((await report(p)).contacts < 1) bad('setup: finger not on the toy before rotation');
    for (const [w, h] of [[844, 390], [344, 882], [674, 842], [1024, 768], [320, 568], [390, 844]]) {
      for (let last = -1, i = 0; i < 20; i++) { const n = (await report(p)).brokenFaces; if (n === last) break; last = n; await sleep(400); }
      const cracked = (await report(p)).brokenFaces;
      await p.setViewportSize({ width: w, height: h }); await sleep(260);
      const r = await report(p);
      if (r.id !== 'W01') bad(`toy changed after resize to ${w}×${h}`);
      if (r.contacts !== 0) bad(`touch still held on the old frame after resize to ${w}×${h} (contacts=${r.contacts})`);
      if (r.brokenFaces !== cracked) bad(`cracked shell changed ${cracked}→${r.brokenFaces} after resize to ${w}×${h}`);
      if (await p.locator('#dock-toggle').getAttribute('aria-expanded') !== 'false') bad(`drawer state lost at ${w}×${h}`);
      const st = await p.locator('#stage').boundingBox(), cv = await p.evaluate(() => window.__MANZIZAK__.perf()?.canvas);
      if (Math.abs(cv[0] - st.width) > 1 || Math.abs(cv[1] - st.height) > 1) bad(`canvas ${cv} not re-fitted to stage ${st.width}×${st.height} at ${w}×${h}`);
      const [cx, cy] = await centre(); // and a fresh touch lands on the re-framed toy
      if (w === 844) await touch('touchEnd', []); // the finger from before the rotation lifts late: must do nothing
      await touch('touchStart', [[cx, cy]]); await sleep(100);
      if ((await report(p)).contacts < 1) bad(`touch after resize to ${w}×${h} missed the toy`);
      await touch('touchEnd', []); await sleep(60);
    }
    if ((await p.evaluate(() => window.__MANZIZAK__.frames())) <= frames0) bad('renderer stopped after resizes');
    // resize storm (split-screen divider dragged): no more than one re-fit per frame, no errors
    for (let i = 0; i < 40; i++) await p.setViewportSize({ width: 360 + (i % 10) * 30, height: 700 + (i % 7) * 20 });
    await sleep(300);
    // keyboard: a key held through a rotation is released (no stuck key, no stuck sound); the preset survives a reload (saved state)
    await p.setViewportSize({ width: 390, height: 844 });
    await p.evaluate(() => { document.querySelector('#dock-toggle').click(); });
    await go(p, '#/keyboard/turquoise-tealios', 'keyboard');
    let r = await report(p), st = await p.locator('#stage').boundingBox();
    await touch('touchStart', [[st.x + r.keyRectsPx[4].cx, st.y + r.keyRectsPx[4].cy]]); await sleep(80);
    if ((await report(p)).held !== 1) bad('setup: key not held');
    await p.setViewportSize({ width: 844, height: 390 }); await sleep(250);
    if ((await report(p)).held !== 0) bad('key stuck down after rotation');
    await touch('touchEnd', []);
    await p.reload();
    await p.waitForFunction(() => window.__MANZIZAK__?.report()?.preset, null, { timeout: 20000 });
    if ((await report(p)).preset !== 'turquoise-tealios') bad(`keyboard preset not restored after reload (${(await report(p)).preset})`);
    // multi-touch: two keys at once on the landscape layout
    await sleep(300);
    r = await report(p); st = await p.locator('#stage').boundingBox();
    await touch('touchStart', [[st.x + r.keyRectsPx[0].cx, st.y + r.keyRectsPx[0].cy, 1], [st.x + r.keyRectsPx[2].cx, st.y + r.keyRectsPx[2].cy, 2]]); await sleep(80);
    if ((await report(p)).held !== 2) bad(`two-finger press held ${(await report(p)).held} keys`);
    await touch('touchEnd', []); await sleep(80);
    if ((await report(p)).held !== 0) bad('keys held after two-finger release');
    // drawer in the rail: scrolls vertically, the page itself never scrolls
    const scrolled = await p.evaluate(async () => { const l = document.querySelector('#toy-list'); l.scrollTop = 0; l.scrollTop = 120; await new Promise((r) => requestAnimationFrame(r)); return { list: l.scrollTop, page: document.scrollingElement.scrollTop }; });
    if (!(scrolled.list > 0) || scrolled.page !== 0) bad(`rail scroll: ${JSON.stringify(scrolled)}`);
    res.problems.push(...o.errors.map((e) => 'page error: ' + e));
  } catch (e) { bad('exception: ' + String(e).split('\n')[0]); } finally { await o.ctx.close(); }
  checks++; results.push(res); if (res.problems.length) failures.push(res);
  console.log(`${res.problems.length ? 'FAIL' : 'ok  '} dynamic: rotation · fold sizes · split-screen · held touch/key · reload · multi-touch` + (res.problems.length ? '\n   - ' + res.problems.join('\n   - ') : ''));
}

/** Foldables through Chrome's display-feature emulation (Viewport Segments). Best effort: skipped if this Chrome lacks it. */
async function foldChecks() {
  const res = { label: 'fold-segments', problems: [], notes: [] };
  for (const [w, h, orientation] of [[842, 674, 'vertical'], [674, 842, 'horizontal']]) {
    const o = await open(w, h, 2.5, none);
    try {
      const offset = (orientation === 'vertical' ? w : h) / 2 - 3;
      try { await o.cdp.send('Emulation.setDisplayFeaturesOverride', { features: [{ orientation, offset, maskLength: 6 }] }); }
      catch (e) { res.notes.push(`display-feature emulation unavailable: ${String(e).split('\n')[0]}`); continue; }
      await o.p.goto(`${BASE}/#/keyboard/pebble`);
      await o.p.waitForFunction(() => window.__MANZIZAK__?.report()?.keyRectsPx?.length, null, { timeout: 30000 }); await sleep(300);
      const seg = await o.p.evaluate(() => ({ h: matchMedia('(horizontal-viewport-segments: 2)').matches, v: matchMedia('(vertical-viewport-segments: 2)').matches }));
      if (!seg.h && !seg.v) { res.notes.push(`${orientation} fold: segments media query not reported by this Chrome`); continue; }
      const st = await o.p.locator('#stage').boundingBox(), r = await report(o.p);
      if (orientation === 'vertical' && st.x + st.width > offset + 1) res.problems.push(`book posture: stage crosses the hinge (right ${st.x + st.width} > ${offset})`);
      if (orientation === 'horizontal' && st.y + st.height > offset + 1) res.problems.push(`table-top posture: stage crosses the hinge (bottom ${st.y + st.height} > ${offset})`);
      if (r.screenBox.y1 > st.height + 6 || r.screenBox.x1 > st.width + 6) res.problems.push(`${orientation} fold: toy outside its segment`);
      await o.p.screenshot({ path: `${OUT}fold-${orientation}.png` });
      res.notes.push(`${orientation} fold emulated: stage ${Math.round(st.width)}×${Math.round(st.height)}`);
    } finally { await o.ctx.close(); }
  }
  checks++; results.push(res); if (res.problems.length) failures.push(res);
  console.log(`${res.problems.length ? 'FAIL' : 'ok  '} fold segments` + (res.notes.length ? ' — ' + res.notes.join('; ') : '') + (res.problems.length ? '\n   - ' + res.problems.join('\n   - ') : ''));
}

/** Frame time, main-thread work, input delay and heap over a drag, portrait vs landscape. Headless Chrome on a Mac ≠ a phone GPU. */
async function perfChecks() {
  const res = { label: 'perf', rows: [], problems: [] };
  for (const [w, h, id] of [[390, 844, 'S01'], [844, 390, 'S01'], [390, 844, 'keyboard'], [1440, 900, 'S02']]) {
    const o = await open(w, h, 3, none);
    try {
      await o.p.goto(`${BASE}/#/${id}`);
      await o.p.waitForFunction((i) => { const r = window.__MANZIZAK__?.report(); return r && (i === 'keyboard' ? r.keyRectsPx?.length : r.id === i); }, id, { timeout: 30000 });
      await sleep(400);
      const heap0 = await o.p.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
      await o.p.evaluate(() => window.__MANZIZAK__.resetPerf());
      const st = await o.p.locator('#stage').boundingBox(), cx = st.x + st.width / 2, cy = st.y + st.height / 2;
      for (let rep = 0; rep < 3; rep++) {
        await o.touch('touchStart', [[cx, cy]]);
        for (let i = 0; i < 60; i++) { await o.touch('touchMove', [[cx + Math.sin(i / 6) * 40, cy + Math.cos(i / 6) * 25]]); await sleep(16); }
        await o.touch('touchEnd', []); await sleep(200);
      }
      const perf = await o.p.evaluate(() => window.__MANZIZAK__.perf());
      for (let i = 0; i < 20; i++) { await o.p.setViewportSize(i % 2 ? { width: w, height: h } : { width: h, height: w }); await sleep(60); }
      await o.p.setViewportSize({ width: w, height: h }); await sleep(300);
      const heap1 = await o.p.evaluate(() => { globalThis.gc?.(); return performance.memory?.usedJSHeapSize ?? 0; });
      const row = { viewport: `${w}×${h}`, toy: id, frameMs: perf.interval.map((v) => +v.toFixed(1)), workMs: perf.work.map((v) => +v.toFixed(2)), inputMs: perf.input.map((v) => +v.toFixed(1)), renderDpr: perf.dpr, heapMB: [+(heap0 / 1e6).toFixed(1), +(heap1 / 1e6).toFixed(1)] };
      res.rows.push(row);
      if (heap1 - heap0 > 40e6) res.problems.push(`${id} ${w}×${h}: heap grew ${(heap1 - heap0) / 1e6} MB over 20 rotations`);
    } finally { await o.ctx.close(); }
  }
  checks++; results.push(res); if (res.problems.length) failures.push(res);
  console.log('perf (p50/p95; headless Chrome, not a phone):');
  for (const r of res.rows) console.log(`   ${r.toy.padEnd(8)} ${r.viewport.padEnd(9)} frame ${r.frameMs.join('/')} ms · work ${r.workMs.join('/')} ms · input→frame ${r.inputMs.join('/')} ms · render DPR ${r.renderDpr} · heap ${r.heapMB.join('→')} MB`);
}

console.log(`responsive check — seed ${SEED} (re-run: --seed ${SEED})`);
for (const v of FIXED) await runViewport(v, true);
for (const v of RANDOMS) await runViewport(v, false);
await dynamicChecks();
await foldChecks();
if (!QUICK) await perfChecks();
await browser.close();
writeFileSync(OUT + 'report.json', JSON.stringify({ seed: SEED, results }, null, 1));
console.log(`\n${checks - failures.length}/${checks} passed · seed ${SEED} · screenshots + report.json in ${OUT}`);
if (failures.length) {
  console.log('FAILED (reproduce with --seed ' + SEED + '):');
  for (const f of failures) console.log(`  ${f.label}${f.w ? ` ${f.w}×${f.h}@${f.dpr} insets ${JSON.stringify(f.inset)}` : ''}`);
  process.exit(1);
}
