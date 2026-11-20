/**
 * Apps in Toss shell (Toss build only: `vite build --mode toss`, main.ts imports this when MODE is 'toss').
 *
 * - Status bar: `SafeArea.get().top` → `--ait-top` on the root, kept current with `SafeArea.subscribe`. style.css adds the
 *   62px band for Toss's floating capsule (⋯ ✕) on top: `--safe-t = max(env(safe-area-inset-top), --ait-top) + --ait-band`.
 *   (The browser's env() is often 0 inside the Toss web view, so the SDK's value is the one that counts.)
 * - Android back: `graniteEvent` backEvent → `onBack()` closes an open sheet first; otherwise the mini app closes (closeView),
 *   as the launch checklist asks ("뒤로가기: 이전 화면 또는 미니앱 종료").
 *
 * Same checks as the shared GfSDK (gfac-puzzle-game, pimple-asmr): a missing bridge, or a top inset that is not a number in
 * 0..200, leaves the CSS fallback (env()) alone.
 */
export async function installTossShell(onBack: () => boolean): Promise<void> {
  let sdk: typeof import('@apps-in-toss/web-framework');
  try { sdk = await import('@apps-in-toss/web-framework'); } catch { return; }

  const root = document.documentElement.style;
  const setTop = (top: unknown) => {
    if (typeof top !== 'number' || !Number.isFinite(top) || top < 0 || top > 200) return;
    root.setProperty('--ait-top', `${Math.round(top)}px`);
  };
  try { setTop(sdk.SafeArea.get()?.top); } catch { /* no bridge (browser, sandbox) */ }
  try { sdk.SafeArea.subscribe({ onEvent: (i) => setTop(i?.top) }); } catch { /* older host: the first value stays */ }

  // haptics through the host app: real haptics on iPhone too (the Vibration API does nothing in the iOS web view)
  try {
    const trigger = sdk.Device?.triggerHaptic ?? sdk.generateHapticFeedback;
    if (typeof trigger === 'function') {
      const { setNativeHaptics } = await import('./haptics');
      setNativeHaptics((type) => { void trigger({ type }).catch(() => {}); });
    }
  } catch { /* no bridge: the Vibration API stays */ }

  try {
    sdk.graniteEvent.addEventListener('backEvent', {
      onEvent: () => { if (!onBack()) void sdk.closeView().catch(() => {}); },
      onError: () => {},
    });
  } catch { /* no bridge: the host's own back handling stays */ }
}
