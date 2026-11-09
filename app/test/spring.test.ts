import { describe, expect, it } from 'vitest';
import { analyzeRelease, Spring, stepSpring } from '../src/core/spring';

function simulate(params: { freq: number; damping: number }, hz: number, seconds: number) {
  const s = new Spring(1, params);
  s.target = 0;
  const dt = 1 / hz;
  const n = Math.round(seconds * hz);
  for (let i = 0; i < n; i++) s.step(dt);
  return s;
}

describe('stepSpring (closed form)', () => {
  for (const damping of [0.2, 0.5, 1.0, 1.6]) {
    it(`is frame-rate independent (ζ=${damping}): 60Hz == 120Hz == 240Hz`, () => {
      const p = { freq: 4, damping };
      const a = simulate(p, 60, 0.5);
      const b = simulate(p, 120, 0.5);
      const c = simulate(p, 240, 0.5);
      expect(b.x).toBeCloseTo(a.x, 10);
      expect(c.x).toBeCloseTo(a.x, 10);
      expect(c.v).toBeCloseTo(a.v, 8);
    });

    it(`matches a fine numerical integration (ζ=${damping})`, () => {
      const p = { freq: 3, damping };
      const w = 2 * Math.PI * p.freq;
      let y = 1;
      let v = 0;
      const h = 1e-5;
      for (let t = 0; t < 0.4; t += h) {
        const a = -w * w * y - 2 * damping * w * v;
        v += a * h;
        y += v * h;
      }
      const exact = stepSpring(1, 0, 0.4, p);
      expect(exact.y).toBeCloseTo(y, 3);
    });
  }

  it('underdamped release overshoots, overdamped does not', () => {
    expect(analyzeRelease(1, { freq: 4, damping: 0.3 }).overshoots).toBeGreaterThan(0);
    expect(analyzeRelease(1, { freq: 4, damping: 1.2 }).overshoots).toBe(0);
  });

  it('settle time shrinks as frequency rises (same damping)', () => {
    const slow = analyzeRelease(1, { freq: 2, damping: 0.4 }).settleTime;
    const fast = analyzeRelease(1, { freq: 6, damping: 0.4 }).settleTime;
    expect(fast).toBeLessThan(slow);
  });

  it('is stable for huge dt (no explosion)', () => {
    const r = stepSpring(1, 0, 10, { freq: 40, damping: 0.5 });
    expect(Math.abs(r.y)).toBeLessThan(1e-6);
  });
});
