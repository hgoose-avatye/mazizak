import { describe, expect, it } from 'vitest';
import { access, addBonus, bonusLeft, enter, freeLeft, freshState, grant, localDay, nextReset, normalize, resetLabel, resetPeriod, type GateConfig, type GateState } from '../src/ads/gate';

const cfg: GateConfig = { freePerDay: 3, unlockSwitches: 0, pretendAds: false };
const go = (s: GateState, k: string, launch = false) => enter(s, k, { launch }, cfg).state;
/** launch on the first key, then pick the rest */
const walk = (keys: string[]) => keys.slice(1).reduce((s, k) => go(s, k), go(freshState('2026-11-19'), keys[0], true));

describe('ad gate', () => {
  it('the launch toy is free and not counted', () => {
    const s = walk(['S01']);
    expect(s.used).toEqual({ fidget: 0, keyboard: 0, squash: 0 });
    expect(freeLeft(s, 'fidget', cfg)).toBe(3);
    expect(enter(freshState('d'), 'S01', { launch: true }, cfg).usedFree).toBe(false);
  });

  it('every pick of a different kind uses one free pick, going back included', () => {
    let s = walk(['S01', 'S02']);
    expect(freeLeft(s, 'fidget', cfg)).toBe(2);
    expect(enter(s, 'S01', {}, cfg).usedFree).toBe(true); // back to the launch toy counts
    s = walk(['S01', 'S02', 'S01', 'S02']);
    expect(s.used.fidget).toBe(3);
    expect(freeLeft(s, 'fidget', cfg)).toBe(0);
  });

  it('말랑이 and 키보드 have 3 free picks each', () => {
    let s = walk(['S01', 'S02', 'S03', 'W01']); // 말랑이 used up
    expect(access(s, 'L02', cfg)).toBe('locked');
    expect(access(s, 'kb:pebble', cfg)).toBe('free');
    s = walk(['S01', 'S02', 'S03', 'W01', 'kb:pebble', 'kb:clack']);
    expect(s.used).toEqual({ fidget: 3, keyboard: 2, squash: 0 });
    expect(freeLeft(s, 'keyboard', cfg)).toBe(1);
    expect(access(s, 'kb:topre', cfg)).toBe('free');
    expect(access(s, 'L02', cfg)).toBe('locked');
    s = go(s, 'kb:topre');
    expect(access(s, 'kb:pebble', cfg)).toBe('locked');
  });

  it('a keyboard launch is not counted either', () => {
    const s = walk(['kb:pebble', 'kb:clack']);
    expect(s.used).toEqual({ fidget: 0, keyboard: 1, squash: 0 });
  });

  it('re-tapping the toy on screen costs nothing', () => {
    const s = walk(['S01', 'S02']);
    const r = enter(s, 'S02', {}, cfg);
    expect(r.usedFree).toBe(false);
    expect(r.state).toBe(s);
    expect(access(s, 'S02', cfg)).toBe('open');
  });

  it('after three picks every other kind needs an ad, earlier picks included', () => {
    const s = walk(['S01', 'S02', 'S03', 'W01']);
    expect(access(s, 'W02', cfg)).toBe('locked');
    expect(access(s, 'S01', cfg)).toBe('locked');
    expect(access(s, 'W01', cfg)).toBe('open'); // on screen
    expect(access(walk(['S01']), 'W02', cfg)).toBe('free');
  });

  it('an ad opens a kind for this visit only and uses no free pick', () => {
    let s = walk(['S01', 'S02', 'S03', 'W01']);
    s = grant(s, 'L02', cfg);
    expect(access(s, 'L02', cfg)).toBe('open');
    const r = enter(s, 'L02', {}, cfg);
    expect(r.usedFree).toBe(false);
    s = r.state;
    expect(s.used.fidget).toBe(3);
    s = grant(s, 'S01', cfg);
    s = go(s, 'S01');
    expect(access(s, 'L02', cfg)).toBe('locked'); // left it: the next visit is another ad
  });

  it('a granted kind the user did not go to expires with the next switch', () => {
    let s = walk(['S01', 'S02', 'S03', 'W01']);
    s = grant(s, 'L02', cfg);
    s = grant(s, 'S01', cfg);
    s = go(s, 'S01');
    expect(access(s, 'L02', cfg)).toBe('locked');
  });

  it('unlockSwitches keeps an ad-opened kind for that many more switches', () => {
    const c2: GateConfig = { freePerDay: 0, unlockSwitches: 2, pretendAds: false };
    let s = enter(freshState('d'), 'S01', { launch: true }, c2).state;
    s = enter(grant(s, 'S04', c2), 'S04', {}, c2).state;
    s = enter(grant(s, 'S01', c2), 'S01', {}, c2).state;
    expect(access(s, 'S04', c2)).toBe('open'); // 1 switch away
    s = enter(grant(s, 'S02', c2), 'S02', {}, c2).state;
    expect(access(s, 'S04', c2)).toBe('locked'); // returning would be the 3rd switch
  });

  it('a new day starts over; broken stored state is ignored', () => {
    const s = walk(['S01', 'S02', 'S03']);
    expect(normalize(JSON.parse(JSON.stringify(s)), '2026-11-19')).toEqual(s);
    expect(normalize(s, '2026-11-20')).toEqual(freshState('2026-11-20'));
    expect(normalize(null, 'd')).toEqual(freshState('d'));
    expect(normalize('x', 'd')).toEqual(freshState('d'));
    expect(normalize({ day: 'd', used: 2, unlocks: { a: 'x', b: 3 }, switches: 1.7, current: 7 }, 'd')) // older single count
      .toEqual({ day: 'd', used: { fidget: 0, keyboard: 0, squash: 0 }, unlocks: { b: 3 }, switches: 1, current: '' });
    expect(normalize({ day: 'd', used: { fidget: 2, keyboard: -1 } }, 'd').used).toEqual({ fidget: 2, keyboard: 0, squash: 0 });
  });

  it('local day is YYYY-MM-DD', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  // KST = UTC+9: 06/14/22 KST = 21/05/13 UTC
  it('free picks start over at 06 · 14 · 22 KST', () => {
    const at = (iso: string) => new Date(iso);
    expect(resetPeriod(at('2026-11-20T06:00:00+09:00'))).toBe('2026-11-20#1');
    expect(resetPeriod(at('2026-11-20T13:59:59+09:00'))).toBe('2026-11-20#1');
    expect(resetPeriod(at('2026-11-20T14:00:00+09:00'))).toBe('2026-11-20#2');
    expect(resetPeriod(at('2026-11-20T22:00:00+09:00'))).toBe('2026-11-20#3');
    expect(resetPeriod(at('2026-11-21T05:59:59+09:00'))).toBe('2026-11-20#3'); // after midnight: still the 22–06 window
    expect(resetPeriod(at('2026-11-21T06:00:00+09:00'))).toBe('2026-11-21#1');
    expect(resetPeriod(at('2026-12-31T23:00:00+09:00'))).toBe('2026-12-31#3');
    expect(resetPeriod(at('2027-01-01T03:00:00+09:00'))).toBe('2026-12-31#3');
  });

  it('the next reset and its label', () => {
    const next = (iso: string) => nextReset(new Date(iso)).toISOString();
    expect(next('2026-11-20T09:30:00+09:00')).toBe(new Date('2026-11-20T14:00:00+09:00').toISOString());
    expect(next('2026-11-20T14:00:00+09:00')).toBe(new Date('2026-11-20T22:00:00+09:00').toISOString());
    expect(next('2026-11-20T23:10:00+09:00')).toBe(new Date('2026-11-21T06:00:00+09:00').toISOString());
    expect(next('2026-11-21T02:00:00+09:00')).toBe(new Date('2026-11-21T06:00:00+09:00').toISOString());
    expect(resetLabel(new Date('2026-11-20T14:00:00+09:00'))).toBe('오후 2시');
    expect(resetLabel(new Date('2026-11-20T22:00:00+09:00'))).toBe('밤 10시');
    expect(resetLabel(new Date('2026-11-21T06:00:00+09:00'))).toBe('오전 6시');
  });

  it('a stored state from the previous window starts over', () => {
    expect(normalize({ day: '2026-11-20#1', used: { fidget: 3, keyboard: 3, squash: 0 } }, '2026-11-20#2')).toEqual(freshState('2026-11-20#2'));
  });

  it('mission-reward picks open a kind after the free picks and stay across windows', () => {
    let s = walk(['S01', 'S02', 'S03', 'W01']); // 말랑이 free picks used up
    expect(access(s, 'W02', cfg)).toBe('locked');
    s = addBonus(s, 2);
    expect(access(s, 'W02', cfg)).toBe('free');
    const r = enter(s, 'W02', {}, cfg);
    expect(r.usedFree).toBe(true);
    expect(bonusLeft(r.state)).toBe(1);
    expect(r.state.used.fidget).toBe(3);
    // the window's own free picks go first
    const k = enter(addBonus(walk(['S01']), 1), 'kb:pebble', {}, cfg).state;
    expect(k.used.keyboard).toBe(1);
    expect(bonusLeft(k)).toBe(1);
    // a new window keeps them
    expect(bonusLeft(normalize(r.state, '2026-11-20#2'))).toBe(1);
    expect(normalize({ ...r.state, bonus: 0 }, r.state.day).bonus).toBeUndefined();
  });

  it('뭉개기 has its own 3 free picks', () => {
    const s = walk(['S01', 'M01', 'M02', 'M03']);
    expect(s.used).toEqual({ fidget: 0, keyboard: 0, squash: 3 });
    expect(access(s, 'M05', cfg)).toBe('locked');
    expect(access(s, 'S02', cfg)).toBe('free');
  });
});
