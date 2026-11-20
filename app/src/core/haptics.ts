import { settings } from './settings';

/**
 * Haptics by intent, not by length. The kinds are Apps in Toss's haptic types (Device.triggerHaptic), so inside Toss every
 * touch has a real haptic on iPhone as well as Android (tossShell.ts installs the bridge). Outside Toss the Vibration API
 * stands in with a short buzz of about the same weight; iOS Safari has none (no-op there).
 */
export type HapticKind = 'tickWeak' | 'tap' | 'tickMedium' | 'softMedium' | 'basicWeak' | 'basicMedium' | 'success' | 'error' | 'wiggle' | 'confetti';

/** Vibration API stand-in (ms, or an on/off pattern) for each kind */
const BUZZ: Record<HapticKind, number | number[]> = {
  tickWeak: 6, tap: 9, tickMedium: 10, softMedium: 14, basicWeak: 10, basicMedium: 16,
  success: [12, 60, 18], error: [20, 50, 20], wiggle: [8, 40, 8, 40, 8], confetti: [10, 40, 10, 40, 16],
};
/** light ticks are rate-limited so fast rubbing does not become one long buzz; heavier kinds always play */
const LIGHT = new Set<HapticKind>(['tickWeak', 'tickMedium', 'basicWeak']);

const vibrationApi = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
let native: ((kind: HapticKind) => void) | null = null;
const listeners = new Set<() => void>();

/** true when this device can feel anything: the Toss bridge, or the Vibration API */
export const hapticsSupported = (): boolean => native !== null || vibrationApi;
/** tossShell.ts: route haptics to the host app (works on iOS) */
export function setNativeHaptics(fn: (kind: HapticKind) => void): void {
  native = fn;
  for (const l of listeners) l();
}
export function onHapticsSupportChange(fn: () => void): void { listeners.add(fn); }

let last = 0;
export function haptic(kind: HapticKind): void {
  if (!settings.get().haptics) return;
  const now = performance.now();
  if (LIGHT.has(kind) && now - last < 35) return;
  last = now;
  if (native) { try { native(kind); } catch { /* ignore */ } return; }
  if (!vibrationApi) return;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua && !ua.hasBeenActive) return;
  try { navigator.vibrate(BUZZ[kind]); } catch { /* ignore */ }
}
