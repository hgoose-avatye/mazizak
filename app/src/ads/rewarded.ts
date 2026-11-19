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
 * Testing in a browser: on the dev server it is on by default (`?ads=off` turns it off); `?ads=mock` shows a stand-in video ad (mockAd.ts: 15 s, 건너뛰기 after 5 s = no reward,
 * watched to the end = rewarded), `?ads=mock-fail` an ad that never loads (the toy then opens anyway).
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
    if (m === 'mock' || m === 'mock-fail') return m;
    // dev server opened by a person: the stand-in ad is on by default (`?ads=off` turns it off). Automated checks
    // (navigator.webdriver) keep it off unless they ask, so they can switch toys freely.
    return import.meta.env.DEV && m !== 'off' && !navigator.webdriver ? 'mock' : null;
  } catch {
    return null;
  }
})();

type Sdk = Pick<typeof import('@apps-in-toss/web-framework'), 'loadFullScreenAd' | 'showFullScreenAd'>;
let sdkPromise: Promise<Sdk | null> | null = null;
const getSdk = (): Promise<Sdk | null> => (sdkPromise ??= mockMode ? import('./mockAd').then((m) => m.mockSdk(mockMode), () => null) : import('@apps-in-toss/web-framework').then(
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
