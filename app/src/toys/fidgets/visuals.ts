import * as THREE from "three";
import type { FidgetSpec } from "./catalog";
export const STAGES: Record<string, number> = {
  S01: 0xe8f0ef,
  S02: 0xf2eae0,
  S03: 0xf3e9e9,
  L01: 0xf4eddc,
  L02: 0xf4e8dd,
  L03: 0xf0e9e6,
  W01: 0xecf0e3,
  W02: 0xede3df,
  C01: 0xf2f0ea,
  C02: 0xf0f1ee,
};
export function surfaceTexture(shape: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#bdbdbd";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 71;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < (shape === "foam" ? 3500 : 9000); i++) {
    const x = rnd() * 256,
      y = rnd() * 256,
      r = shape === "foam" ? 0.2 + rnd() * 1.5 : 0.1 + rnd() * 0.45;
    ctx.fillStyle = `rgba(${shape === "foam" ? "65,65,65" : "230,230,230"},${0.1 + rnd() * 0.35})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}
export function bodyGeometry(s: FidgetSpec) {
  if (s.shape === "cream") {
    // A piped rosette: a broad base, rising spiral and an asymmetric tapered tip.
    const g = new THREE.SphereGeometry(1, 96, 56),
      p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i),
        t = (y + 1) * 0.5,
        theta = Math.atan2(p.getZ(i), p.getX(i));
      const radius =
        Math.sqrt(Math.max(0, 1 - y * y)) *
        (1.18 - 0.7 * t) *
        (1 + 0.14 * Math.sin(theta * 8 - t * 15));
      p.setXYZ(
        i,
        Math.cos(theta) * radius * s.width + Math.pow(t, 8) * 0.2,
        (t * 2 - 1) * s.height,
        Math.sin(theta) * radius * s.depth,
      );
    }
    g.computeVertexNormals();
    return g;
  }
  const g = new THREE.SphereGeometry(1, 72, 48),
    p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const theta = Math.atan2(z, x);
    if (s.shape === "foam" || s.shape === "cheese" || s.shape === "soap") {
      const pow = s.shape === "cheese" ? 0.78 : s.shape === "soap" ? 0.5 : 0.38;
      x = Math.sign(x) * Math.pow(Math.abs(x), pow);
      y = Math.sign(y) * Math.pow(Math.abs(y), pow);
      z = Math.sign(z) * Math.pow(Math.abs(z), pow);
      if (s.shape === "foam") y += 0.04 * Math.cos(x * 6) * Math.cos(z * 6);
    }
    if (s.shape === "chocolate") {
      const r = 1 - 0.018 * Math.pow(Math.sin(theta * 4 + y * 9), 12);
      x *= r;
      z *= r;
    }
    if (s.shape === "mango") {
      x *= 1 + 0.18 * y;
      y *= 0.9;
      z *= 1 - 0.12 * y;
    }
    if (s.shape === "apple") {
      const ring = 1 + 0.045 * Math.cos(theta * 5) * (1 - y * y);
      x *= ring;
      z *= ring;
      y -= 0.14 * Math.exp(-(x * x + z * z) / 0.09) * Math.max(0, y);
    }
    if (s.shape === "mochi") {
      x *= 1 + 0.08 * y;
      z *= 1 + 0.08 * y;
      y -= 0.08 * Math.exp((-x * x) / 0.025) * Math.max(0, y);
    }
    p.setXYZ(
      i,
      x * s.width,
      Math.max(
        y,
        s.shape === "soap" ? -0.93 : s.shape === "beads" ? -1 : -0.86,
      ) * s.height,
      z * s.depth,
    );
  }
  g.computeVertexNormals();
  return g;
}
export interface ShellPatches {
  geometry: THREE.BufferGeometry;
  centers: THREE.Vector3[];
  vertices: number[][];
  faceToPatch: Uint16Array;
}
/** Closed curved Voronoi wax cells: straight fracture boundaries, real pale cut edges. */
export function shellPatches(
  _source: THREE.BufferGeometry,
  spec: FidgetSpec,
): ShellPatches {
  const count = spec.shape === "apple" ? 104 : 42,
    positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    ids: number[] = [],
    vertices = Array.from({ length: count }, () => [] as number[]),
    centers: THREE.Vector3[] = [];
  const seeds = Array.from({ length: count }, (_, i) => {
    const y = 1 - ((i + 0.5) * 2) / count,
      r = Math.sqrt(1 - y * y),
      a = i * 2.399963;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  });
  const outerColor = new THREE.Color(spec.color),
    innerColor = new THREE.Color(spec.shape === "apple" ? 0xf0e9cc : 0x9d7660),
    rimColor = innerColor.clone().lerp(outerColor, 0.2),
    thickness = spec.shape === "apple" ? 0.025 : 0.05;
  const shape = (unit: THREE.Vector3, inside = false) => {
    let x = unit.x,
      y = unit.y,
      z = unit.z;
    const theta = Math.atan2(z, x);
    if (spec.shape === "apple") {
      const ring = 1 + 0.045 * Math.cos(theta * 5) * (1 - y * y);
      x *= ring;
      z *= ring;
      y -= 0.14 * Math.exp(-(x * x + z * z) / 0.09) * Math.max(0, y);
    } else {
      const r = 1 - 0.018 * Math.pow(Math.sin(theta * 4 + y * 9), 12);
      x *= r;
      z *= r;
    }
    const p = new THREE.Vector3(
      x * spec.width,
      y * spec.height,
      z * spec.depth,
    ).multiplyScalar(1.035);
    if (inside)
      p.addScaledVector(
        new THREE.Vector3(
          unit.x / spec.width,
          unit.y / spec.height,
          unit.z / spec.depth,
        ).normalize(),
        -thickness,
      );
    return p;
  };
  const emit = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    patch: number,
    color: THREE.Color,
    curved: boolean,
    inside = false,
  ) => {
    const face = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    for (const p of [a, b, c]) {
      const i = positions.length / 3;
      positions.push(p.x, p.y, p.z);
      vertices[patch].push(i);
      const n = curved
        ? new THREE.Vector3(
            p.x / (spec.width * spec.width),
            p.y / (spec.height * spec.height),
            p.z / (spec.depth * spec.depth),
          )
            .normalize()
            .multiplyScalar(inside ? -1 : 1)
        : face;
      normals.push(n.x, n.y, n.z);
      colors.push(color.r, color.g, color.b);
    }
    ids.push(patch);
  };
  seeds.forEach((seed, patch) => {
    const u = new THREE.Vector3()
        .crossVectors(
          seed,
          Math.abs(seed.y) > 0.9
            ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0, 1, 0),
        )
        .normalize(),
      v = new THREE.Vector3().crossVectors(seed, u).normalize();
    let polygon: [number, number][] = [
      [-2, -2],
      [2, -2],
      [2, 2],
      [-2, 2],
    ];
    for (let j = 0; j < count; j++)
      if (j !== patch) {
        const plane = seed.clone().sub(seeds[j]),
          a = plane.dot(u),
          b = plane.dot(v),
          c = plane.dot(seed),
          next: [number, number][] = [];
        for (let i = 0; i < polygon.length; i++) {
          const p = polygon[i],
            q = polygon[(i + 1) % polygon.length],
            dp = a * p[0] + b * p[1] + c,
            dq = a * q[0] + b * q[1] + c;
          if (dp >= -1e-10) next.push(p);
          if (dp >= 0 !== dq >= 0) {
            const t = dp / (dp - dq);
            next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
          }
        }
        polygon = next;
        if (!polygon.length) break;
      }
    centers.push(shape(seed));
    const toUnit = (p: [number, number]) =>
      seed
        .clone()
        .addScaledVector(u, p[0])
        .addScaledVector(v, p[1])
        .normalize();
    for (let i = 0; i < polygon.length; i++) {
      const a = toUnit(polygon[i]),
        b = toUnit(polygon[(i + 1) % polygon.length]);
      for (let k = 0; k < 3; k++) {
        const ua = a
            .clone()
            .lerp(b, k / 3)
            .normalize(),
          ub = a
            .clone()
            .lerp(b, (k + 1) / 3)
            .normalize();
        const oa = shape(ua),
          ob = shape(ub),
          ia = shape(ua, true),
          ib = shape(ub, true);
        emit(shape(seed), oa, ob, patch, outerColor, true);
        emit(shape(seed, true), ib, ia, patch, innerColor, true, true);
        emit(oa, ia, ob, patch, rimColor, false);
        emit(ob, ia, ib, patch, rimColor, false);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return { geometry, centers, vertices, faceToPatch: new Uint16Array(ids) };
}

/** Fine embedded sugar grains, based on the user's photo rather than large exposed pearls. */
export function sugarColor(x: number, y = 0, z = 0) {
  const stops = [
    new THREE.Color(0x299fc5),
    new THREE.Color(0xa888cf),
    new THREE.Color(0xe98bab),
    new THREE.Color(0xefc45b),
  ];
  const t =
    THREE.MathUtils.clamp((x + 0.92) / 1.84 + y * 0.06 - z * 0.035, 0, 0.999) *
    3;
  return stops[Math.floor(t)]
    .clone()
    .lerp(stops[Math.min(3, Math.floor(t) + 1)], t % 1);
}
export function sugarTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#eeeeee";
  ctx.fillRect(0, 0, c.width, c.height);
  let seed = 432;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 22000; i++) {
    const x = rnd() * c.width,
      y = rnd() * c.height,
      r = 0.35 + rnd() * 1.25;
    ctx.fillStyle = i % 3 === 0 ? "rgba(88,88,88,.25)" : "rgba(255,255,255,.7)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
