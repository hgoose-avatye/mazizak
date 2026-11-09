import { settings } from './settings';

/** Vibration API: supported on Android Chrome; not supported on iOS Safari (no-op there). */
export const hapticsSupported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let last = 0;
export function haptic(ms: number): void {
  if (!hapticsSupported || !settings.get().haptics) return;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua && !ua.hasBeenActive) return;
  const now = performance.now();
  if (now - last < 35) return; // avoid buzzing on rapid input
  last = now;
  try {
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
