/**
 * Rewarded ad for opening a locked toy (Apps in Toss full-screen ad API, @apps-in-toss/web-framework).
 *
 * Follows toss/apps-in-toss-examples · in-app-ads:
 * - load ahead (`loadFullScreenAd`), show only after `loaded` and only when the user pressed "광고 보고 열기";
 * - one load at a time per ad group; after `dismissed` load the next one;
 * - the reward is `userEarnedReward` only — never `clicked` or `dismissed`.
 *
 * The SDK is imported on first use, so the app's first screen does not carry it. Outside the Toss app (a plain browser,
 * the sandbox app) `isSupported()` is false and the gate is off: every toy opens.
 *
 * Testing in a browser: `?ads=mock` shows a stand-in ad (3 s, then 닫기 = rewarded; closing early = no reward),
 * `?ads=mock-fail` an ad that never loads (the toy then opens anyway).
 *
 * Ad group id: VITE_AIT_REWARDED_AD_ID at build time; the default is Toss's test id, which must not ship (see README).
 */

export type AdResult = 'earned' | 'closed' | 'unavailable';

const TEST_REWARDED_ID = 'ait-ad-test-rewarded-id';
const AD_GROUP_ID = (import.meta.env as Record<string, string | undefined>).VITE_AIT_REWARDED_AD_ID || TEST_REWARDED_ID;
export const usingTestAdId = AD_GROUP_ID === TEST_REWARDED_ID;

const mockMode = (() => {
  try {
    const m = new URLSearchParams(location.search).get('ads');
    return m === 'mock' || m === 'mock-fail' ? m : null;
  } catch {
    return null;
  }
})();

type Sdk = Pick<typeof import('@apps-in-toss/web-framework'), 'loadFullScreenAd' | 'showFullScreenAd'>;
let sdkPromise: Promise<Sdk | null> | null = null;
const getSdk = (): Promise<Sdk | null> => (sdkPromise ??= mockMode ? Promise.resolve(mockSdk(mockMode)) : import('@apps-in-toss/web-framework').then(
  (m) => {
    // outside the Toss app isSupported() throws (no native bridge) instead of returning false
    try { return m.loadFullScreenAd.isSupported() && m.showFullScreenAd.isSupported() ? m : null; } catch { return null; }
  },
  () => null,
));

/** Whether ads can be shown here (Toss app, or a mock). Until this resolves the gate stays off. */
export const adsSupported = (): Promise<boolean> => getSdk().then((s) => !!s);

let loaded = false;
let loading: Promise<boolean> | null = null;

/** Fetch the next ad in the background (no-op when one is loaded or loading). Resolves true once one is ready. */
export function preloadAd(): Promise<boolean> {
  if (loaded) return Promise.resolve(true);
  return (loading ??= getSdk().then((sdk) => new Promise<boolean>((resolve) => {
    if (!sdk) return resolve(false);
    try {
      sdk.loadFullScreenAd({
        options: { adGroupId: AD_GROUP_ID },
        onEvent: (e) => { if (e.type === 'loaded') { loaded = true; resolve(true); } },
        onError: () => resolve(false),
      });
    } catch {
      resolve(false);
    }
  })).finally(() => { loading = null; }));
}

let showing: Promise<AdResult> | null = null;
/**
 * Show the rewarded ad (call only from the user's tap). Waits up to `waitMs` for an ad that is still loading;
 * 'unavailable' when there is none (no fill, offline, not supported) — the caller then opens the toy anyway.
 */
export function showRewardedAd(waitMs = 3000): Promise<AdResult> {
  return (showing ??= (async (): Promise<AdResult> => {
    const sdk = await getSdk();
    if (!sdk) return 'unavailable';
    if (!loaded && !(await Promise.race([preloadAd(), new Promise<boolean>((r) => setTimeout(() => r(false), waitMs))]))) return 'unavailable';
    loaded = false; // this ad is used up whatever happens next
    const result = await new Promise<AdResult>((resolve) => {
      let earned = false;
      try {
        sdk.showFullScreenAd({
          options: { adGroupId: AD_GROUP_ID },
          onEvent: (e) => {
            if (e.type === 'userEarnedReward') earned = true;
            else if (e.type === 'dismissed') resolve(earned ? 'earned' : 'closed');
            else if (e.type === 'failedToShow') resolve('unavailable');
          },
          onError: () => resolve('unavailable'),
        });
      } catch {
        resolve('unavailable');
      }
    });
    void preloadAd();
    return result;
  })().finally(() => { showing = null; }));
}

/** Browser stand-in with the SDK's event order (loaded → show → impression → userEarnedReward → dismissed). */
function mockSdk(mode: 'mock' | 'mock-fail'): Sdk {
  const loadFullScreenAd = Object.assign(
    ((p) => {
      const t = setTimeout(() => (mode === 'mock' ? p.onEvent({ type: 'loaded' }) : p.onError(new Error('No fill'))), 300);
      return () => clearTimeout(t);
    }) as Sdk['loadFullScreenAd'],
    { isSupported: () => true },
  );
  const showFullScreenAd = Object.assign(
    ((p) => {
      const el = document.createElement('div');
      el.className = 'mock-ad';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', '테스트 광고');
      el.innerHTML = '<span class="mock-ad-label">Ad · 테스트 광고</span><p class="mock-ad-count"></p><button type="button" class="mock-ad-close">닫기</button>';
      document.body.append(el);
      p.onEvent({ type: 'requested' });
      p.onEvent({ type: 'show' });
      p.onEvent({ type: 'impression' });
      let left = 3;
      const count = el.querySelector<HTMLElement>('.mock-ad-count')!;
      const tick = () => { count.textContent = left > 0 ? `${left}초 뒤 보상` : '보상 받음 · 닫아도 돼요'; };
      tick();
      const timer = setInterval(() => { left--; tick(); if (left === 0) { clearInterval(timer); p.onEvent({ type: 'userEarnedReward', data: { unitType: 'toy', unitAmount: 1 } }); } }, 1000);
      el.querySelector('button')!.onclick = () => { clearInterval(timer); el.remove(); p.onEvent({ type: 'dismissed' }); };
      return () => { clearInterval(timer); el.remove(); };
    }) as Sdk['showFullScreenAd'],
    { isSupported: () => true },
  );
  return { loadFullScreenAd, showFullScreenAd };
}
