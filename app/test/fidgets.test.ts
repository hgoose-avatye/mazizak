import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { FIDGETS } from "../src/toys/fidgets/catalog";
import {
  FidgetModel,
  FractureModel,
  GrainModel,
} from "../src/toys/fidgets/model";
const spec = (id: string) => FIDGETS.find((f) => f.id === id)!;
const step = (m: FidgetModel, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 120) m.step(1 / 120);
};
const press = (m: FidgetModel) =>
  m.press(1, new Vector3(0, 0.6, 0.5), new Vector3(0, 1, 0));
describe("fidget material mechanics", () => {
  it("has exactly ten independent profiles over four shared families", () => {
    expect(FIDGETS).toHaveLength(10);
    expect(new Set(FIDGETS.map((f) => f.id)).size).toBe(10);
    expect(new Set(FIDGETS.map((f) => f.family)).size).toBe(4);
    expect(new Set(FIDGETS.map((f) => f.shape)).size).toBe(10);
  });
  it("TPR rebounds quickly while foam holds a deep dent without overshooting", () => {
    const gel = new FidgetModel(spec("S01")),
      foam = new FidgetModel(spec("S02"));
    press(gel);
    press(foam);
    step(gel, 1.5);
    step(foam, 1.5);
    gel.release(1);
    foam.release(1);
    step(gel, 1);
    step(foam, 1);
    expect(gel.compression).toBeLessThan(0.02);
    expect(foam.compression).toBeGreaterThan(0.1);
    let prior = foam.compression;
    for (let i = 0; i < 300; i++) {
      foam.step(1 / 120);
      expect(foam.compression).toBeLessThanOrEqual(prior + 0.00001);
      prior = foam.compression;
    }
  });
  it("deforms near a fingertip much more than the opposite surface", () => {
    const m = new FidgetModel(spec("S03"));
    press(m);
    step(m, 1);
    const a = new Vector3(0, 0.6, 0.5),
      b = new Vector3(0, -0.35, -0.8);
    expect(m.deform(a, new Vector3()).distanceTo(a)).toBeGreaterThan(
      m.deform(b, new Vector3()).distanceTo(b) * 1.5,
    );
  });
  it("opposed grips expand the material with bounded volume and gathering persists until reset", () => {
    const m = new FidgetModel(spec("L01"));
    m.press(1, new Vector3(-0.65, 0.1, 0.5), new Vector3(0, 0, 1));
    m.press(2, new Vector3(0.65, 0.1, 0.5), new Vector3(0, 0, 1));
    m.drag(1, new Vector3(-0.7, 0, 0));
    m.drag(2, new Vector3(0.7, 0, 0));
    step(m, 0.7);
    const center = new Vector3(0, 0.3, 0.4),
      out = m.deform(center, new Vector3());
    expect(
      m.deform(new Vector3(0.8, 0.1, 0.5), new Vector3()).x,
    ).toBeGreaterThan(0.8);
    expect(m.cage.volumeRatio).toBeGreaterThan(0.85);
    expect(m.cage.volumeRatio).toBeLessThan(1.15);
    m.foldNow();
    step(m, 0.7);
    expect(m.foldCount).toBe(1);
    expect(m.deform(center, new Vector3()).y).not.toBe(out.y);
    m.reset();
    expect(m.foldCount).toBe(0);
    expect(m.stretch.x).toBe(1);
  });
  it("thin wax fractures faster than chocolate and resetting restores all faces", () => {
    const centers = [new Vector3(0, 0.6, 0.5), new Vector3(0.3, 0.6, 0.5)],
      apple = new FractureModel(centers, false),
      choco = new FractureModel(centers, true),
      m = new FidgetModel(spec("W01"));
    press(m);
    for (let i = 0; i < 6; i++) {
      // (a few frames only: the deeper default press of the wax toys saturates both within ~0.1 s)
      m.step(1 / 120);
      apple.step(1 / 120, m.held);
      choco.step(1 / 120, m.held);
    }
    expect(apple.damage[0]).toBeGreaterThan(choco.damage[0]);
    for (let i = 0; i < 240; i++) {
      m.step(1 / 120);
      apple.step(1 / 120, m.held);
    }
    expect(apple.brokenCount).toBeGreaterThan(0);
    apple.reset();
    expect(apple.brokenCount).toBe(0);
    expect(apple.crackEvents).toBe(0);
  });
  it("soap irreversibly fragments, while beads collide and retain integrity", () => {
    const m = new FidgetModel(spec("C01")),
      soap = new GrainModel(true),
      beads = new GrainModel(false);
    press(m);
    for (let i = 0; i < 720; i++) {
      m.step(1 / 120);
      soap.step(1 / 120, m);
      beads.step(1 / 120, m);
    }
    expect(soap.crushed).toBeGreaterThan(0);
    expect(beads.collisions).toBeGreaterThan(0);
    expect(beads.grains.every((g) => g.integrity === 1)).toBe(true);
    soap.reset();
    expect(soap.grains.every((g) => g.integrity === 1)).toBe(true);
  });
  it("an intact crunch skin recovers while internal bead rearrangement persists until reset", () => {
    const m = new FidgetModel(spec("C02")),
      beads = new GrainModel(false);
    press(m);
    for (let i = 0; i < 180; i++) {
      m.step(1 / 120);
      beads.step(1 / 120, m);
    }
    m.release(1);
    for (let i = 0; i < 360; i++) {
      m.step(1 / 120);
      beads.step(1 / 120, m);
    }
    expect(m.compression).toBeLessThan(0.02);
    expect(beads.rearrangements).toBe(1);
    expect(beads.grains.some((g) => g.rest.distanceTo(g.initial) > 0.001)).toBe(
      true,
    );
    expect(beads.grains.every((g) => g.rest.length() <= 0.930001)).toBe(true);
    beads.reset();
    expect(beads.rearrangements).toBe(0);
    expect(
      beads.grains.every(
        (g) => g.rest.equals(g.initial) && g.pos.equals(g.initial),
      ),
    ).toBe(true);
  });
  it("bounds simultaneous pointers and releases all state on reset", () => {
    const m = new FidgetModel(spec("S01"));
    for (let i = 0; i < 10; i++)
      m.press(i, new Vector3(i * 0.1, 0.6, 0.5), new Vector3(0, 1, 0));
    expect(m.held).toHaveLength(4);
    m.reset();
    expect(m.held).toHaveLength(0);
    expect(m.contacts.size).toBe(0);
  });
});

describe("rapid repeated clicking (a mouse always reuses pointer id 1)", () => {
  it("a released pointer id can be pressed again immediately; a still-held one cannot", () => {
    for (const id of ["S01", "S02", "L01", "W01", "C01"]) {
      const m = new FidgetModel(spec(id));
      expect(m.press(1, new Vector3(0, 0.2, 0.8), new Vector3(0, 0, 1)), id).toBe(true);
      expect(m.press(1, new Vector3(0, 0.2, 0.8), new Vector3(0, 0, 1)), `${id} held id`).toBe(false);
      m.release(1);
      for (let i = 0; i < 12; i++) {
        // released but still settling → a new click with the same id must be accepted
        expect(m.press(1, new Vector3(0.01 * i, 0.2, 0.8), new Vector3(0, 0, 1)), `${id} click ${i}`).toBe(true);
        m.step(0.04);
        m.release(1);
        m.step(0.05);
      }
    }
  });
});

describe("shell craze cascade (observed in the installed 왁뿌볼 app)", () => {
  const sphere = (n: number) => Array.from({ length: n }, (_, i) => { const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963; return new Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(0.9); });
  const run = (chocolate: boolean, seconds: number, holdFor: number) => {
    const centers = sphere(80), f = new FractureModel(centers, chocolate), m = new FidgetModel(spec(chocolate ? "W02" : "W01"));
    press(m);
    let t = 0;
    const log: number[] = [];
    while (t < seconds) {
      if (t >= holdFor) m.release(1);
      m.step(1 / 120);
      f.step(1 / 120, m.held);
      t += 1 / 120;
      if (Math.abs(t * 4 - Math.round(t * 4)) < 1e-6) log.push(f.brokenCount);
    }
    return { f, log };
  };
  it("a held deep press crazes the whole shell once, and most patches fall within ~3 s; a few flakes stay", () => {
    const { f, log } = run(false, 3, 10);
    expect(f.crazeEvents).toBe(1);
    expect(f.crazing).toBe(true);
    expect(f.brokenCount).toBeGreaterThan(80 * 0.6);
    expect(f.brokenCount).toBeLessThan(80 * 0.97);
    expect(log.every((v, i) => i === 0 || v >= log[i - 1])).toBe(true); // monotone: pieces only fall
  });
  it("chocolate breaks in slower, coarser steps than thin apple wax", () => {
    const apple = run(false, 1.5, 10).f, choco = run(true, 1.5, 10).f;
    expect(choco.brokenCount).toBeLessThan(apple.brokenCount);
  });
  it("a very short tap does not craze the shell, and reset restores everything", () => {
    const { f } = run(false, 2, 0.02);
    expect(f.crazeEvents).toBe(0);
    expect(f.brokenCount).toBeLessThan(80 * 0.2);
    const g = run(false, 3, 10).f;
    g.reset();
    expect(g.brokenCount).toBe(0);
    expect(g.crazing).toBe(false);
    expect(g.crazeEvents).toBe(0);
  });
});
