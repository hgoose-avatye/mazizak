import { expect, it } from "vitest";
import { Vector3 } from "three";
import { MaterialCage } from "../src/toys/fidgets/cage";
import { FIDGETS } from "../src/toys/fidgets/catalog";
const spec = (id: string) => FIDGETS.find((s) => s.id === id)!;
/** liquid-filled slime without plasticity: every shipped slime is plastic now, but the cage keeps this path */
const springySlime = () => ({ ...spec("L02"), plastic: undefined });
const contact = {
  anchor: new Vector3(0, 0.2, 0.95),
  normal: new Vector3(0, 0, 1),
  drag: new Vector3(),
  depth: { x: 0.35, v: 0 },
  held: true,
};
it("fixed substeps produce consistent pressure deformation at 60 and 120 Hz", () => {
  // the integrator itself (S01 without KEEP_SHAPE: the plastic flow is a per-frame creep, not part of the fixed substeps)
  const a = new MaterialCage({ ...spec("S01"), plastic: undefined }),
    b = new MaterialCage({ ...spec("S01"), plastic: undefined });
  for (let i = 0; i < 60; i++) a.step(1 / 60, [contact], 0);
  for (let i = 0; i < 120; i++) b.step(1 / 120, [contact], 0);
  let error = 0;
  for (let i = 0; i < a.position.length; i++)
    error = Math.max(error, Math.abs(a.position[i] - b.position[i]));
  expect(error).toBeLessThan(1e-8);
  expect(a.volumeRatio).toBeGreaterThan(0.9);
  expect(a.volumeRatio).toBeLessThan(1.1);
});
it("liquid-filled skin transfers pressure to neighbouring nodes and restores on release", () => {
  const cage = new MaterialCage(springySlime());
  for (let i = 0; i < 120; i++) cage.step(1 / 120, [contact], 0);
  const front = new Vector3(0, 0.2, 0.7),
    other = new Vector3(0.5, 0.2, 0.1);
  expect(cage.deform(front, new Vector3()).distanceTo(front)).toBeGreaterThan(
    0.08,
  );
  expect(cage.deform(other, new Vector3()).distanceTo(other)).toBeGreaterThan(
    0.001,
  );
  expect([...cage.position].every(Number.isFinite)).toBe(true);
  for (let i = 0; i < 900; i++) cage.step(1 / 120, [], 0);
  expect(cage.deform(front, new Vector3()).distanceTo(front)).toBeLessThan(
    0.04,
  );
  cage.reset();
  expect([...cage.position]).toEqual([...cage.rest]);
});
it("opposed finger grips push filling into the free front surface rather than creating two front dents", () => {
  const cage = new MaterialCage(springySlime());
  const fingers = [-1, 1].map((sign) => ({
    anchor: new Vector3(sign * 0.8, 0.1, 0.3),
    normal: new Vector3(0, 0, 1),
    drag: new Vector3(-sign * 0.3, 0, 0),
    depth: { x: 0.3, v: 0 },
    held: true,
  }));
  for (let i = 0; i < 100; i++) cage.step(1 / 120, fingers, 0);
  const p = new Vector3(0, 0.1, 0.6);
  expect(cage.deform(p, new Vector3()).z).toBeGreaterThan(p.z + 0.01);
  expect(cage.volumeRatio).toBeGreaterThan(0.85);
  expect(cage.volumeRatio).toBeLessThan(1.15);
});
it("망고 (memory foam) stays stretched a moment after release, then slowly flows home; reset snaps it home", () => {
  const cage = new MaterialCage(spec("L02")); // (치즈 moved to 뭉개기: it keeps its shape)
  const tip = new Vector3(1.2, 0, 0);
  const pull = { anchor: tip.clone(), normal: new Vector3(1, 0, 0), drag: new Vector3(0.44, 0, 0), depth: { x: 0, v: 0 }, held: true };
  for (let i = 0; i < 240; i++) cage.step(1 / 120, [pull], 0); // 2 s pulled to the right
  const pulled = cage.deform(tip, new Vector3()).x - tip.x;
  expect(pulled).toBeGreaterThan(0.2); // drawn out…
  const box = cage.position; // …but never past its bounds (it stays in the fixed view)
  for (let i = 0; i < box.length; i += 3) expect(Math.abs(box[i])).toBeLessThanOrEqual(1.35 * spec("L02").width + 1e-9);
  expect([...cage.position].every(Number.isFinite)).toBe(true);
  expect(cage.volumeRatio).toBeGreaterThan(0.8);
  expect(cage.volumeRatio).toBeLessThan(1.2);
  for (let i = 0; i < 60; i++) cage.step(1 / 120, [], 0); // 0.5 s after release
  expect(cage.deform(tip, new Vector3()).x - tip.x).toBeGreaterThan(pulled * 0.6); // still stretched
  for (let i = 0; i < 120 * 20; i++) cage.step(1 / 120, [], 0); // 20 s later (memory foam, ≈2.5 s)
  expect(cage.deform(tip, new Vector3()).distanceTo(tip)).toBeLessThan(0.05);
  for (let i = 0; i < 240; i++) cage.step(1 / 120, [pull], 0);
  cage.reset();
  expect([...cage.rest]).toEqual([...cage.origin]);
  expect([...cage.position]).toEqual([...cage.origin]);
  expect(cage.plasticOffset).toBe(0);
});

it("슬랑이 (memory foam) holds a dent a moment, then fills back in; a wax ball keeps its dent (KEEP_SHAPE)", () => {
  const dentAfter = (id: string, seconds: number[]) => {
    const cage = new MaterialCage(spec(id)), s = spec(id), top = new Vector3(0, s.height, 0);
    const press = { anchor: top.clone(), normal: new Vector3(0, 1, 0), drag: new Vector3(), depth: { x: s.press, v: 0 }, held: true };
    for (let i = 0; i < 120; i++) cage.step(1 / 120, [press], 0);
    const out = [top.y - cage.deform(top, new Vector3()).y];
    let t = 0;
    for (const until of seconds) {
      while (t < until) { cage.step(1 / 120, [{ ...press, held: false, depth: { x: 0, v: 0 } }], 0); t += 1 / 120; }
      out.push(top.y - cage.deform(top, new Vector3()).y);
    }
    return out;
  };
  const [held, early, late] = dentAfter("S01", [0.3, 15]);
  expect(held).toBeGreaterThan(0.03);
  expect(early).toBeGreaterThan(held * 0.6);
  expect(late).toBeLessThan(held * 0.1);
  const [waxHeld, waxLate] = dentAfter("W01", [10]);
  expect(waxLate).toBeGreaterThan(waxHeld * 0.8);
});

it("뭉개기 (치즈) keeps a squash exactly: no spring-back at all and no volume pushing the sides out", () => {
  const cage = new MaterialCage(spec("L01")), s = spec("L01"), top = new Vector3(0, s.height, 0);
  const press = { anchor: top.clone(), normal: new Vector3(0, 1, 0), drag: new Vector3(), depth: { x: s.press, v: 0 }, held: true };
  for (let i = 0; i < 120; i++) cage.step(1 / 120, [press], 0);
  const held = top.y - cage.deform(top, new Vector3()).y;
  for (let i = 0; i < 120 * 5; i++) cage.step(1 / 120, [{ ...press, held: false, depth: { x: 0, v: 0 } }], 0);
  expect(top.y - cage.deform(top, new Vector3()).y).toBeGreaterThan(held * 0.97);
});

