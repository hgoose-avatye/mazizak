// Detailed QA in system Chrome (mobile emulation, real CDP touch): every toy loads without errors, squashes, keeps its shape or
// recovers like memory foam as its catalog says, stays on screen when pulled hard, 초기화 restores it; every keyboard preset plays;
// the three tabs, their lists and each tab's last toy; settings; free picks + the ad popup (?ads=mock, pretendAds); the SDK mock
// windows (no hearts); landscape layout. Needs a plain dev server (see make-thumbs.mjs for the env):
//   BASE=http://127.0.0.1:4354 node scripts/qa-check.mjs [outDir for screenshots, default ./qa-shots]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4354';
const OUT = process.argv[2] ?? './qa-shots';
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (area, name, pass, detail = '') => { results.push({ area, name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  [${area}] ${name}${detail ? ' — ' + detail : ''}`); };

const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });

async function open(viewport = { width: 390, height: 844 }) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Session Initialize Error|서명이 없습니다|favicon/.test(m.text())) errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id ?? 1 })) });
  return { ctx, p, errors, touch };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(p, ms = 400) {
  await wait(ms);
  await p.waitForFunction(() => window.__MANZIZAK__?.frames?.() > 0, null, { timeout: 15000 }).catch(() => {});
}
// the toy report; its screenBox ({x0,y0,x1,y1} canvas px) is turned into page px {x,y,w,h} with the stage's offset
const report = (p) => p.evaluate(() => {
  const r = window.__MANZIZAK__?.report?.();
  if (!r) return r;
  const st = document.querySelector('#stage').getBoundingClientRect(), b = r.screenBox;
  if (b) r.screenBox = { x: b.x0 + st.left, y: b.y0 + st.top, w: b.x1 - b.x0, h: b.y1 - b.y0 };
  return r;
});
async function drag(t, x0, y0, x1, y1, steps = 12, holdMs = 120) {
  await t('touchStart', [[x0, y0]]);
  await wait(holdMs);
  for (let i = 1; i <= steps; i++) { await t('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]); await wait(16); }
  await t('touchEnd', []);
}

// ---------------------------------------------------------------- catalog
const s0 = await open();
await s0.p.goto(BASE + '/?ads=off#/S01');
await settle(s0.p, 1500);
const cat = await s0.p.evaluate(async () => {
  const c = await import('/src/toys/fidgets/catalog.ts');
  const k = await import('/src/toys/keyboard/info.ts');
  const loc = await import('/src/audio/localKeyPresets.ts');
  return { toys: c.FIDGETS.map((f) => ({ id: f.id, name: f.name, category: f.category, family: f.family, plastic: f.plastic === Infinity ? 'keep' : f.plastic ?? null })), kb: Object.keys(k.KEY_PRESET_INFO).filter((p) => loc.isKeyPresetEnabled(p)) };
});
await s0.ctx.close();
const fidgetTab = cat.toys.filter((t) => t.category !== '뭉개기'), squashTab = cat.toys.filter((t) => t.category === '뭉개기');

// ---------------------------------------------------------------- every toy: load, errors, squash, behaviour after release, reset, on-screen
for (const t of cat.toys) {
  const s = await open();
  await s.p.goto(BASE + `/?ads=off#/${t.id}`);
  await settle(s.p, 2200);
  const r0 = await report(s.p);
  ok('load', `${t.name}(${t.id}) 불러오기`, !!r0 && r0.id === t.id && s.errors.length === 0, s.errors.slice(0, 2).join(' | '));
  if (!r0) { await s.ctx.close(); continue; }
  const box = r0.screenBox; // {x,y,w,h} css px
  const cx = box ? box.x + box.w / 2 : 195, cy = box ? box.y + box.h / 2 : 420;
  // press down on the top, then pull to the right edge hard, then rub
  await drag(s.touch, cx, cy - (box?.h ?? 200) * 0.25, cx, cy + (box?.h ?? 200) * 0.05, 10, 500);
  await wait(150);
  await drag(s.touch, cx + (box?.w ?? 200) * 0.3, cy, 385, cy, 18, 200);
  await drag(s.touch, cx - 40, cy + 20, cx + 60, cy + 30, 10, 60);
  await drag(s.touch, cx + 60, cy + 30, cx - 50, cy + 10, 10, 60);
  await wait(600);
  const r1 = await report(s.p);
  const vp = s.p.viewportSize();
  const sb = r1?.screenBox;
  ok('bounds', `${t.name} 세게 당겨도 화면 안`, !!sb && sb.x >= -2 && sb.x + sb.w <= vp.width + 2 && sb.y >= 0, sb ? `x ${sb.x.toFixed(0)}..${(sb.x + sb.w).toFixed(0)} / ${vp.width}` : 'no box');
  await s.p.screenshot({ path: `${OUT}/${t.id}-after.png` });
  const d1 = r1?.meshMaxDeformation ?? 0;
  await wait(t.plastic === 'keep' ? 3000 : 9000);
  const r2 = await report(s.p);
  const d2 = r2?.meshMaxDeformation ?? 0;
  if (t.family === 'wax') ok('wax', `${t.name} 누르면 깨짐`, (r2?.brokenFaces ?? 0) > 0 || (r2?.chocoShards ?? 0) > 0, `broken ${r2?.brokenFaces} shards ${r2?.chocoShards}`);
  if (t.plastic === 'keep') ok('shape', `${t.name} 모양 유지(복원 없음)`, d2 > d1 * 0.85 && d1 > 0.02, `def ${d1.toFixed(3)} → 3s ${d2.toFixed(3)}`);
  else if (typeof t.plastic === 'number') ok('shape', `${t.name} 메모리폼 천천히 회복`, d1 > 0.02 && d2 < d1 * 0.5, `def ${d1.toFixed(3)} → 9s ${d2.toFixed(3)}`);
  // reset button
  const resetVisible = await s.p.evaluate(() => !document.querySelector('[data-action="reset"]').hidden);
  const wantReset = t.category === '뭉개기' || t.category === '왁뿌볼';
  ok('reset', `${t.name} 초기화 버튼 ${wantReset ? '있음' : '없음'}`, resetVisible === wantReset);
  if (resetVisible) {
    await s.p.click('[data-action="reset"]');
    await wait(900);
    const r3 = await report(s.p);
    ok('reset', `${t.name} 초기화하면 원래대로`, (r3?.meshMaxDeformation ?? 1) < 0.02 && (r3?.brokenFaces ?? 0) === 0, `def ${r3?.meshMaxDeformation?.toFixed(3)} broken ${r3?.brokenFaces}`);
    await s.p.screenshot({ path: `${OUT}/${t.id}-reset.png` });
  }
  ok('errors', `${t.name} 조작 중 콘솔 오류 없음`, s.errors.length === 0, s.errors.slice(0, 2).join(' | '));
  await s.ctx.close();
}

// ---------------------------------------------------------------- keyboards
for (const k of cat.kb) {
  const s = await open();
  await s.p.goto(BASE + `/?ads=off#/keyboard/${k}`);
  await settle(s.p, 2500);
  for (const key of ['q', 'w', 'e', 'a', 's', 'd', ' ']) { await s.p.keyboard.press(key); await wait(60); }
  await wait(400);
  await s.p.screenshot({ path: `${OUT}/kb-${k}.png` });
  ok('keyboard', `키보드 ${k} 불러오기·누르기`, s.errors.length === 0, s.errors.slice(0, 2).join(' | '));
  await s.ctx.close();
}

// ---------------------------------------------------------------- tabs, lists, last toy per tab
{
  const s = await open();
  await s.p.goto(BASE + '/?ads=off#/S02');
  await settle(s.p, 1800);
  const countIn = async (c) => { await s.p.click(`[data-category="${c}"]`); await wait(1300); return s.p.evaluate(() => ({ n: document.querySelectorAll('.toy-item').length, title: document.title, hash: location.hash })); };
  const sq = await countIn('squash');
  ok('tabs', `뭉개기 탭 목록 ${squashTab.length}개`, sq.n === squashTab.length, `${sq.n}개 · 연 장난감 ${sq.title}`);
  // open a different squash toy, then come back
  await s.p.evaluate(() => [...document.querySelectorAll('.toy-item')][2].click());
  await wait(1300);
  const lastSquash = await s.p.evaluate(() => location.hash);
  const kbr = await countIn('keyboard');
  ok('tabs', `키보드 탭 목록 ${cat.kb.length}개`, kbr.n === cat.kb.length, `${kbr.n}개`);
  const fi = await countIn('fidget');
  ok('tabs', `말랑이 탭 목록 ${fidgetTab.length}개, 마지막(모닝빵)으로`, fi.n === fidgetTab.length && fi.hash === '#/S02', `${fi.n}개 · ${fi.hash}`);
  const back = await countIn('squash');
  ok('tabs', '뭉개기 탭이 마지막에 연 장난감으로', back.hash === lastSquash, `${back.hash} (기대 ${lastSquash})`);
  // settings sheet
  await s.p.click('[data-action="settings"]');
  await wait(500);
  const sheetOpen = await s.p.evaluate(() => !document.querySelector('#sheet').hidden);
  await s.p.screenshot({ path: `${OUT}/settings.png` });
  await s.p.click('#sheet [data-action="close-sheet"].primary');
  await wait(400);
  const sheetClosed = await s.p.evaluate(() => document.querySelector('#sheet').hidden);
  ok('ui', '설정 팝업 열고 닫기', sheetOpen && sheetClosed);
  const cat2 = await s.p.evaluate(() => getComputedStyle(document.querySelector('.now-category')).display);
  ok('ui', "이름 위 '키보드' 표시 숨김", cat2 === 'none');
  const dockHead = await s.p.evaluate(() => getComputedStyle(document.querySelector('.dock-toggle')).display === 'none' && getComputedStyle(document.querySelector('.collection-count')).display === 'none');
  ok('ui', '서랍 머리줄·개수 문구 없음', dockHead);
  const platform = await s.p.evaluate(() => document.documentElement.dataset.platform);
  ok('ui', '미리보기에 토스 상단 여백 적용', platform === 'toss');
  ok('errors', '탭·설정 조작 중 콘솔 오류 없음', s.errors.length === 0, s.errors.slice(0, 2).join(' | '));
  await s.ctx.close();
}

// ---------------------------------------------------------------- free picks + ad popup (stand-in ads)
{
  const s = await open();
  await s.p.goto(BASE + '/?ads=mock#/S01');
  await settle(s.p, 2500);
  const chip = await s.p.evaluate(() => ({ shown: !document.querySelector('#free-timer').hidden, label: document.querySelector('#free-timer-label').textContent, time: document.querySelector('#free-timer-time').textContent, pips: document.querySelectorAll('#free-pips i.on').length }));
  ok('gate', '왼쪽 위 무료 칩(3개·시간)', chip.shown && chip.pips === 3 && /^\d+:\d\d:\d\d$/.test(chip.time) && chip.label === '무료 만지기', JSON.stringify(chip));
  const pick = (i) => s.p.evaluate((i) => [...document.querySelectorAll('.toy-item')][i].click(), i);
  for (const i of [1, 2, 3]) { await pick(i); await wait(1400); }
  const after3 = await s.p.evaluate(() => ({ pips: document.querySelectorAll('#free-pips i.on').length, sheet: !document.querySelector('#ad-sheet').hidden }));
  ok('gate', '말랑이 3번 고르면 무료 0', after3.pips === 0 && !after3.sheet, JSON.stringify(after3));
  await pick(4);
  await wait(600);
  const sheet = await s.p.evaluate(() => ({ open: !document.querySelector('#ad-sheet').hidden, title: document.querySelector('#ad-title').textContent, btn: document.querySelector('#ad-watch').textContent, text: document.querySelector('#ad-text').textContent, thumb: !!document.querySelector('#ad-thumb .thumb') }));
  ok('gate', '4번째는 광고 팝업(만지기 문구·썸네일)', sheet.open && /만지기$/.test(sheet.title) && sheet.btn === '광고 보고 만지기' && sheet.thumb && !/끝까지/.test(sheet.text), JSON.stringify(sheet));
  await s.p.screenshot({ path: `${OUT}/ad-sheet.png` });
  const before = await s.p.evaluate(() => location.hash);
  await s.p.click('#ad-watch');
  await wait(1500);
  const opened = await s.p.evaluate(() => ({ hash: location.hash, sheet: !document.querySelector('#ad-sheet').hidden, mockAd: !!document.querySelector('.mock-ad') }));
  ok('gate', '광고 버튼 → 광고 없이 바로 열림(pretendAds)', opened.hash !== before && !opened.sheet && !opened.mockAd, JSON.stringify(opened));
  // keyboard tab: locked last preset? free picks for keyboard are still 3 → it just opens
  await s.p.click('[data-category="keyboard"]');
  await wait(1400);
  const kchip = await s.p.evaluate(() => document.querySelector('#free-timer-label').textContent);
  ok('gate', '키보드 탭이면 칩이 "무료 누르기"', kchip === '무료 누르기', kchip);
  ok('errors', '무료·광고 흐름 중 콘솔 오류 없음', s.errors.length === 0, s.errors.slice(0, 2).join(' | '));
  await s.ctx.close();
}

// ---------------------------------------------------------------- SDK mock screens
{
  const s = await open();
  await s.p.goto(BASE + '/?gfmock=missions#/S01');
  await settle(s.p, 4000);
  const m = await s.p.evaluate(() => { const d = document.querySelector('.gf-rx-dialog'); return { open: !!d, text: d?.innerText ?? '', bg: d ? getComputedStyle(d).backgroundImage.slice(0, 20) : '' }; });
  ok('sdk', 'SDK 미션 창 열림(Ice 배경)', m.open && m.bg.startsWith('url('), m.bg);
  ok('sdk', '미션 창에 하트 없음', !/하트/.test(m.text), m.text.match(/[^\n]*하트[^\n]*/)?.[0] ?? '');
  await s.p.screenshot({ path: `${OUT}/sdk-missions.png` });
  await s.p.evaluate(() => window.__gfMock?.openAttendance());
  await wait(800);
  await s.p.screenshot({ path: `${OUT}/sdk-attendance.png` });
  ok('errors', 'SDK 모의 화면 콘솔 오류 없음(네트워크 차단 메시지 제외)', s.errors.length === 0, s.errors.slice(0, 2).join(' | '));
  await s.ctx.close();
}

// ---------------------------------------------------------------- landscape
for (const [id, label] of [['S01', '말랑이'], ['M01', '뭉개기'], ['keyboard/pebble', '키보드']]) {
  const s = await open({ width: 844, height: 390 });
  await s.p.goto(BASE + `/?ads=mock#/${id}`);
  await settle(s.p, 2500);
  const lay = await s.p.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
    return { chip: r('#free-timer'), actions: r('.head-actions'), dock: r('#dock'), w: innerWidth, h: innerHeight };
  });
  const overlap = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  ok('landscape', `가로 화면 ${label}: 칩·버튼·서랍 겹침 없음`, !overlap(lay.chip, lay.actions) && !overlap(lay.chip, lay.dock) && !overlap(lay.actions, lay.dock), JSON.stringify(lay));
  await s.p.screenshot({ path: `${OUT}/landscape-${label}.png` });
  ok('errors', `가로 화면 ${label} 콘솔 오류 없음`, s.errors.length === 0, s.errors.slice(0, 2).join(' | '));
  await s.ctx.close();
}

await b.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
const fails = results.filter((r) => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log(` - [${f.area}] ${f.name} — ${f.detail}`); }
