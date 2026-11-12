import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
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
/** Chocolate bar: 2 columns × 3 rows = 6 pieces. Half-extents come from the spec (width, height, depth). */
export const BAR = { cols: 2, rows: 3, gap: 0.02, shellThickness: 0.12, dome: 0.03 };
export function bodyGeometry(s: FidgetSpec) {
  if (s.shape === "chocolate") {
    // the soft pink core behind the chocolate pieces: a plate as wide and tall as the bar, a little thinner than it
    const w = s.width * 2 * 0.985,
      h = s.height * 2 * 0.985,
      d = s.depth * 2 - BAR.shellThickness;
    const g = new RoundedBoxGeometry(w, h, d, 5, 0.05);
    g.translate(0, 0, -(BAR.shellThickness * 0.5));
    return g;
  }
  if (s.shape === "cheese") {
    // A cheese wedge seen from the front: flat bottom, a top sloping from the tall rind (right) down to a thin edge (left),
    // and round holes punched into the faces. Built from a subdivided rounded box (even grid on every face, so the holes stay
    // round), with shared vertices merged so the slime deformation never tears a seam.
    let g: THREE.BufferGeometry = new THREE.BoxGeometry(2, 2, 2, 72, 48, 36);
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    g = mergeVertices(g);
    const p = g.getAttribute("position");
    // [face, u, v, radius] — front/back use (x, y) in wedge space, the rind uses (z, y)
    const holes: [string, number, number, number][] = [
      ["front", 0.45, -0.3, 0.27], ["front", -0.25, -0.62, 0.19], ["front", 0.78, 0.4, 0.16], ["front", 0.12, 0.05, 0.11], ["front", -0.68, -0.8, 0.09],
      ["back", 0.4, -0.3, 0.24], ["back", -0.2, -0.65, 0.16],
      ["rind", 0.3, 0.2, 0.22], ["rind", -0.4, -0.5, 0.16],
    ];
    const R = 0.22; // edge rounding
    for (let i = 0; i < p.count; i++) {
      const bx = p.getX(i), by = p.getY(i), bz = p.getZ(i);
      const face = bz > 0.999 ? "front" : bz < -0.999 ? "back" : bx > 0.999 ? "rind" : "";
      // rounded box: push each point out from the clamped inner box
      const ix = THREE.MathUtils.clamp(bx, R - 1, 1 - R), iy = THREE.MathUtils.clamp(by, R - 1, 1 - R), iz = THREE.MathUtils.clamp(bz, R - 1, 1 - R);
      const nx = bx - ix, ny = by - iy, nz = bz - iz, nl = Math.hypot(nx, ny, nz) || 1;
      let x = ix + (nx / nl) * R, y = iy + (ny / nl) * R, z = iz + (nz / nl) * R;
      const t = (x + 1) / 2; // 0 at the thin edge, 1 at the rind
      y = -1 + (y + 1) * (0.3 + 0.7 * t);
      x += 0.08 * t * t;
      for (const [hf, u, w, r] of holes) {
        if (hf !== face) continue;
        const d = hf === "rind" ? Math.hypot(z - u, y - w) : Math.hypot(x - u, y - w);
        if (d >= r) continue;
        // a bowl with a softened rim
        const k = d / r, depth = r * 0.85 * Math.sqrt(1 - k * k) * Math.min(1, (1 - k) * 6);
        if (hf === "front") z -= depth;
        else if (hf === "back") z += depth;
        else x -= depth;
      }
      p.setXYZ(i, x * s.width, (y + 0.3) * s.height, z * s.depth); // +0.3: centre the wedge's mass so the thin end stays under the fingers
    }
    g.rotateY(0.25);
    g.computeVertexNormals();
    return g;
  }
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
    if (s.shape === "foam" || s.shape === "soap") {
      const pow = s.shape === "soap" ? 0.5 : 0.38;
      x = Math.sign(x) * Math.pow(Math.abs(x), pow);
      y = Math.sign(y) * Math.pow(Math.abs(y), pow);
      z = Math.sign(z) * Math.pow(Math.abs(z), pow);
      if (s.shape === "foam") y += 0.04 * Math.cos(x * 6) * Math.cos(z * 6);
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
/** rectangle [x0, x1] × [y0, y1] of bar piece `i` (row-major, 2 columns) in body-local coordinates */
export function barPieceRect(spec: FidgetSpec, i: number) {
  const tw = (2 * spec.width) / BAR.cols, th = (2 * spec.height) / BAR.rows, c = i % BAR.cols, r = Math.floor(i / BAR.cols);
  return { x0: -spec.width + c * tw + BAR.gap / 2, x1: -spec.width + (c + 1) * tw - BAR.gap / 2, y1: spec.height - r * th - BAR.gap / 2, y0: spec.height - (r + 1) * th + BAR.gap / 2, row: r, col: c };
}
/** Chocolate bar shell: six slightly domed pieces (2 × 3) with thin grooves between them and pale cut edges. */
function chocolateBarPatches(spec: FidgetSpec): ShellPatches {
  const { cols, rows, gap, shellThickness, dome } = BAR;
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    ids: number[] = [],
    centers: THREE.Vector3[] = [],
    vertices = Array.from({ length: cols * rows }, () => [] as number[]);
  const outer = new THREE.Color(spec.color),
    cut = new THREE.Color(0x9d7660),
    rim = cut.clone().lerp(outer, 0.2);
  const hx = spec.width,
    hy = spec.height,
    zOut = spec.depth, // front surface (pieces sit on top of the core, which ends at zOut − shellThickness)
    zIn = spec.depth - shellThickness;
  const tw = (2 * hx) / cols,
    th = (2 * hy) / rows;
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, patch: number, color: THREE.Color, na?: THREE.Vector3, nb?: THREE.Vector3, nc?: THREE.Vector3) => {
    const face = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    [a, b, c].forEach((p, k) => {
      const i = positions.length / 3;
      positions.push(p.x, p.y, p.z);
      vertices[patch].push(i);
      const n = [na, nb, nc][k] ?? face;
      normals.push(n.x, n.y, n.z);
      colors.push(color.r, color.g, color.b);
    });
    ids.push(patch);
  };
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const patch = r * cols + c;
      const x0 = -hx + c * tw + gap / 2,
        x1 = -hx + (c + 1) * tw - gap / 2,
        y1 = hy - r * th - gap / 2,
        y0 = hy - (r + 1) * th + gap / 2;
      centers.push(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, zOut));
      const N = 6;
      // domed top: raised in the middle, falling to the edge, with a soft bevel
      const top = (u: number, v: number) => {
        const du = 1 - Math.pow(2 * u - 1, 2),
          dv = 1 - Math.pow(2 * v - 1, 2);
        return new THREE.Vector3(x0 + (x1 - x0) * u, y0 + (y1 - y0) * v, zOut + dome * Math.sqrt(Math.max(0, du * dv)) - dome * 0.55);
      };
      const nrm = (u: number, v: number) => {
        const e = 1e-3,
          p = top(u, v),
          pu = top(Math.min(1, u + e), v).sub(top(Math.max(0, u - e), v)),
          pv = top(u, Math.min(1, v + e)).sub(top(u, Math.max(0, v - e)));
        void p;
        return pu.cross(pv).normalize();
      };
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
          const u0 = i / N, u1 = (i + 1) / N, v0 = j / N, v1 = (j + 1) / N;
          const a = top(u0, v0), b = top(u1, v0), cc = top(u1, v1), d = top(u0, v1);
          tri(a, b, cc, patch, outer, nrm(u0, v0), nrm(u1, v0), nrm(u1, v1));
          tri(a, cc, d, patch, outer, nrm(u0, v0), nrm(u1, v1), nrm(u0, v1));
        }
      // underside (faces the core) and the four cut walls
      const ia = new THREE.Vector3(x0, y0, zIn), ib = new THREE.Vector3(x1, y0, zIn), ic = new THREE.Vector3(x1, y1, zIn), id = new THREE.Vector3(x0, y1, zIn);
      const back = new THREE.Vector3(0, 0, -1);
      tri(ia, ic, ib, patch, cut, back, back, back);
      tri(ia, id, ic, patch, cut, back, back, back);
      const edge = (u0: number, v0: number, u1: number, v1: number, p0: THREE.Vector3, p1: THREE.Vector3) => {
        const t0 = top(u0, v0), t1 = top(u1, v1);
        tri(t0, p0, t1, patch, rim);
        tri(t1, p0, p1, patch, rim);
      };
      edge(0, 0, 1, 0, ia, ib);
      edge(1, 0, 1, 1, ib, ic);
      edge(1, 1, 0, 1, ic, id);
      edge(0, 1, 0, 0, id, ia);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return { geometry, centers, vertices, faceToPatch: new Uint16Array(ids) };
}

/** Closed curved Voronoi wax cells: straight fracture boundaries, real pale cut edges. */
export function shellPatches(
  _source: THREE.BufferGeometry,
  spec: FidgetSpec,
): ShellPatches {
  if (spec.shape === "chocolate") return chocolateBarPatches(spec);
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
