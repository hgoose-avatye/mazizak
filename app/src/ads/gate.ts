/**
 * Which toy choices are free and which need an ad (owner, 2026-11-19, revised the same day).
 *
 * A "kind" is one card of the dock: a fidget (`S01`) or a keyboard preset (`kb:pebble`).
 * - The toy the app opens on (슬랑이 or the last keyboard preset) is free and does not count.
 * - After that, every pick of a different kind uses one of today's `freePerDay` free picks of its group — 말랑이 and
 *   키보드 are counted apart (3 each). Going back to a kind already seen counts too. The counts start over each day.
 * - With the free picks used up, a pick needs a rewarded ad. The ad opens that kind for this visit and `unlockSwitches`
 *   more switches (0: leaving it locks it again).
 * - The kind on screen is always open (a re-tap, a relaunch on it, a resize never costs anything).
 *
 * Pure functions over a small JSON state, so the rules are unit-tested (test/adGate.test.ts) and the state survives reloads.
 */

import { findFidget } from '../toys/fidgets/catalog';

export interface GateConfig {
  freePerDay: number;
  /** how many switches an ad-opened kind stays open after the user leaves it (0 = this visit only) */
  unlockSwitches: number;
  /** "광고 보고 만지기" opens at once without showing an ad — counted as watched (owner, 2026-11-20). false = the real rewarded ad */
  pretendAds: boolean;
}

export const GATE_CONFIG: GateConfig = { freePerDay: 3, unlockSwitches: 0, pretendAds: true };

/** 말랑이 (fidgets) and 키보드 (presets) each have their own free picks */
/** 말랑이 (fidgets), 키보드 (presets) and 뭉개기 (the squash toys, ids M…) each have their own free picks */
export type Group = 'fidget' | 'keyboard' | 'squash';
// (a toy's group is its catalog tab: 마시멜로 is M04 but a 말랑이, 치즈 is L01 but a 뭉개기)
export const groupOf = (key: string): Group => (key.startsWith('kb:') ? 'keyboard' : findFidget(key)?.category === '뭉개기' ? 'squash' : 'fidget');

export interface GateState {
  /** the free-pick window the counts belong to (resetPeriod(): `YYYY-MM-DD#1..3`) */
  day: string;
  /** free picks used today, per group */
  used: Record<Group, number>;
  /** ad-opened kinds: the last switch number at which each is still open */
  unlocks: Record<string, number>;
  /** switches made today (each change of kind is one) */
  switches: number;
  /** the kind on screen ('' before the first one of the day) */
  current: string;
  /** extra free picks from SDK mission rewards (hearts → 무료 만지기, gf.ts deliver), either group; used after the window's
   *  own free picks and kept across windows. Absent = 0 */
  bonus?: number;
}

/** add mission-reward picks (never below 0) */
export const addBonus = (s: GateState, n: number): GateState => ({ ...s, bonus: Math.max(0, (s.bonus ?? 0) + Math.floor(n)) });
const withBonus = (s: GateState, bonus: number): GateState => (bonus > 0 ? { ...s, bonus } : s);

export const localDay = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Free picks start over three times a day, at 06:00 · 14:00 · 22:00 KST — the same windows as the SDK's 20판 mission.
 * A window belongs to the day that starts at 06:00 (22:00–06:00 is that day's third window).
 */
export const RESET_HOURS_KST = [6, 14, 22] as const;
const KST_MS = 9 * 3600_000;

/** The free-pick window `d` falls in, as a storage key: `YYYY-MM-DD#1..3` (KST, the day starting 06:00). */
export function resetPeriod(d = new Date()): string {
  const k = new Date(d.getTime() + KST_MS); // read the UTC fields as KST
  const h = k.getUTCHours();
  const w = h >= 22 || h < 6 ? 3 : h >= 14 ? 2 : 1;
  if (h < 6) k.setUTCDate(k.getUTCDate() - 1); // 00–06 is still the previous day's third window
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}#${w}`;
}

/** When the next window starts (the next 06/14/22 KST after `d`). */
export function nextReset(d = new Date()): Date {
  const k = new Date(d.getTime() + KST_MS);
  const h = k.getUTCHours();
  const next = RESET_HOURS_KST.find((r) => r > h);
  k.setUTCHours(next ?? RESET_HOURS_KST[0] + 24, 0, 0, 0);
  return new Date(k.getTime() - KST_MS);
}

/** A KST reset hour in words for the notices: 오전 6시 · 오후 2시 · 밤 10시. */
export function resetLabel(at: Date): string {
  const h = new Date(at.getTime() + KST_MS).getUTCHours();
  return h === 6 ? '오전 6시' : h === 14 ? '오후 2시' : h === 22 ? '밤 10시' : `${h}시`;
}

export const freshState = (day: string): GateState => ({ day, used: { fidget: 0, keyboard: 0, squash: 0 }, unlocks: {}, switches: 0, current: '' });

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** A stored state from storage (possibly old, broken or hand-edited) for `day`: another day starts over. */
export function normalize(raw: unknown, day: string): GateState {
  const s = raw as Partial<GateState> | null;
  if (!s || typeof s !== 'object') return freshState(day);
  if (s.day !== day) return withBonus(freshState(day), count(s.bonus)); // a new window: counts start over, reward picks stay
  const unlocks: Record<string, number> = {};
  if (s.unlocks && typeof s.unlocks === 'object')
    for (const [k, v] of Object.entries(s.unlocks)) if (typeof v === 'number' && Number.isFinite(v)) unlocks[k] = v;
  const used = (s.used && typeof s.used === 'object' ? s.used : {}) as Partial<Record<Group, unknown>>; // (an older single count is dropped)
  return withBonus({ day, used: { fidget: count(used.fidget), keyboard: count(used.keyboard), squash: count(used.squash) }, unlocks, switches: count(s.switches), current: typeof s.current === 'string' ? s.current : '' }, count(s.bonus));
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
  return s.used[groupOf(key)] < cfg.freePerDay || (s.bonus ?? 0) > 0 ? 'free' : 'locked';
}

/**
 * The user is now on `key` (call after access() allowed it). `launch`: the toy the app opened on — never counted.
 * Returns the new state and whether this pick used a free pick.
 */
export function enter(s: GateState, key: string, opts: { launch?: boolean } = {}, cfg: GateConfig = GATE_CONFIG): { state: GateState; usedFree: boolean } {
  if (key === s.current) return { state: s, usedFree: false };
  const group = groupOf(key);
  const counted = !opts.launch && !unlocked(s, key);
  const usedFree = counted && s.used[group] < cfg.freePerDay;
  const usedBonus = counted && !usedFree && (s.bonus ?? 0) > 0;
  const used = usedFree ? { ...s.used, [group]: s.used[group] + 1 } : s.used;
  const next: GateState = { ...s, current: key, switches: s.switches + 1, used };
  if (usedBonus) next.bonus = (s.bonus ?? 0) - 1;
  return { state: next, usedFree: usedFree || usedBonus };
}

/** A rewarded ad was watched to the end for `key`: open it for the coming switch onto it (+ cfg.unlockSwitches more). */
export function grant(s: GateState, key: string, cfg: GateConfig = GATE_CONFIG): GateState {
  return { ...s, unlocks: { ...s.unlocks, [key]: s.switches + 1 + cfg.unlockSwitches } };
}

/** Free picks left today in a group. */
export const freeLeft = (s: GateState, group: Group, cfg: GateConfig = GATE_CONFIG): number => Math.max(0, cfg.freePerDay - s.used[group]);
/** Reward picks left (either group). */
export const bonusLeft = (s: GateState): number => s.bonus ?? 0;
