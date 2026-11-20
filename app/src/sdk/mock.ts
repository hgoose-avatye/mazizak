/**
 * Dev-only SDK mock (`npm run dev` + `?gfmock=missions|attendance`, colorpop's src/sdk/mock.ts trimmed to missions): nothing
 * goes to a server — every cross-origin fetch / beacon is blocked — and the reward window is fed a made-up state shaped like
 * the server's econ5 answer (5판마다 · 20판 · 오늘 3판 · 30분, attendance rewards_e5). For checking the skin and the layout
 * before the server registration exists. Not in builds (gf.ts imports it behind import.meta.env.DEV).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { GF_CONFIG } from './gf';

interface Deps {
  loadScript(): Promise<void>;
  installSdkSkin(): Promise<void>;
  rewardView(g: any): any;
}

function blockNetwork(): void {
  const w = window as any;
  if (w.__gfMockNet) return;
  w.__gfMockNet = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.origin === location.origin) return realFetch(input, init);
    return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'gfmock_offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
  };
  if (navigator.sendBeacon) navigator.sendBeacon = () => true;
}

const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

function missionsView() {
  const today = kstToday();
  const days = [1, 1, 1, 2, 2, 2, 15].map((b, i) => ({
    dayIndex: i + 1, dateKst: null, baseAmount: b, multiplier: 1, amount: b, rewards: [{ currency: 'toss_point', amount: b }], items: [],
    state: i === 0 ? 'claimed' : i === 1 ? 'ready' : 'locked',
  }));
  const rows = [
    { key: 'play_every5', title: '5판마다 자동 지급', reward: '+1P + 하트 1개', rewardAmount: 1, current: 3, target: 5, state: 'progress', kind: 'point', achieved: false, repeat: true },
    { key: 'play_3', title: '오늘 3판 플레이', reward: '+3P', rewardAmount: 3, current: 3, target: 3, state: 'ready', kind: 'point', achieved: true, selection: { missionType: 'play_3', milestone: 0, dayKst: today, amount: 3 } },
    { key: 'play_20:2', title: '20판 플레이 (22시 초기화)', reward: '+10P', rewardAmount: 10, current: 8, target: 20, state: 'progress', kind: 'point', achieved: false },
    { key: 'play_30m', title: '오늘 30분 플레이', reward: '하트 10개', rewardAmount: 10, current: 12, target: 30, state: 'progress', kind: 'item', achieved: false },
  ];
  return {
    kind: 'missions', owner: 'gfmock', signedIn: true, busy: false, message: '', rows,
    state: {
      ok: true, uxVersion: 2, enabled: true, dayKst: today, econ: { version: 5 }, eligible: [],
      attendance: { programId: 'mock', platform: 'toss', dayKst: today, startDay: today, dayIndex: 2, claimable: true, notificationSince: null, days },
    },
  };
}

export async function bootMock(d: Deps): Promise<void> {
  blockNetwork();
  await d.loadScript();
  await d.installSdkSkin();
  const g = (window as any).GfSDK;
  void Promise.resolve(g.init({ gameId: GF_CONFIG.gameId, platform: 'toss', toss: { env: 'test' } })).catch(() => {});
  const view = d.rewardView(g);
  const close = () => view.close();
  const onAction = (a: string) => (a === 'close' || a === 'play') && close();
  const openMissions = () => view.open(missionsView(), onAction, close);
  const openAttendance = () => view.open({ ...missionsView(), kind: 'attendance' }, onAction, close);
  view.connect(openMissions);
  view.sync(missionsView());
  (window as any).__gfMock = { openMissions, openAttendance };
  const show = new URLSearchParams(location.search).get('gfmock');
  if (show === 'missions') openMissions();
  else if (show === 'attendance') openAttendance();
}
