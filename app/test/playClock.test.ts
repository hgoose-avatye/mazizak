import { describe, expect, it } from 'vitest';
import { IDLE_MS, PlayClock, ROUND_MS } from '../src/sdk/playClock';

const make = () => {
  const log: string[] = [];
  const c = new PlayClock({ begin: () => log.push('begin'), active: (on) => log.push(on ? 'on' : 'off'), end: () => log.push('end') });
  return { c, log };
};
/** touch every second from t0 for `ms` */
const play = (c: PlayClock, t0: number, ms: number) => { for (let t = t0; t <= t0 + ms; t += 1000) { c.input(t); c.tick(t); } };

describe('play clock (1판 = 1분 만지기)', () => {
  it('a minute of touching ends one 판 and starts the next', () => {
    const { c, log } = make();
    play(c, 0, ROUND_MS);
    expect(log).toEqual(['begin', 'on', 'end', 'begin']);
    expect(c.progress(ROUND_MS)).toBe(0);
  });

  it('leaving the toy alone stops the clock after the idle time', () => {
    const { c, log } = make();
    c.input(0);
    c.tick(30_000);
    expect(log).toEqual(['begin', 'on', 'off']);
    expect(c.progress(30_000)).toBe(IDLE_MS); // only the idle window after the last touch counts
  });

  it('play time adds up across pauses within the same 판', () => {
    const { c, log } = make();
    play(c, 0, 40_000); // 40 s
    c.tick(100_000); // idle → stops at 48 s of play
    expect(c.progress(100_000)).toBe(48_000);
    play(c, 200_000, 12_000); // 12 more → 60
    expect(log.filter((e) => e === 'end')).toHaveLength(1);
  });

  it('a covered toy (sheet open) does not count and stops a running stretch', () => {
    const { c, log } = make();
    c.input(0);
    c.tick(2000);
    c.cover(true, 2000);
    expect(log).toEqual(['begin', 'on', 'off']);
    c.input(3000); // touches under a sheet do nothing
    c.tick(70_000);
    expect(log.filter((e) => e === 'end')).toHaveLength(0);
    c.cover(false, 70_000);
    c.input(70_000);
    expect(log.at(-1)).toBe('on');
  });

  it('a long session ends one 판 per minute', () => {
    const { c, log } = make();
    play(c, 0, 5 * ROUND_MS + 500);
    expect(log.filter((e) => e === 'end')).toHaveLength(5);
  });
});
