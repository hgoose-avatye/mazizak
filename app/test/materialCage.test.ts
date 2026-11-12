import { expect, it } from "vitest";
import { Vector3 } from "three";
import { MaterialCage } from "../src/toys/fidgets/cage";
import { FIDGETS } from "../src/toys/fidgets/catalog";
const spec = (id: string) => FIDGETS.find((s) => s.id === id)!;
const contact = {
  anchor: new Vector3(0, 0.2, 0.95),
  normal: new Vector3(0, 0, 1),
  drag: new Vector3(),
  depth: { x: 0.35, v: 0 },
  held: true,
};
it("fixed substeps produce consistent pressure deformation at 60 and 120 Hz", () => {
  const a = new MaterialCage(spec("S01")),
    b = new MaterialCage(spec("S01"));
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
  const cage = new MaterialCage(spec("L01"));
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
  const cage = new MaterialCage(spec("L01"));
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
