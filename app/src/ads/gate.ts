/**
 * Which toys can be opened without an ad (owner, 2026-11-19).
 *
 * A "kind" is one card of the dock: a fidget (`S01`) or a keyboard preset (`kb:pebble`).
 * - The first `freePerDay` kinds opened on a day are free for the rest of that day, however often the user goes back to them.
 * - Any other kind needs a rewarded ad. The ad opens it for this visit and `unlockSwitches` more switches
 *   (0: switching away locks it again — the owner's choice to start with; raise it to be more generous).
 * - The kind on screen is always open (a relaunch on it, a resize, a re-tap never asks for an ad).
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
  /** local calendar day (YYYY-MM-DD) the counts belong to */
  day: string;
  /** free kinds chosen today, in order */
  free: string[];
  /** ad-opened kinds: the last switch number at which each is still open */
  unlocks: Record<string, number>;
  /** switches made today (each change of kind is one) */
  switches: number;
  /** the kind on screen ('' before the first one of the day) */
  current: string;
}

export const localDay = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const freshState = (day: string): GateState => ({ day, free: [], unlocks: {}, switches: 0, current: '' });

/** A stored state from storage (possibly old, broken or hand-edited) for `day`: another day starts over. */
export function normalize(raw: unknown, day: string): GateState {
  const s = raw as Partial<GateState> | null;
  if (!s || typeof s !== 'object' || s.day !== day) return freshState(day);
  const free = Array.isArray(s.free) ? s.free.filter((k): k is string => typeof k === 'string') : [];
  const unlocks: Record<string, number> = {};
  if (s.unlocks && typeof s.unlocks === 'object')
    for (const [k, v] of Object.entries(s.unlocks)) if (typeof v === 'number' && Number.isFinite(v)) unlocks[k] = v;
  const switches = typeof s.switches === 'number' && Number.isFinite(s.switches) && s.switches >= 0 ? s.switches : 0;
  return { day, free, unlocks, switches, current: typeof s.current === 'string' ? s.current : '' };
}

export type Access =
  /** open now: on screen, one of today's free kinds, or opened by an ad that has not run out */
  | 'open'
  /** opening it takes one of today's free slots */
  | 'free-slot'
  /** needs an ad */
  | 'locked';

export function access(s: GateState, key: string, cfg: GateConfig = GATE_CONFIG): Access {
  if (key === s.current || s.free.includes(key)) return 'open';
  if ((s.unlocks[key] ?? -1) >= s.switches + 1) return 'open';
  return s.free.length < cfg.freePerDay ? 'free-slot' : 'locked';
}

/** The user is now on `key` (call after access() allowed it). Takes a free slot when it needs one. */
export function enter(s: GateState, key: string, cfg: GateConfig = GATE_CONFIG): GateState {
  if (key === s.current) return s;
  const takesSlot = !s.free.includes(key) && !((s.unlocks[key] ?? -1) >= s.switches + 1) && s.free.length < cfg.freePerDay;
  return { ...s, current: key, switches: s.switches + 1, free: takesSlot ? [...s.free, key] : s.free };
}

/** A rewarded ad was watched to the end for `key`: open it for the coming switch onto it (+ cfg.unlockSwitches more). */
export function grant(s: GateState, key: string, cfg: GateConfig = GATE_CONFIG): GateState {
  return { ...s, unlocks: { ...s.unlocks, [key]: s.switches + 1 + cfg.unlockSwitches } };
}

/** Free slots left today. */
export const freeLeft = (s: GateState, cfg: GateConfig = GATE_CONFIG): number => Math.max(0, cfg.freePerDay - s.free.length);
