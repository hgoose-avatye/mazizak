import * as THREE from "three";
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
  M01: 0xf5ebe6,
  M02: 0xf6ebee,
  M03: 0xf5efe2,
  M04: 0xf0edf3,
  M05: 0xeef1ec,
  M06: 0xf3efe2,
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
  if (shape === "tofu") {
    // tofu: a fine, uneven curd surface with little pores (owner, 2026-11-20: not smooth)
    for (let i = 0; i < 9000; i++) {
      const x = rnd() * 256, y = rnd() * 256, r = 0.6 + rnd() * 2.2;
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? "90,90,90" : "235,235,235"},${0.15 + rnd() * 0.35})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2.5, 2);
    return t;
  }
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
/**
 * 비누: an oval with "SOAP" pressed into the big face, as on a bar of soap (owner, 2026-11-20). Projected straight onto the face the
 * camera looks at (soapStampUVs — the top was tried first and read too flat from the toy's view), so the canvas is squeezed sideways
 * by height/width to keep the letters round. Returns a bump map (darker = deeper) and a colour map (the grooves read a touch greyer).
 */
export function soapStampTextures(spec: { width: number; height: number }) {
  return stampTextures(spec, "SOAP", "700 92px Georgia, 'Times New Roman', serif", "#d8cfbd");
}
/** 버터: "BUTTER" pressed into the front of the block, in English like the soap (owner, 2026-11-20) */
export function butterStampTextures(spec: { width: number; height: number }) {
  return stampTextures(spec, "BUTTER", "700 70px Georgia, 'Times New Roman', serif", "#e7c25a");
}
/** an oval with `text` pressed in, projected front-on (soapStampUVs): bump (darker = deeper) + colour map */
function stampTextures(spec: { width: number; height: number }, text: string, font: string, groove: string) {
  const make = (bg: string, ink: string, blur: number) => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = bg === "#ffffff" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    const draw = () => {
      const ctx = c.getContext("2d")!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = "none";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 512, 512);
      ctx.save();
      ctx.translate(256, 256);
      ctx.scale(spec.height / spec.width, 1); // u spans 2·width, v spans 2·height
      ctx.filter = `blur(${blur}px)`;
      ctx.strokeStyle = ink;
      ctx.fillStyle = ink;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.ellipse(0, 0, 150, 92, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, 6);
      ctx.restore();
      t.needsUpdate = true;
    };
    draw();
    // a web font may still be loading: draw again once it is there
    void document.fonts?.load(font, text).then(draw, () => {});
    return t;
  };
  return { bump: make("#808080", "#1e1e1e", 2.5), color: make("#ffffff", groove, 1.5) };
}
/** front-on UVs for the soap stamp: u across the width, v up the height (the back gets the same mirrored stamp, out of view —
 *  no seam where the two halves meet) */
export function soapStampUVs(g: THREE.BufferGeometry, spec: { width: number; height: number }) {
  const p = g.getAttribute("position"), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = 0.5 + p.getX(i) / (2 * spec.width);
    uv[i * 2 + 1] = 0.5 + p.getY(i) / (2 * spec.height);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}
/** box with rounded edges and an even vertex grid on every face (shared vertices merged, so deformation never tears a seam) */
function roundedSlab(w: number, h: number, d: number, r: number, sx: number, sy: number, sz: number) {
  let g: THREE.BufferGeometry = new THREE.BoxGeometry(w, h, d, sx, sy, sz);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g);
  const p = g.getAttribute("position"),
    hx = w / 2 - r,
    hy = h / 2 - r,
    hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ix = THREE.MathUtils.clamp(x, -hx, hx), iy = THREE.MathUtils.clamp(y, -hy, hy), iz = THREE.MathUtils.clamp(z, -hz, hz);
    const nx = x - ix, ny = y - iy, nz = z - iz, nl = Math.hypot(nx, ny, nz) || 1;
    p.setXYZ(i, ix + (nx / nl) * r, iy + (ny / nl) * r, iz + (nz / nl) * r);
  }
  g.computeVertexNormals();
  return g;
}
/** Chocolate bar: 2 columns × 3 rows = 6 pieces. Half-extents come from the spec (width, height, depth). */
export const BAR = { cols: 2, rows: 3, gap: 0.02, shellThickness: 0.12, dome: 0.03 };
/**
 * 모닝빵 score lines: six grooves every 60° (offset 30°, so none sits on the sphere's seam), strongest near the top and fading out around
 * mid height. `groove` ∈ [0,1] = depth of the nearest groove here, `lobe` ∈ [-1,1] = the soft bulge between grooves (−1 inside a groove).
 */
export function breadScore(theta: number, y: number) {
  const step = Math.PI / 3, a = (((theta - Math.PI / 6) % step) + step) % step, dist = Math.min(a, step - a);
  const mask = THREE.MathUtils.smoothstep(y, -0.15, 0.55) * (1 - 0.6 * THREE.MathUtils.smoothstep(y, 0.9, 1.0));
  return { groove: Math.exp(-((dist / 0.13) ** 2)) * mask, lobe: -Math.cos(6 * (theta - Math.PI / 6)) * mask };
}
/** 찹쌀떡 filling window on the front face: elliptical distance from its centre in unit coordinates (0 = centre, 1 = edge of the cut) */
export function mochiK(x: number, y: number) {
  return Math.hypot(x / 0.74, (y - 0.05) / 0.52);
}
/**
 * 모닝빵 / 찹쌀떡: paint the body so it looks like the real thing (vertex colours, the same approach as the beads).
 * Bread roll: cream foot → golden sides → orange-brown top, the score lines show the pale crumb. Peach mochi: white skin, soft grey towards
 * the foot, and the peach-pink filling inside the front window. Colours are read from the final (deformation-free) positions.
 */
/** where the mango's stem sits (unit sphere direction before the mango shaping) */
const MANGO_STEM = new THREE.Vector3(0.9, 0.42, 0.1).normalize();
export function paintBody(g: THREE.BufferGeometry, s: FidgetSpec) {
  const p = g.getAttribute("position"), colors = new Float32Array(p.count * 3);
  const C = (h: number) => new THREE.Color(h);
  const cream = C(0xf2d9a4), gold = C(0xdea04e), orange = C(0xbd5a22), brown = C(0x8c4119), crumb = C(0xf1d8a4);
  const white = C(0xf7f2ec), shade = C(0xe4ded7), flesh = C(0xf98a5c), pinkMid = C(0xfba188), pinkEdge = C(0xf9ab9c);
  const tomatoRed = C(0xe53b2c), tomatoDeep = C(0xb8261d), leaf = C(0x3f8a2e), berryRed = C(0xe8333f), berryDeep = C(0xb51f33), berrySeed = C(0xf6e27a), berryPale = C(0xf26b6b);
  const custard = C(0xf7d56e), custardDeep = C(0xe8b84a), caramel = C(0x9a5418), caramelDeep = C(0x6e3a10);
  const mallowWhite = C(0xfbf6ef), mallowGold = C(0xe6ad62), mallowBrown = C(0x8a5426);
  const mangoStem = C(0x5b4220), mangoGreen = C(0x8fb33e), mangoGold = C(0xf7c534), mangoOrange = C(0xf39a2b), mangoRed = C(0xe0503a), mangoFreckle = C(0xfff0b8);
  const c = new THREE.Color(), f = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / s.width, y = p.getY(i) / s.height, z = p.getZ(i) / s.depth;
    if (s.shape === "foam") {
      const t = THREE.MathUtils.clamp((y + 0.25) / 1.15, 0, 1);
      if (t < 0.35) c.copy(cream).lerp(gold, t / 0.35);
      else if (t < 0.75) c.copy(gold).lerp(orange, (t - 0.35) / 0.4);
      else c.copy(orange).lerp(brown, (t - 0.75) / 0.25);
      c.lerp(crumb, Math.min(1, breadScore(Math.atan2(z, x), y).groove * 0.85));
      c.multiplyScalar(0.94 + 0.12 * (0.5 + 0.25 * Math.sin(x * 7 + z * 5) + 0.25 * Math.sin(y * 9 - x * 4 + 1.3))); // slight browning mottle
    } else if (s.shape === "tomato") {
      c.copy(tomatoRed).lerp(tomatoDeep, THREE.MathUtils.smoothstep(-y, 0.1, 1) * 0.35);
      const top = Math.hypot(x, z), star = Math.abs(Math.cos(Math.atan2(z, x) * 2.5)), edge = 0.12 + 0.2 * star * star;
      // a soft-edged calyx (a hard cut showed steps once squashed)
      if (y > 0.5) c.lerp(leaf.clone().multiplyScalar(0.85 + 0.15 * star), THREE.MathUtils.smoothstep(edge + 0.04 - top, 0, 0.08) * THREE.MathUtils.smoothstep(y, 0.5, 0.62));
    } else if (s.shape === "strawberry") {
      // red, a touch paler up under the leaves, deeper towards the tip
      c.copy(berryRed).lerp(berryDeep, THREE.MathUtils.smoothstep(-y, -0.2, 1) * 0.45).lerp(berryPale, THREE.MathUtils.smoothstep(y, 0.45, 0.85) * 0.35);
      // seeds in staggered rows over the body: a yellow seed sitting in a slightly darker pit
      const a = Math.atan2(z, x) / (Math.PI * 2) + 0.5, row = (y + 1) * 6.5;
      const ri = Math.floor(row), u = a * 16 + (ri % 2) * 0.5, du = u - Math.floor(u) - 0.5, dv = row - ri - 0.5;
      const d = Math.hypot(du * 1.15, dv);
      if (y < 0.72) {
        if (d < 0.28) c.multiplyScalar(0.82);
        if (d < 0.13) c.copy(berrySeed);
      }
      // the calyx: seven pointed green sepals spreading out from the stem, and the stem itself
      const top = Math.hypot(x, z), ang = Math.atan2(z, x), petal = Math.pow(Math.abs(Math.cos(ang * 3.5)), 2.2);
      if (y > 0.42 && top < 0.2 + 0.62 * petal * THREE.MathUtils.smoothstep(y, 0.42, 0.75)) c.copy(leaf).multiplyScalar(0.8 + 0.28 * petal); // big leafy calyx
      if (y > 0.75 && top < 0.08) c.copy(leaf).multiplyScalar(0.7);
    } else if (s.shape === "pudding") {
      // custard with a glossy caramel top running a little down the sides
      const drip = 0.68 - 0.08 * Math.max(0, Math.sin(Math.atan2(z, x) * 7));
      c.copy(custard).lerp(custardDeep, THREE.MathUtils.smoothstep(-y, 0, 1) * 0.25);
      if (y > drip) c.copy(caramel).lerp(caramelDeep, THREE.MathUtils.smoothstep(y, drip, 1) * 0.5);
    } else if (s.shape === "marshmallow") {
      // a toasted marshmallow (owner, 2026-11-20: plain white did not read as one): pale sides, a golden-brown top and bottom that
      // darken towards the rim where the flame caught it, a few darker scorched blotches
      const cap = THREE.MathUtils.smoothstep(Math.abs(y), 0.3, 0.8);
      const blotch = 0.5 + 0.5 * Math.sin(x * 9.1 + z * 6.3) * Math.sin(z * 8.7 - x * 4.1 + y * 3.3);
      const rim = THREE.MathUtils.smoothstep(Math.hypot(x, z), 0.55, 1) * cap;
      c.copy(mallowWhite).lerp(mallowGold, Math.min(1, cap * (0.8 + 0.2 * blotch)));
      c.lerp(mallowBrown, Math.min(0.9, cap * 0.35 + rim * 0.6 + (blotch > 0.8 ? (blotch - 0.8) * 3 * cap : 0)));
      // the sides pick up a soft golden tint near the toasted edges
      c.lerp(mallowGold, THREE.MathUtils.smoothstep(Math.abs(y), 0.1, 0.4) * (1 - cap) * 0.55);
    } else if (s.shape === "tofu" || s.shape === "butter") {
      c.copy(new THREE.Color(s.color)).multiplyScalar(0.94 + 0.06 * THREE.MathUtils.smoothstep(y, -1, 1));
      if (s.shape === "tofu") c.multiplyScalar(0.95 + 0.06 * Math.sin(x * 41 + z * 29) * Math.sin(y * 37 - x * 17)); // a faint mottle
    } else if (s.shape === "mango") {
      const sd = Math.hypot(x - MANGO_STEM.x * 1.1, y - MANGO_STEM.y * 0.95, z - MANGO_STEM.z);
      // mango skin: green round the stem end (right top), golden yellow through the middle, orange to the beak, a red blush on
      // the sunny top, a few pale freckles
      const t = THREE.MathUtils.clamp((x + 1) / 2, 0, 1);
      if (t < 0.45) c.copy(mangoOrange).lerp(mangoGold, t / 0.45);
      else c.copy(mangoGold).lerp(mangoGreen, THREE.MathUtils.smoothstep(t, 0.5, 0.88) * THREE.MathUtils.smoothstep(y, -0.9, 0.3));
      const blush = THREE.MathUtils.smoothstep(y, 0.05, 0.85) * (1 - Math.abs(x - 0.1) * 0.7) * (0.75 + 0.25 * Math.sin(x * 5 + z * 3));
      c.lerp(mangoRed, THREE.MathUtils.clamp(blush * 1.15, 0, 0.85));
      c.multiplyScalar(1 - 0.12 * THREE.MathUtils.smoothstep(-y, 0.2, 1)); // the shaded underside
      const freckle = Math.sin(x * 61 + y * 17) * Math.sin(z * 53 - x * 23) * Math.sin(y * 47 + z * 11);
      if (freckle > 0.94) c.lerp(mangoFreckle, 0.22); // few and faint (they read as stripes)
      if (sd < 0.2) c.lerp(mangoGreen.clone().multiplyScalar(0.7), 1 - sd / 0.2); // a darker green ring round the stem
      if (sd < 0.085) c.copy(mangoStem);
    } else {
      c.copy(white).lerp(shade, THREE.MathUtils.smoothstep(-y, 0.3, 0.9) * 0.55);
      const k = z > 0 ? mochiK(x, y) : 9;
      if (k < 1.05) {
        const r = Math.min(k, 1);
        if (r < 0.55) f.copy(flesh).lerp(pinkMid, r / 0.55);
        else f.copy(pinkMid).lerp(pinkEdge, (r - 0.55) / 0.45);
        f.multiplyScalar(1 - 0.1 * THREE.MathUtils.smoothstep(r, 0.86, 1)); // the shaded inner edge of the lip
        f.multiplyScalar(0.96 + 0.06 * Math.sin(Math.atan2(y - 0.05, x) * 14)); // radial fibres of the peach
        c.lerp(f, 1 - THREE.MathUtils.smoothstep(k, 0.985, 1.03));
      }
    }
    c.toArray(colors, i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}
export function bodyGeometry(s: FidgetSpec) {
  if (s.shape === "chocolate") {
    // the soft pink core behind the chocolate pieces: a plate as wide and tall as the bar, a little thinner than it
    const w = s.width * 2 * 0.985,
      h = s.height * 2 * 0.985,
      d = s.depth * 2 - BAR.shellThickness;
    // an evenly subdivided rounded slab (RoundedBoxGeometry packs its vertices into the rounded edges and leaves the big front
    // face as one flat quad, which cannot show a dent — the shards stuck on it then sank out of sight)
    const g = roundedSlab(w, h, d, 0.05, 44, 60, 8);
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
  // foam (모닝빵) and mochi (찹쌀떡) get a finer grid: the score lines / the filling window need the vertices
  // painted fruit (tomato calyx, strawberry seeds, pudding caramel) needs a finer grid too, or a big squash shows the paint in steps
  const fine = ["tomato", "strawberry", "pudding"].includes(s.shape);
  const g = new THREE.SphereGeometry(1, s.shape === "foam" ? 120 : s.shape === "mochi" ? 144 : fine ? 128 : 72, s.shape === "foam" ? 64 : s.shape === "mochi" ? 80 : fine ? 80 : 48),
    p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const theta = Math.atan2(z, x);
    if (s.shape === "foam" || s.shape === "soap") {
      const pow = s.shape === "soap" ? 0.5 : 0.8; // foam: a rounded dome (the old 0.38 made a box)
      x = Math.sign(x) * Math.pow(Math.abs(x), pow);
      y = Math.sign(y) * Math.pow(Math.abs(y), pow);
      z = Math.sign(z) * Math.pow(Math.abs(z), pow);
      if (s.shape === "foam") {
        // a soft bread roll: the dome narrows towards the top, six score lines run down from the top and fade out at mid height
        const sc = breadScore(Math.atan2(z, x), y);
        const k = 1 - 0.3 * Math.max(0, y) ** 1.4 - 0.07 * sc.groove + 0.02 * sc.lobe;
        x *= k;
        z *= k;
        y *= 1 - 0.035 * sc.groove;
      }
    }
    if (s.shape === "tomato") {
      // a ripe tomato: a little squat, five soft lobes, a dip at the stem
      const lobe = 1 + 0.045 * Math.cos(theta * 5) * (1 - y * y);
      x *= lobe;
      z *= lobe;
      y -= 0.12 * Math.exp(-(x * x + z * z) / 0.06) * Math.max(0, y);
    }
    if (s.shape === "strawberry") {
      // a strawberry (redone, owner 2026-11-20): round, wide shoulders near the top, tapering to a pointed tip at the bottom; a
      // shallow dip round the stem with a small green stem nub standing up in it
      const t = THREE.MathUtils.clamp((y + 1) / 2, 0, 1); // 0 tip … 1 top
      // the profile radius at this height: grows from the tip, widest high up, rounding over at the shoulders
      const r = Math.pow(t, 0.6) * Math.pow(Math.max(0, 1 - Math.pow(t, 4.5)), 0.32) * 1.12; // rounded shoulders, closed top
      const rr = Math.hypot(x, z);
      if (rr > 1e-6) { x = (x / rr) * r; z = (z / rr) * r; }
      const top = Math.hypot(x, z);
      y -= 0.1 * Math.exp(-(top * top) / 0.06) * Math.max(0, y); // the dip round the stem
      if (y > 0.6 && top < 0.07) y += 0.18 * (1 - top / 0.07); // the stem nub
      y = y * 0.98 - 0.02;
    }
    if (s.shape === "pudding") {
      // a custard pudding turned out of a fluted mould (owner, 2026-11-20): narrow top, wide base, vertical ridges all round
      // the sides, a flat top and a flat bottom
      y = Math.sign(y) * Math.pow(Math.abs(y), 0.4);
      const ty = THREE.MathUtils.clamp((y + 1) / 2, 0, 1); // 0 base … 1 top
      const rr = Math.hypot(x, z);
      if (rr > 1e-6) {
        const side = 1 - THREE.MathUtils.smoothstep(Math.abs(y), 0.88, 1); // ridges fade out at the top and bottom rims
        const ridge = 1 + 0.07 * Math.cos(theta * 12) * side;
        const r = Math.pow(rr, 0.35) * (1 - 0.4 * ty) * ridge;
        x = (x / rr) * r;
        z = (z / rr) * r;
      }
    }
    if (s.shape === "marshmallow" || s.shape === "tofu" || s.shape === "butter") {
      // marshmallow: a soft rounded cylinder · tofu / butter: soft-edged blocks
      if (s.shape === "marshmallow") {
        y = Math.sign(y) * Math.pow(Math.abs(y), 0.4);
        const r = Math.hypot(x, z) || 1, k = Math.pow(r, 0.55) / r;
        x *= k;
        z *= k;
      } else {
        const pow = s.shape === "tofu" ? 0.16 : 0.28; // tofu: sharper corners (owner, 2026-11-20; was 0.32)
        // tofu: a curd surface, not a smooth block — small uneven bumps all over (owner, 2026-11-20)
        const rough = s.shape === "tofu" ? 1 + 0.006 * (Math.sin(x * 67 + y * 23) * Math.sin(y * 59 - z * 31) + 0.7 * Math.sin(z * 73 + x * 41)) : 1;
        x = Math.sign(x) * Math.pow(Math.abs(x), pow) * rough;
        y = Math.sign(y) * Math.pow(Math.abs(y), pow) * rough;
        z = Math.sign(z) * Math.pow(Math.abs(z), pow) * rough;
      }
    }
    if (s.shape === "mango") {
      // a whole mango lying on its side (owner, 2026-11-20: it read as foie gras): a plump kidney — rounder shoulder at the stem
      // end (right), the other end narrowing and dipping into the little beak, a flatter belly and slightly flattened sides
      // the stem at the green shoulder (right, a little up): a small raised nub (painted brown in paintBody, owner 2026-11-20)
      const sd = Math.hypot(x - MANGO_STEM.x, y - MANGO_STEM.y, z - MANGO_STEM.z);
      if (sd < 0.16) { const k = 1 + 0.07 * (1 - (sd / 0.16) ** 2); x *= k; y *= k; z *= k; }
      const beak = Math.max(0, -x - 0.15);
      y = y * (0.86 + 0.14 * x) - 0.5 * beak * beak - 0.05 * x * x; // the beak end lower and slimmer, the stem end fuller
      y = Math.min(y, 0.96);
      z *= 0.9 - 0.12 * beak;
      x *= 1.06 + 0.04 * Math.max(0, y);
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
      // peach mochi: the white skin is cut open on the front and the pink filling sits a little below the lip
      if (z > 0) {
        const k = mochiK(x, y);
        z += 0.04 * Math.exp(-(((k - 1.1) / 0.1) ** 2)) - 0.085 * (1 - THREE.MathUtils.smoothstep(k, 0.55, 0.98)); // lip bulges, filling sinks
      }
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
  /** outer surface area of each patch (irregular wax shells: the share of the shell broken is measured by area) */
  areas?: number[];
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

/** small deterministic PRNG (mulberry32): the same irregular shell on every launch */
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * Voronoi seeds on the unit sphere for a wax shell that breaks unevenly: a few broad plates (seeds kept far apart) cut up by
 * several shatter zones where many seeds crowd together into small chips — instead of an even Fibonacci net of equal cells.
 */
export function irregularShellSeeds(count: number, seed = 0x5eed): THREE.Vector3[] {
  const rnd = prng(seed);
  const unit = () => {
    const y = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  const seeds: THREE.Vector3[] = [];
  const place = (p: THREE.Vector3, gap: number) => seeds.every((s) => s.distanceTo(p) >= gap) && seeds.push(p);
  const plates = Math.round(count * 0.2);
  for (let tries = 0; seeds.length < plates && tries < 20000; tries++) place(unit(), 0.55);
  const hubs = Array.from({ length: 6 }, unit);
  for (let gap = 0.12; seeds.length < count; gap *= 0.85)
    for (let tries = 0; seeds.length < count && tries < 4000; tries++) {
      const hub = hubs[Math.floor(rnd() * hubs.length)];
      // most chips gather around a shatter zone (tighter near its middle), the rest land anywhere
      const p = rnd() < 0.8 ? hub.clone().addScaledVector(unit(), 0.45 * rnd() * rnd()).normalize() : unit();
      place(p, gap);
    }
  return seeds;
}
/** Closed curved Voronoi wax cells: straight fracture boundaries, real pale cut edges. */
export function shellPatches(
  _source: THREE.BufferGeometry,
  spec: FidgetSpec,
): ShellPatches {
  if (spec.shape === "chocolate") return chocolateBarPatches(spec);
  // small pieces (owner, 2026-11-20 "자잘하게"): 220 plates on the apple (was 104)
  // (the toasted marshmallow: a crisp crust of 160 flakes, owner 2026-11-20)
  const count = spec.shape === "apple" ? 220 : spec.shape === "marshmallow" ? 160 : 42,
    positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    ids: number[] = [],
    vertices = Array.from({ length: count }, () => [] as number[]),
    centers: THREE.Vector3[] = [],
    areas = new Array<number>(count).fill(0);
  const seeds = irregularShellSeeds(count);
  const outerColor = new THREE.Color(spec.color),
    innerColor = new THREE.Color(spec.shape === "apple" ? 0xf0e9cc : spec.shape === "marshmallow" ? 0xfbf3e4 : 0x9d7660),
    rimColor = innerColor.clone().lerp(outerColor, 0.2),
    thickness = spec.shape === "apple" ? 0.025 : spec.shape === "marshmallow" ? 0.03 : 0.05;
  // marshmallow: each flake of the crust toasted a little differently, golden to scorched brown, darker towards the caps
  const toastGold = new THREE.Color(0xf1cf98), toastBrown = new THREE.Color(0xb06f33);
  const flakeColor = (seed: THREE.Vector3, patch: number) => {
    if (spec.shape !== "marshmallow") return outerColor;
    const r = Math.abs(Math.sin(patch * 12.9898) * 43758.5453) % 1;
    return toastGold.clone().lerp(toastBrown, Math.min(1, 0.05 + 0.6 * Math.pow(Math.abs(seed.y), 1.6) + 0.18 * r));
  };
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
    } else if (spec.shape === "marshmallow") {
      // the same soft cylinder as the core (bodyGeometry)
      y = Math.sign(y) * Math.pow(Math.abs(y), 0.4);
      const rr = Math.hypot(x, z);
      if (rr > 1e-6) { const k = Math.pow(rr, 0.55) / rr; x *= k; z *= k; }
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
    const flake = flakeColor(seed, patch);
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
        // a ring halfway out keeps a broad plate on the curved surface instead of a flat fan sinking below it
        const ma = seed.clone().lerp(ua, 0.5).normalize(),
          mb = seed.clone().lerp(ub, 0.5).normalize(),
          oma = shape(ma),
          omb = shape(mb),
          ima = shape(ma, true),
          imb = shape(mb, true);
        emit(shape(seed), oma, omb, patch, flake, true);
        emit(oma, oa, ob, patch, flake, true);
        emit(oma, ob, omb, patch, flake, true);
        const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
        areas[patch] += tri(shape(seed), oma, omb) + tri(oma, oa, ob) + tri(oma, ob, omb);
        emit(shape(seed, true), imb, ima, patch, innerColor, true, true);
        emit(ima, ib, ia, patch, innerColor, true, true);
        emit(ima, imb, ib, patch, innerColor, true, true);
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
  return { geometry, centers, vertices, faceToPatch: new Uint16Array(ids), areas };
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
