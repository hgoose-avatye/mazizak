/**
 * GFactory game SDK 0.38.18 (missions · 7-day attendance) — owner, 2026-11-20: "불가능한 것 빼고 적용".
 * Same setup as the live Toss web games (colorpop/animalpop, boltpop): reward.createView (uxVersion 2 · econ 5), Normal skin
 * (src/sdk/skin, Jua font), SDK file vendored at public/vendor/gf-sdk@0.38.18.js (SHA-256 21d84bc8…25ae, test/sdk.test.ts).
 * Guide: src_gfac_game_sdk docs/GAME-INTEGRATION.md §8 (missions) · §8.3 (item grants) · §8.9 (uxVersion 2, attendance).
 *
 * What 만지작 uses and what it leaves out:
 *  - 판 = one minute of actually playing with the toys (playClock.ts) → beginRound / setRoundActive / gameEnd. That drives
 *    오늘 3판 · 20판 · 5판마다, and the SDK's own play-time count drives 오늘 30분 플레이.
 *  - 7-day attendance: the SDK shows it by itself from the second day; the first day is recorded after the first 판
 *    (onboarding.tutorialComplete — 만지작 has no lesson, the first minute of play stands in for it).
 *  - Item rewards: 만지작 has no hearts or boosters. A heart grant (5판마다 +1, 30분 +10) becomes that many extra free picks
 *    (무료 만지기, gate.ts bonus) — the SDK's own labels still say 하트 (server text; see README).
 *  - Not used: leaderboard (no score; Toss forbids points on scores/ranks), SDK ads (rewarded ads stay in src/ads), lessons,
 *    result-screen hooks (no result screen).
 *
 * Off unless all of these hold: the Toss build (window.AppsInToss) and GF_CONFIG.promotionCode filled in after the server
 * registration (README "SDK 미션"). Off = every export here does nothing. Dev mock: `npm run dev` + `?gfmock=missions|attendance`.
 */
import { PlayClock } from './playClock';

/**
 * Server / Toss console values — one per line; empty = that feature is off.
 *  - gameId: the SDK/server game id (campaign registry GF_REWARD_CAMPAIGNS key, Worker secrets) — to be registered.
 *  - appName: Toss console app name (apps-in-toss.config.ts appName).
 *  - promotionCode: Toss console promotion code for the mission points. Empty = missions and attendance off.
 *  - analyticsDeploymentId: the game's deploymentId in the analytics Worker manifest. Empty = analytics off.
 */
export const GF_CONFIG = {
  gameId: 'manzizak',
  gameName: '만지작',
  appName: 'manzizak',
  promotionCode: '',
  analyticsDeploymentId: '',
  env: 'test' as 'test' | 'live',
} as const;

export const SDK_FILE = 'vendor/gf-sdk@0.38.18.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sdk = any;
const sdk = (): Sdk | null => (window as any).GfSDK ?? null;

export interface GfHost {
  /** credit `n` extra free picks (mission heart rewards); returns how many were credited */
  grantPicks(n: number): number;
  /** feedback sound for SDK window taps */
  click?(): void;
}

let on = false;
let host: GfHost = { grantPicks: () => 0 };
let covered = false;
const LESSON_KEY = 'mzk.gf.firstRound.v1';

const clock = new PlayClock({
  begin: () => call(() => sdk()?.reward?.beginRound?.()),
  active: (a) => {
    (window as any).__gfRoundActive = a;
    call(() => sdk()?.reward?.setRoundActive?.(a));
  },
  end: () => {
    call(() => sdk()?.reward?.gameEnd?.());
    firstRoundDone();
  },
});

function call(fn: () => unknown): void {
  if (!on) return;
  try { void Promise.resolve(fn()).catch(() => {}); } catch { /* the SDK never breaks the toy */ }
}

/** first 판 on this device: record it as the first visit's lesson, so the SDK starts the attendance board (day 1) */
function firstRoundDone(): void {
  try {
    if (localStorage.getItem(LESSON_KEY)) return;
    localStorage.setItem(LESSON_KEY, '1');
  } catch { return; }
  call(() => sdk()?.onboarding?.tutorialComplete?.());
}

function loadScript(): Promise<void> {
  if (sdk()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = import.meta.env.BASE_URL + SDK_FILE;
    s.onload = () => (sdk() ? resolve() : reject(new Error('GfSDK missing')));
    s.onerror = () => reject(new Error('GfSDK load failed'));
    document.head.append(s);
  });
}

const installSdkSkin = () => import('./skin').then((m) => m.installSdkSkin());

/** a grant the SDK hands over is credited once: idem → credited amount (last 60) */
const JOURNAL_KEY = 'mzk.gf.grants.v1';
function journal(): Record<string, number> {
  try { const v = JSON.parse(localStorage.getItem(JOURNAL_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function remember(idem: string, credited: number): void {
  const j = journal();
  j[idem] = credited;
  const keys = Object.keys(j);
  for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete j[k];
  try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(j)); } catch { /* the SDK's ack record still stops a repeat */ }
}
/** §8.3: heart → extra free picks, anything else (coins, boosters) → 0 (acked so the SDK does not send it again) */
async function deliver(g: { idem?: string; currency?: string; amount?: number }): Promise<boolean> {
  const g0 = sdk();
  if (!g?.idem || !g0) return false;
  if (typeof g0.promoHub?.ownsGrant === 'function' && !g0.promoHub.ownsGrant(g.idem)) return false;
  const done = journal()[g.idem];
  const credited = done ?? (String(g.currency) === 'heart' ? host.grantPicks(Math.max(0, Math.floor(Number(g.amount) || 0))) : 0);
  if (done === undefined) remember(g.idem, credited);
  try { g0.promoHub?.ackItem?.(g.idem, credited); } catch { /* noop */ }
  return true;
}

let view: Sdk = null;
function rewardView(g: Sdk): Sdk {
  view ??= g.reward.createView({
    gameId: GF_CONFIG.gameId,
    gameName: GF_CONFIG.gameName,
    platform: 'toss',
    badge: 'top-left',
    icons: () => (window as any).__gfRewardIcons || {},
    feedback: () => host.click?.(),
  });
  return view;
}

async function bootReal(): Promise<void> {
  await loadScript();
  await installSdkSkin();
  const g = sdk()!;
  const v = rewardView(g);
  (window as any).__gfRoundActive = false;
  on = true;
  g.init({
    gameId: GF_CONFIG.gameId,
    platform: 'toss',
    sessionMode: 'split',
    analytics: GF_CONFIG.analyticsDeploymentId ? { enabled: true, deploymentId: GF_CONFIG.analyticsDeploymentId } : { enabled: false },
    toss: { env: GF_CONFIG.env, loginTiming: 'explicit' },
    onboarding: { giftPoints: 5, boosters: false, firstGoal: { unit: 'round' } },
    reward: {
      promotionCode: GF_CONFIG.promotionCode,
      view: v,
      pause: (p: boolean) => cover('sdk', p),
      hub: { uxVersion: 2, econ: 5, autoOpen: false, badge: 'top-left', font: false, idle: () => !clock.isPlaying, items: { deliver }, welcome: false },
    },
  }).catch((e: unknown) => console.warn('[GfSDK] init', e));
  // 만지작 keeps everything on this device: nothing to restore from a server wallet (§3.3)
  g.on?.('game-session-ready', () => { try { g.markEconomyReady?.(g.getReadiness?.().identityEpoch ?? 0, 0); } catch { /* noop */ } });
}

/** Start once the first toy is on screen (the SDK must not compete with it). */
export function bootGfSdk(h: GfHost): void {
  host = h;
  setInterval(() => clock.tick(Date.now()), 1000);
  document.addEventListener('visibilitychange', () => cover('hidden', document.hidden));
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('gfmock')) {
    on = true;
    void import('./mock').then((m) => m.bootMock({ loadScript, installSdkSkin, rewardView })).catch((e) => console.warn('[GfSDK] mock', e));
    return;
  }
  if (import.meta.env.MODE !== 'toss' || !GF_CONFIG.promotionCode) return;
  void import('@apps-in-toss/web-framework').then((m) => {
    // the SDK reads the whole Apps in Toss framework from window (guide §3.1)
    (window as any).AppsInToss ??= { ...m };
    return bootReal();
  }).catch((e) => { on = false; console.warn('[GfSDK] boot failed', e); });
}

/** a touch / key on the toy */
export const gfToyInput = (): void => clock.input(Date.now());

const covers = new Set<string>();
/** something covers the toy (settings sheet, ad sheet, SDK window, hidden page): the 판 clock stops */
export function cover(by: string, isOn: boolean): void {
  if (isOn) covers.add(by); else covers.delete(by);
  const now = covers.size > 0;
  if (now === covered) return;
  covered = now;
  clock.cover(now, Date.now());
}
