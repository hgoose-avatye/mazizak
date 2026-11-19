import { describe, expect, it } from 'vitest';
import { access, enter, freeLeft, freshState, grant, localDay, normalize, type GateConfig } from '../src/ads/gate';

const cfg: GateConfig = { freePerDay: 3, unlockSwitches: 0 };
const walk = (keys: string[]) => keys.reduce((s, k) => enter(s, k, cfg), freshState('2026-11-19'));

describe('ad gate', () => {
  it('the first three kinds of the day are free and stay free', () => {
    let s = walk(['S01', 'S02', 'kb:pebble']);
    expect(s.free).toEqual(['S01', 'S02', 'kb:pebble']);
    expect(freeLeft(s, cfg)).toBe(0);
    for (const k of ['S01', 'S02', 'kb:pebble']) expect(access(s, k, cfg)).toBe('open');
    s = walk(['S01', 'S02', 'S01', 'S02', 'S01', 'kb:pebble']); // going back and forth does not use slots
    expect(s.free).toEqual(['S01', 'S02', 'kb:pebble']);
  });

  it('the launch toy takes the first slot; a fourth kind needs an ad', () => {
    const s = walk(['S05', 'S01', 'S02']);
    expect(access(s, 'S03', cfg)).toBe('locked');
    expect(access(freshState('2026-11-19'), 'S03', cfg)).toBe('free-slot');
  });

  it('an ad opens a kind for this visit only (unlockSwitches 0)', () => {
    let s = walk(['S01', 'S02', 'S03']);
    s = grant(s, 'S04', cfg);
    expect(access(s, 'S04', cfg)).toBe('open');
    s = enter(s, 'S04', cfg);
    expect(s.free).not.toContain('S04'); // an ad-opened kind never takes a free slot
    expect(access(s, 'S04', cfg)).toBe('open'); // on screen
    s = enter(s, 'S01', cfg);
    expect(access(s, 'S04', cfg)).toBe('locked'); // left it: the next visit is another ad
    expect(access(s, 'S02', cfg)).toBe('open');
  });

  it('a granted kind the user did not go to expires with the next switch', () => {
    let s = walk(['S01', 'S02', 'S03']);
    s = grant(s, 'S04', cfg);
    s = enter(s, 'S01', cfg); // went elsewhere instead (e.g. the switch failed and they picked another)
    expect(access(s, 'S04', cfg)).toBe('locked');
  });

  it('unlockSwitches keeps an ad-opened kind for that many more switches', () => {
    const c2: GateConfig = { freePerDay: 3, unlockSwitches: 2 };
    let s = ['S01', 'S02', 'S03'].reduce((x, k) => enter(x, k, c2), freshState('d'));
    s = enter(grant(s, 'S04', c2), 'S04', c2);
    s = enter(s, 'S01', c2);
    expect(access(s, 'S04', c2)).toBe('open'); // 1 switch away
    s = enter(s, 'S02', c2);
    expect(access(s, 'S04', c2)).toBe('locked'); // returning would be the 3rd switch
  });

  it('a new day starts over; broken stored state is ignored', () => {
    const s = walk(['S01', 'S02', 'S03']);
    expect(normalize(JSON.parse(JSON.stringify(s)), '2026-11-19')).toEqual(s);
    expect(normalize(s, '2026-11-20')).toEqual(freshState('2026-11-20'));
    expect(normalize(null, 'd')).toEqual(freshState('d'));
    expect(normalize('x', 'd')).toEqual(freshState('d'));
    expect(normalize({ day: 'd', free: [1, 'S01'], unlocks: { a: 'x', b: 3 }, switches: -4, current: 7 }, 'd'))
      .toEqual({ day: 'd', free: ['S01'], unlocks: { b: 3 }, switches: 0, current: '' });
  });

  it('local day is YYYY-MM-DD', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
