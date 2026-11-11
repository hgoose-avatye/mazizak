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
      const pow = s.shape === "cheese" ? 0.42 : s.shape === "soap" ? 0.5 : 0.38;
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
export function shellPatches(
  source: THREE.BufferGeometry,
  spec: FidgetSpec,
): ShellPatches {
  const geometry = source.index ? source.toNonIndexed() : source.clone(),
    p = geometry.getAttribute("position");
  const count = spec.shape === "apple" ? 104 : 42;
  const seeds = Array.from({ length: count }, (_, i) => {
    const y = 1 - ((i + 0.5) * 2) / count,
      r = Math.sqrt(1 - y * y),
      a = i * 2.399963;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  });
  const centers = seeds.map(() => new THREE.Vector3()),
    vertices = seeds.map(() => [] as number[]),
    faceToPatch = new Uint16Array(p.count / 3),
    c = new THREE.Vector3(),
    v = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    c.set(0, 0, 0);
    for (let j = 0; j < 3; j++) c.add(v.fromBufferAttribute(p, i + j));
    c.multiplyScalar(1 / 3);
    const n = c
      .clone()
      .set(c.x / spec.width, c.y / spec.height, c.z / spec.depth)
      .normalize();
    let best = 0,
      score = -Infinity;
    for (let k = 0; k < count; k++) {
      const d = n.dot(seeds[k]);
      if (d > score) {
        score = d;
        best = k;
      }
    }
    faceToPatch[i / 3] = best;
    for (let j = 0; j < 3; j++) {
      vertices[best].push(i + j);
      centers[best].add(v.fromBufferAttribute(p, i + j));
    }
  }
  centers.forEach((c, i) => {
    if (vertices[i].length) c.multiplyScalar(1 / vertices[i].length);
    else c.copy(seeds[i]);
  });
  return { geometry, centers, vertices, faceToPatch };
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
