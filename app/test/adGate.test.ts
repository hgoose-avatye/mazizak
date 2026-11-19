import { describe, expect, it } from 'vitest';
import { access, enter, freeLeft, freshState, grant, localDay, normalize, type GateConfig, type GateState } from '../src/ads/gate';

const cfg: GateConfig = { freePerDay: 3, unlockSwitches: 0 };
const go = (s: GateState, k: string, launch = false) => enter(s, k, { launch }, cfg).state;
/** launch on the first key, then pick the rest */
const walk = (keys: string[]) => keys.slice(1).reduce((s, k) => go(s, k), go(freshState('2026-11-19'), keys[0], true));

describe('ad gate', () => {
  it('the launch toy is free and not counted', () => {
    const s = walk(['S01']);
    expect(s.used).toEqual({ fidget: 0, keyboard: 0 });
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
    expect(access(s, 'L01', cfg)).toBe('locked');
    expect(access(s, 'kb:pebble', cfg)).toBe('free');
    s = walk(['S01', 'S02', 'S03', 'W01', 'kb:pebble', 'kb:clack']);
    expect(s.used).toEqual({ fidget: 3, keyboard: 2 });
    expect(freeLeft(s, 'keyboard', cfg)).toBe(1);
    expect(access(s, 'kb:topre', cfg)).toBe('free');
    expect(access(s, 'L01', cfg)).toBe('locked');
    s = go(s, 'kb:topre');
    expect(access(s, 'kb:pebble', cfg)).toBe('locked');
  });

  it('a keyboard launch is not counted either', () => {
    const s = walk(['kb:pebble', 'kb:clack']);
    expect(s.used).toEqual({ fidget: 0, keyboard: 1 });
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
    s = grant(s, 'L01', cfg);
    expect(access(s, 'L01', cfg)).toBe('open');
    const r = enter(s, 'L01', {}, cfg);
    expect(r.usedFree).toBe(false);
    s = r.state;
    expect(s.used.fidget).toBe(3);
    s = grant(s, 'S01', cfg);
    s = go(s, 'S01');
    expect(access(s, 'L01', cfg)).toBe('locked'); // left it: the next visit is another ad
  });

  it('a granted kind the user did not go to expires with the next switch', () => {
    let s = walk(['S01', 'S02', 'S03', 'W01']);
    s = grant(s, 'L01', cfg);
    s = grant(s, 'S01', cfg);
    s = go(s, 'S01');
    expect(access(s, 'L01', cfg)).toBe('locked');
  });

  it('unlockSwitches keeps an ad-opened kind for that many more switches', () => {
    const c2: GateConfig = { freePerDay: 0, unlockSwitches: 2 };
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
      .toEqual({ day: 'd', used: { fidget: 0, keyboard: 0 }, unlocks: { b: 3 }, switches: 1, current: '' });
    expect(normalize({ day: 'd', used: { fidget: 2, keyboard: -1 } }, 'd').used).toEqual({ fidget: 2, keyboard: 0 });
  });

  it('local day is YYYY-MM-DD', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
