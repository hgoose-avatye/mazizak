import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { DEFAULT_PARAMS, SquishyModel, recoveryTime, remainingFraction } from '../src/toys/squishy/model';
import { hitTest, KeyboardModel } from '../src/toys/keyboard/model';

const P = DEFAULT_PARAMS;

function pressHoldRelease(hz: number, holdS: number) {
  const m = new SquishyModel({ ...P });
  m.press(1, new Vector3(0, 0.8, 0), new Vector3(0, 1, 0));
  const dt = 1 / hz;
  for (let i = 0, n = Math.round(holdS * hz); i < n; i++) m.update(dt);
  m.release(1);
  const trace: number[] = [];
  let frames = 0;
  while (m.update(dt) && frames < hz * 10) {
    trace.push(m.contacts[0].depth.x);
    frames++;
  }
  return { rec: m.releases[0], trace };
}

describe('SquishyModel (slow-rising foam)', () => {
  it('press is immediate: reaches 90% of press depth within ~0.12 s', () => {
    const { rec } = pressHoldRelease(60, 0.3);
    expect(rec.pressRiseMsSim).not.toBeNull();
    expect(rec.pressRiseMsSim!).toBeLessThan(120);
  });

  it('release recovers slowly (≈1.4–3.0 s to 3% remaining) and never overshoots', () => {
    const tap = pressHoldRelease(60, 0.12);
    const long = pressHoldRelease(60, 1.8);
    for (const r of [tap.rec, long.rec]) {
      expect(r.overshoots).toBe(0);
      expect(r.settleMsSim).toBeGreaterThan(1300);
      expect(r.settleMsSim).toBeLessThan(3200);
    }
    // monotone decreasing after release (no bounce)
    for (const tr of [tap.trace, long.trace]) for (let i = 1; i < tr.length; i++) expect(tr[i]).toBeLessThanOrEqual(tr[i - 1] + 1e-9);
  });

  it('dent lingers: after release a large part remains for a moment', () => {
    const { trace } = pressHoldRelease(60, 1.0);
    const d0 = trace[0] / remainingFraction(1 / 60, P.elasticFrac, P.elasticTau, 1, 0.3); // approx release depth
    const at250ms = trace[14];
    expect(at250ms / d0).toBeGreaterThan(0.55);
  });

  it('longer / deeper press → slower recovery', () => {
    const tap = pressHoldRelease(60, 0.12).rec;
    const long = pressHoldRelease(60, 1.8).rec;
    expect(long.peakDepth).toBeGreaterThan(tap.peakDepth);
    expect(long.settleMsSim).toBeGreaterThan(tap.settleMsSim + 400);
  });

  it('measured recovery matches the closed-form prediction (within a frame)', () => {
    const { rec } = pressHoldRelease(60, 0.8);
    expect(Math.abs(rec.settleMsSim - rec.predictedMs)).toBeLessThan(1000 / 60 + 1);
  });

  it('frame-rate independent: 60 Hz vs 120 Hz', () => {
    const a = pressHoldRelease(60, 0.5).rec;
    const b = pressHoldRelease(120, 0.5).rec;
    expect(Math.abs(a.settleMsSim - b.settleMsSim)).toBeLessThan(1000 / 60 + 1);
    expect(Math.abs(a.peakDepth - b.peakDepth)).toBeLessThan(0.01);
  });

  it('re-pressing a recovering dent continues from its current depth (no pop)', () => {
    const m = new SquishyModel({ ...P });
    m.press(1, new Vector3(0, 0.8, 0), new Vector3(0, 1, 0));
    for (let i = 0; i < 60; i++) m.update(1 / 60);
    m.release(1);
    for (let i = 0; i < 20; i++) m.update(1 / 60);
    const before = m.contacts.find((c) => c.inUse)!.depth.x;
    expect(before).toBeGreaterThan(0.05);
    m.press(2, new Vector3(0.05, 0.8, 0), new Vector3(0, 1, 0));
    m.update(1 / 60);
    const c = m.contacts.find((k) => k.touching)!;
    expect(Math.abs(c.depth.x - before)).toBeLessThan(0.03);
    expect(m.contacts.filter((k) => k.inUse).length).toBe(1); // reused, not a second dent
  });

  it('several dents recover independently', () => {
    const m = new SquishyModel({ ...P });
    const spots = [-0.5, 0, 0.5];
    spots.forEach((x, i) => {
      m.press(i + 1, new Vector3(x, 0.7, 0), new Vector3(0, 1, 0));
      for (let k = 0; k < 10; k++) m.update(1 / 60);
      m.release(i + 1);
    });
    expect(m.contacts.filter((k) => k.inUse).length).toBe(3);
    for (let k = 0; k < 60 * 5; k++) m.update(1 / 60);
    expect(m.contacts.filter((k) => k.inUse).length).toBe(0);
    expect(m.releases.length).toBe(3);
  });

  it('drag offset soft-clamped; two touching max; stretch returns slowly without overshoot', () => {
    const m = new SquishyModel({ ...P });
    m.press(1, new Vector3(0.3, 0.7, 0), new Vector3(0, 1, 0));
    m.drag(1, new Vector3(50, 0, 0));
    for (let i = 0; i < 120; i++) m.update(1 / 60);
    const c = m.contacts.find((k) => k.touching)!;
    expect(Math.hypot(c.s1.x, c.s2.x)).toBeLessThanOrEqual(P.maxSlide + 1e-6);
    expect(m.press(2, new Vector3(-0.3, 0.7, 0), new Vector3(0, 1, 0))).toBe(true);
    expect(m.press(3, new Vector3(0, 0.7, 0.3), new Vector3(0, 1, 0))).toBe(false);
    m.setStretch(1.8, new Vector3(1, 0, 0));
    for (let i = 0; i < 60; i++) m.update(1 / 60);
    const peak = m.stretch.x;
    m.endStretch();
    let min = peak;
    for (let i = 0; i < 300; i++) {
      m.update(1 / 60);
      min = Math.min(min, m.stretch.x);
    }
    expect(peak).toBeGreaterThan(1.2);
    expect(min).toBeGreaterThanOrEqual(1 - 1e-6);
  });

  it('closed-form recovery time spans ~1.4–3.0 s over the hold/depth range', () => {
    const quick = recoveryTime(P.elasticFrac, P.elasticTau, P.slowTauBase, P.delayBase);
    const slow = recoveryTime(P.elasticFrac, P.elasticTau, P.slowTauBase + P.slowTauHold + P.slowTauDepth, P.delayBase + P.delayHold);
    expect(quick).toBeGreaterThan(1.3);
    expect(slow).toBeLessThan(3.1);
  });
});

describe('KeyboardModel', () => {
  it('multi-source holds: key goes up only when the last holder releases', () => {
    const k = new KeyboardModel(10);
    expect(k.press(3, 'p1')).toBe(true);
    expect(k.press(3, 'kKeyA')).toBe(false); // already down: no second down sound
    expect(k.release('p1')).toBe(-1);
    expect(k.release('kKeyA')).toBe(3);
  });

  it('5 simultaneous keys move independently and all return to rest', () => {
    const k = new KeyboardModel(10);
    [0, 2, 4, 6, 9].forEach((id, i) => k.press(id, `p${i}`));
    for (let i = 0; i < 30; i++) k.update(1 / 60);
    [0, 2, 4, 6, 9].forEach((id) => expect(k.travel(id)).toBeGreaterThan(0.9));
    expect(k.travel(1)).toBe(0);
    [0, 1, 2, 3, 4].forEach((i) => k.release(`p${i}`));
    for (let i = 0; i < 120; i++) k.update(1 / 60);
    [0, 2, 4, 6, 9].forEach((id) => expect(Math.abs(k.travel(id))).toBeLessThan(0.01));
    expect(k.records.length).toBe(5);
  });

  it('hitTest picks the containing key, nearest center when margins overlap', () => {
    const rects = [
      { id: 0, x0: 0, y0: 0, x1: 100, y1: 100 },
      { id: 1, x0: 110, y0: 0, x1: 210, y1: 100 },
      { id: 9, x0: 0, y0: 110, x1: 210, y1: 210 },
    ];
    expect(hitTest(rects, 50, 50)).toBe(0);
    expect(hitTest(rects, 105, 50)).toBe(-1);
    expect(hitTest(rects, 104, 50, 6)).toBe(0);
    expect(hitTest(rects, 107, 50, 6)).toBe(1);
    expect(hitTest(rects, 180, 160)).toBe(9);
  });
});
