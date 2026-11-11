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
      m.deform(b, new Vector3()).distanceTo(b) * 3,
    );
  });
  it("stretch forms a narrower middle and fold state persists until reset", () => {
    const m = new FidgetModel(spec("L01"));
    m.stretch.snap(2.5);
    const center = new Vector3(0, 0.3, 0.4),
      out = m.deform(center, new Vector3());
    expect(out.z).toBeLessThan(center.z);
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
    for (let i = 0; i < 120; i++) {
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
