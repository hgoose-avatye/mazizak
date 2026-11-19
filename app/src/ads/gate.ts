/**
 * Which toy choices are free and which need an ad (owner, 2026-11-19, revised the same day).
 *
 * A "kind" is one card of the dock: a fidget (`S01`) or a keyboard preset (`kb:pebble`).
 * - The toy the app opens on (슬랑이 or the last keyboard preset) is free and does not count.
 * - After that, every pick of a different kind uses one of today's `freePerDay` free picks — going back to a kind
 *   already seen counts too. The count starts over each day.
 * - With the free picks used up, a pick needs a rewarded ad. The ad opens that kind for this visit and `unlockSwitches`
 *   more switches (0: leaving it locks it again).
 * - The kind on screen is always open (a re-tap, a relaunch on it, a resize never costs anything).
 *
 * Pure functions over a small JSON state, so the rules are unit-tested (test/adGate.test.ts) and the state survives reloads.
 */

export interface GateConfig {
  freePerDay: number;
  /** how many switches an ad-opened kind stays open after the user leaves it (0 = this visit only) */
  unlockSwitches: number;
}

export const GATE_CONFIG: GateConfig = { freePerDay: 3, unlockSwitches: 0 };

export interface GateState {
  /** local calendar day (YYYY-MM-DD) the count belongs to */
  day: string;
  /** free picks used today */
  used: number;
  /** ad-opened kinds: the last switch number at which each is still open */
  unlocks: Record<string, number>;
  /** switches made today (each change of kind is one) */
  switches: number;
  /** the kind on screen ('' before the first one of the day) */
  current: string;
}

export const localDay = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const freshState = (day: string): GateState => ({ day, used: 0, unlocks: {}, switches: 0, current: '' });

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** A stored state from storage (possibly old, broken or hand-edited) for `day`: another day starts over. */
export function normalize(raw: unknown, day: string): GateState {
  const s = raw as Partial<GateState> | null;
  if (!s || typeof s !== 'object' || s.day !== day) return freshState(day);
  const unlocks: Record<string, number> = {};
  if (s.unlocks && typeof s.unlocks === 'object')
    for (const [k, v] of Object.entries(s.unlocks)) if (typeof v === 'number' && Number.isFinite(v)) unlocks[k] = v;
  return { day, used: count(s.used), unlocks, switches: count(s.switches), current: typeof s.current === 'string' ? s.current : '' };
}

export type Access =
  /** open now: on screen, or opened by an ad that has not run out */
  | 'open'
  /** opening it uses one of today's free picks */
  | 'free'
  /** needs an ad */
  | 'locked';

const unlocked = (s: GateState, key: string) => (s.unlocks[key] ?? -1) >= s.switches + 1;

export function access(s: GateState, key: string, cfg: GateConfig = GATE_CONFIG): Access {
  if (key === s.current || unlocked(s, key)) return 'open';
  return s.used < cfg.freePerDay ? 'free' : 'locked';
}

/**
 * The user is now on `key` (call after access() allowed it). `launch`: the toy the app opened on — never counted.
 * Returns the new state and whether this pick used a free pick.
 */
export function enter(s: GateState, key: string, opts: { launch?: boolean } = {}, cfg: GateConfig = GATE_CONFIG): { state: GateState; usedFree: boolean } {
  if (key === s.current) return { state: s, usedFree: false };
  const usedFree = !opts.launch && !unlocked(s, key) && s.used < cfg.freePerDay;
  return { state: { ...s, current: key, switches: s.switches + 1, used: s.used + (usedFree ? 1 : 0) }, usedFree };
}

/** A rewarded ad was watched to the end for `key`: open it for the coming switch onto it (+ cfg.unlockSwitches more). */
export function grant(s: GateState, key: string, cfg: GateConfig = GATE_CONFIG): GateState {
  return { ...s, unlocks: { ...s.unlocks, [key]: s.switches + 1 + cfg.unlockSwitches } };
}

/** Free picks left today. */
export const freeLeft = (s: GateState, cfg: GateConfig = GATE_CONFIG): number => Math.max(0, cfg.freePerDay - s.used);
