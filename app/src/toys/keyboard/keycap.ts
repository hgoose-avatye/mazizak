import * as THREE from 'three';

/**
 * Procedural keycap / case geometry for the keyboard toy.
 *
 * Both shapes are "lofted rounded rectangles": every cross-section is a rounded
 * rectangle sampled with the SAME point layout (corner arcs + straight-edge
 * points), so consecutive sections join with simple quad strips and flat parts
 * collapse cleanly to a centre line.
 */

export interface KeycapOptions {
  width: number;
  depth: number;
  height: number;
  /** top face size ratio (sharp-profile top vs bottom footprint, measured on the short side). default 0.78 */
  topScale?: number;
  /** depth of the concave top dish. default 0.04 * min(width, depth) */
  dish?: number;
  /** bottom corner radius. default 0.12 * min(width, depth) */
  radius?: number;
  /** quality: corner arc segments; edges/rings scale from it. default 6 */
  segments?: number;
}

// ---------------------------------------------------------------------------
// rounded-rect ring sampling

interface RingLayout {
  corner: number; // segments per corner arc (corner+1 points)
  ex: number; // interior points on the ±z edges (running along x)
  ez: number; // interior points on the ±x edges (running along z)
  n: number; // total points per ring
}

function makeLayout(corner: number, ex: number, ez: number): RingLayout {
  return { corner, ex, ez, n: 4 * (corner + 1) + 2 * ex + 2 * ez };
}

/**
 * Points of a rounded rect (half sizes hx, hz, corner radius rad), CCW in the
 * x→z sense. Writes [x, z, nx, nz] per point (n = outward 2D normal).
 */
function ring(L: RingLayout, hx: number, hz: number, rad: number, out: Float64Array): Float64Array {
  rad = Math.max(0, Math.min(rad, hx, hz));
  const cx = hx - rad;
  const cz = hz - rad;
  let k = 0;
  const put = (x: number, z: number, nx: number, nz: number) => {
    out[k++] = x;
    out[k++] = z;
    out[k++] = nx;
    out[k++] = nz;
  };
  const corners: [number, number][] = [
    [cx, cz],
    [-cx, cz],
    [-cx, -cz],
    [cx, -cz],
  ];
  for (let c = 0; c < 4; c++) {
    const [ox, oz] = corners[c];
    for (let j = 0; j <= L.corner; j++) {
      const a = (c + j / L.corner) * (Math.PI / 2);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      put(ox + rad * ca, oz + rad * sa, ca, sa);
    }
    // straight edge to the next corner (both ends sit on the shared tangent line)
    const a = ((c + 1) * Math.PI) / 2;
    const dx = Math.round(Math.cos(a));
    const dz = Math.round(Math.sin(a));
    const [nxC, nzC] = corners[(c + 1) % 4];
    const sx = ox + rad * dx;
    const sz = oz + rad * dz;
    const tx = nxC + rad * dx;
    const tz = nzC + rad * dz;
    const cnt = c % 2 === 0 ? L.ex : L.ez;
    for (let j = 1; j <= cnt; j++) {
      const t = j / (cnt + 1);
      put(sx + (tx - sx) * t, sz + (tz - sz) * t, dx, dz);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2D profile with filleted corners: (r = outward offset, y) + analytic normals

interface ProfilePt {
  r: number;
  y: number;
  nr: number;
  ny: number;
}

/** pts: polyline corners; rad[i] = fillet radius at interior corner i (0 = sharp, duplicated normal). */
function filletProfile(pts: [number, number][], rad: number[], segs: number): ProfilePt[] {
  const out: ProfilePt[] = [];
  const segNormal = (a: [number, number], b: [number, number]): [number, number] => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l];
  };
  {
    const n = segNormal(pts[0], pts[1]);
    out.push({ r: pts[0][0], y: pts[0][1], nr: n[0], ny: n[1] });
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1];
    const B = pts[i];
    const C = pts[i + 1];
    const n1 = segNormal(A, B);
    const n2 = segNormal(B, C);
    const r = rad[i] ?? 0;
    if (r <= 0) {
      out.push({ r: B[0], y: B[1], nr: n1[0], ny: n1[1] });
      out.push({ r: B[0], y: B[1], nr: n2[0], ny: n2[1] });
      continue;
    }
    const l1 = Math.hypot(A[0] - B[0], A[1] - B[1]);
    const l2 = Math.hypot(C[0] - B[0], C[1] - B[1]);
    const d1: [number, number] = [(A[0] - B[0]) / l1, (A[1] - B[1]) / l1];
    const d2: [number, number] = [(C[0] - B[0]) / l2, (C[1] - B[1]) / l2];
    const cosA = Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1]));
    const half = Math.acos(cosA) / 2;
    const t = Math.min(r / Math.tan(half), l1 * 0.999, l2 * 0.999);
    const rr = t * Math.tan(half);
    const bis = [d1[0] + d2[0], d1[1] + d2[1]];
    const bl = Math.hypot(bis[0], bis[1]);
    const cdist = rr / Math.sin(half);
    const cx = B[0] + (bis[0] / bl) * cdist;
    const cy = B[1] + (bis[1] / bl) * cdist;
    const T1 = [B[0] + d1[0] * t, B[1] + d1[1] * t];
    const T2 = [B[0] + d2[0] * t, B[1] + d2[1] * t];
    const a1 = Math.atan2(T1[1] - cy, T1[0] - cx);
    let da = Math.atan2(T2[1] - cy, T2[0] - cx) - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    // convex corner: normal points away from centre; concave: towards it
    const sign = (T1[0] - cx) * n1[0] + (T1[1] - cy) * n1[1] > 0 ? 1 : -1;
    for (let j = 0; j <= segs; j++) {
      const a = a1 + (da * j) / segs;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      out.push({ r: cx + rr * ca, y: cy + rr * sa, nr: ca * sign, ny: sa * sign });
    }
  }
  {
    const n = segNormal(pts[pts.length - 2], pts[pts.length - 1]);
    const P = pts[pts.length - 1];
    out.push({ r: P[0], y: P[1], nr: n[0], ny: n[1] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// mesh builder

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  vert(x: number, y: number, z: number, u: number, v: number, nx: number, ny: number, nz: number): number {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  /** quad strip between rings a and b (same length n, closed loop). Profile goes a→b. */
  strip(a: number, b: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      const a0 = a + i;
      const a1 = a + i1;
      const b0 = b + i;
      const b1 = b + i1;
      this.idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  build(groups: [number, number][]): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const nv = this.pos.length / 3;
    g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    groups.forEach(([start, count], i) => g.addGroup(start, count, i));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------------------
// keycap

/**
 * Sculpted Cherry/OEM-like keycap. Origin = bottom centre, +y up.
 * group 0 = sides + bottom rim, group 1 = top face (uv 0..1 across the top,
 * u → +x, v → -z, i.e. upright when viewed from the front (+z)).
 */
export function createKeycapGeometry(o: KeycapOptions): THREE.BufferGeometry {
  const W = o.width;
  const D = o.depth;
  const H = o.height;
  const minS = Math.min(W, D);
  const topScale = o.topScale ?? 0.78;
  const dish = o.dish ?? 0.04 * minS;
  const R = o.radius ?? 0.12 * minS;
  const seg = Math.max(2, Math.round(o.segments ?? 6));

  const hw = W / 2;
  const hd = D / 2;
  const taper = ((1 - topScale) * minS) / 2; // per side, same on all sides
  const fillet = Math.min(0.11 * minS, H * 0.3, (minS / 2 - taper) * 0.5);
  const rTop = Math.min(R * 1.25, (minS / 2 - taper) * 0.9); // top corners a bit rounder

  // edge point counts proportional to straight edge length
  const edgePts = (len: number) => Math.max(1, Math.ceil(((seg * 0.75) * len) / minS));
  const L = makeLayout(seg, edgePts(W - 2 * R), edgePts(D - 2 * R));
  const N = L.n;

  // side profile: (0,0) → (-taper, H) → inward; fillet at the shoulder
  const prof = filletProfile(
    [
      [0, 0],
      [-taper, H],
      [-taper - minS, H],
    ],
    [0, fillet],
    Math.max(3, seg - 1),
  );
  prof.pop(); // drop the far end; top face handled separately
  // insert a mid ring on the straight side for nicer normal interpolation
  const sideProf: ProfilePt[] = [prof[0], { ...prof[0], r: (prof[0].r + prof[1].r) / 2, y: (prof[0].y + prof[1].y) / 2 }, ...prof.slice(1)];
  const rimR = sideProf[sideProf.length - 1].r; // offset of the top-face rim
  const hxT = hw + rimR;
  const hzT = hd + rimR;
  const radAt = (y: number) => {
    const s = y / H;
    return R + (rTop - R) * s;
  };
  const rimRad = Math.max(0, radAt(H) + (rimR + taper)); // follow the fillet offset at the very top

  // dish: cylindrical across the short axis (x for ~1u keys, z for wide keys), small spherical blend
  const wide = W > D * 1.5;
  const dishAt = (x: number, z: number) => {
    const nx = Math.min(1, Math.abs(x) / hxT);
    const nz = Math.min(1, Math.abs(z) / hzT);
    const nc = wide ? nz : nx;
    const nl = wide ? nx : nz;
    return dish * (1 - nc * nc) * (0.8 + 0.2 * (1 - nl * nl));
  };
  // analytic normal of y = H - dishAt(x, z): normalize(∂dish/∂x, 1, ∂dish/∂z)
  const dishNormal = (x: number, z: number, out: THREE.Vector3) => {
    const hc = wide ? hzT : hxT;
    const hl = wide ? hxT : hzT;
    const c = Math.max(-hc, Math.min(hc, wide ? z : x));
    const l = Math.max(-hl, Math.min(hl, wide ? x : z));
    const nc = c / hc;
    const nl = l / hl;
    const dC = dish * ((-2 * c) / (hc * hc)) * (0.8 + 0.2 * (1 - nl * nl));
    const dL = dish * (1 - nc * nc) * 0.2 * ((-2 * l) / (hl * hl));
    return wide ? out.set(dL, 1, dC).normalize() : out.set(dC, 1, dL).normalize();
  };
  const tmpN = new THREE.Vector3();

  const b = new Builder();
  const buf = new Float64Array(N * 4);

  // top rim point positions (for dish offsets on the side rings)
  const rimPts = Float64Array.from(ring(L, hxT, hzT, rimRad, buf));
  const rimDish = new Float64Array(N);
  for (let i = 0; i < N; i++) rimDish[i] = dishAt(rimPts[i * 4], rimPts[i * 4 + 1]);

  // --- group 0: bottom rim annulus (hard edge) + sides + shoulder fillet
  const wall = 0.07 * minS;
  const inner = b.pos.length / 3;
  ring(L, hw - wall, hd - wall, R - wall, buf);
  for (let i = 0; i < N; i++) b.vert(buf[i * 4], 0, buf[i * 4 + 1], 0, 0, 0, -1, 0);
  const outer = b.pos.length / 3;
  ring(L, hw, hd, R, buf);
  for (let i = 0; i < N; i++) b.vert(buf[i * 4], 0, buf[i * 4 + 1], 0, 0, 0, -1, 0);
  b.strip(inner, outer, N);

  const sideRings: number[] = [];
  for (let k = 0; k < sideProf.length; k++) {
    const { r, y, nr, ny } = sideProf[k];
    const isRim = k === sideProf.length - 1;
    const s = y / H;
    // corner radius: lerp along the straight side, then offset through the fillet
    const isFillet = k >= 2;
    const rad = isFillet ? radAt(H) + (r + taper) : radAt(y);
    ring(L, hw + r, hd + r, rad, buf);
    const start = b.pos.length / 3;
    for (let i = 0; i < N; i++) {
      const x = buf[i * 4];
      const z = buf[i * 4 + 1];
      if (isRim) dishNormal(x, z, tmpN);
      else tmpN.set(buf[i * 4 + 2] * nr, ny, buf[i * 4 + 3] * nr);
      b.vert(x, y - rimDish[i] * s, z, i / N, s, tmpN.x, tmpN.y, tmpN.z);
    }
    sideRings.push(start);
  }
  for (let k = 0; k + 1 < sideRings.length; k++) b.strip(sideRings[k], sideRings[k + 1], N);
  const sideIdxCount = b.idx.length;

  // --- group 1: top face, concentric rings collapsing to a centre line
  const K = seg;
  const mT = Math.min(hxT, hzT);
  let prev = -1;
  for (let k = 0; k <= K; k++) {
    const t = k / K;
    const off = mT * t;
    ring(L, hxT - off, hzT - off, rimRad * (1 - t), buf);
    const start = b.pos.length / 3;
    for (let i = 0; i < N; i++) {
      const x = buf[i * 4];
      const z = buf[i * 4 + 1];
      dishNormal(x, z, tmpN);
      b.vert(x, H - dishAt(x, z), z, 0.5 + x / (2 * hxT), 0.5 - z / (2 * hzT), tmpN.x, tmpN.y, tmpN.z);
    }
    if (prev >= 0) b.strip(prev, start, N);
    prev = start;
  }
  const topIdxCount = b.idx.length - sideIdxCount;

  return b.build([
    [0, sideIdxCount],
    [sideIdxCount, topIdxCount],
  ]);
}

// ---------------------------------------------------------------------------
// legend texture

/**
 * Transparent canvas texture with one centred glyph. RGB is premultiplied by
 * alpha (texture.premultiplyAlpha = true) so mipmaps don't get dark fringes:
 * composite as `base * (1 - a) + texel.rgb`.
 */
/** a theme pattern printed on a cap top under its legend (colors.ts KeyTheme) */
export interface CapDeco { pattern: string; ink: string; seed: number; aspect: number }
function drawDeco(g: CanvasRenderingContext2D, size: number, d: CapDeco) {
  let seed = (d.seed * 2654435761) >>> 0 || 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // the texture is stretched `aspect`× across a wide cap (the space bar): keep dots round by squeezing them back
  const sx = 1 / d.aspect;
  const dot = (x: number, y: number, r: number, color = d.ink) => {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(x, y, r * sx, r, 0, 0, Math.PI * 2);
    g.fill();
  };
  g.save();
  switch (d.pattern) {
    case 'speckle': // granite pebble: fine dark and light flecks
      for (let i = 0; i < 150; i++) dot(rnd() * size, rnd() * size, 1 + rnd() * 2.6, rnd() < 0.7 ? d.ink : 'rgba(255,255,255,0.5)');
      break;
    case 'stone': // a smooth sea stone: a few soft pale veins and flecks
      g.strokeStyle = d.ink;
      g.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        let x = rnd() * size, y = rnd() * size;
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 120 * sx; y += (rnd() - 0.3) * 90; g.lineTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 40; i++) dot(rnd() * size, rnd() * size, 1 + rnd() * 1.6);
      break;
    case 'frost': // ice: frosted streaks and sparkles in the corners
      g.strokeStyle = d.ink;
      for (let i = 0; i < 14; i++) {
        const x = rnd() * size, y = rnd() * size, l = 18 + rnd() * 40, a = rnd() * Math.PI;
        g.lineWidth = 1 + rnd() * 2;
        g.beginPath();
        g.moveTo(x - Math.cos(a) * l * sx, y - Math.sin(a) * l);
        g.lineTo(x + Math.cos(a) * l * sx, y + Math.sin(a) * l);
        g.stroke();
      }
      for (const [x, y] of [[0.16, 0.18], [0.84, 0.8], [0.8, 0.2]]) {
        g.lineWidth = 2.5;
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 4, l = 14;
          g.beginPath();
          g.moveTo(x * size - Math.cos(a) * l * sx, y * size - Math.sin(a) * l);
          g.lineTo(x * size + Math.cos(a) * l * sx, y * size + Math.sin(a) * l);
          g.stroke();
        }
      }
      break;
    case 'swirl': // cream: a soft piped swirl
      g.strokeStyle = d.ink;
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath();
      for (let t = 0; t < 14; t += 0.1) {
        const r = 10 + t * 7.5, x = size / 2 + Math.cos(t) * r * sx, y = size / 2 + Math.sin(t) * r * 0.8;
        t ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.globalAlpha = 0.55;
      g.stroke();
      break;
    case 'powder': // marshmallow: a dusting of icing sugar
      for (let i = 0; i < 260; i++) dot(rnd() * size, rnd() * size, 0.8 + rnd() * 1.8);
      break;
    case 'chips': // mint chocolate chips
      for (let i = 0; i < 9; i++) {
        const x = 20 + rnd() * (size - 40), y = 20 + rnd() * (size - 40), r = 6 + rnd() * 7;
        g.fillStyle = d.ink;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + rnd() * 0.5, rr = r * (0.7 + rnd() * 0.5);
          k ? g.lineTo(x + Math.cos(a) * rr * sx, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr * sx, y + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
      }
      break;
    case 'ring': // typewriter key: a silver ring round the face (not on the long space bar — a typewriter's is a plain bar)
      if (d.aspect > 1.5) break;
      g.strokeStyle = d.ink;
      g.lineWidth = 16;
      g.beginPath();
      g.ellipse(size / 2, size / 2, size * 0.42 * sx * (d.aspect > 1 ? d.aspect * 0.92 : 1), size * 0.42, 0, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'blush': { // peach: a rosy blush on one side
      const gr = g.createRadialGradient(size * 0.32, size * 0.7, 4, size * 0.32, size * 0.7, size * 0.62);
      gr.addColorStop(0, d.ink);
      gr.addColorStop(1, 'rgba(255,140,150,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, size, size);
      for (let i = 0; i < 120; i++) dot(rnd() * size, rnd() * size, 0.6 + rnd(), 'rgba(255,255,255,0.35)'); // fuzz
      break;
    }
    case 'bubbles': // stew bubbling: rings of bubbles
      g.strokeStyle = d.ink;
      for (let i = 0; i < 9; i++) {
        const x = rnd() * size, y = rnd() * size, r = 5 + rnd() * 13;
        g.lineWidth = 2.5;
        g.beginPath();
        g.ellipse(x, y, r * sx, r, 0, 0, Math.PI * 2);
        g.stroke();
        dot(x - r * 0.35 * sx, y - r * 0.35, r * 0.18);
      }
      break;
    case 'peaches': { // little peaches scattered over a peach frame / plate (owner, 2026-11-20 "복숭아 패턴")
      for (let i = 0; i < 4; i++) {
        const x = 30 + rnd() * (size - 60), y = 30 + rnd() * (size - 60), r = 12 + rnd() * 6, tilt = (rnd() - 0.5) * 0.8;
        g.save();
        g.translate(x, y);
        g.rotate(tilt);
        const body = g.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r * 1.1);
        body.addColorStop(0, '#ffd2c0');
        body.addColorStop(0.6, '#ff9e94');
        body.addColorStop(1, '#f27a7f');
        g.fillStyle = body;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(214,92,104,0.7)'; // the cleft
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, -r * 0.85);
        g.quadraticCurveTo(r * 0.35, 0, 0, r * 0.7);
        g.stroke();
        g.fillStyle = '#7cc46a'; // the leaf
        g.beginPath();
        g.ellipse(r * 0.45, -r * 0.95, r * 0.45, r * 0.2, -0.6, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      break;
    }
    case 'grain': { // tofu (owner, 2026-11-20 "두부 질감"): a soft mottle of curd, small pressed-in pores, a few pale flecks
      for (let i = 0; i < 18; i++) {
        const x = rnd() * size, y = rnd() * size, r = 18 + rnd() * 34;
        const m = g.createRadialGradient(x, y, 0, x, y, r);
        m.addColorStop(0, 'rgba(205,190,160,0.22)');
        m.addColorStop(1, 'rgba(205,190,160,0)');
        g.fillStyle = m;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 230; i++) {
        const x = rnd() * size, y = rnd() * size, r = 1.2 + rnd() * 2.6;
        dot(x, y, r, d.ink); // a pore
        dot(x - r * 0.35, y - r * 0.35, r * 0.45, 'rgba(255,255,255,0.55)'); // its lit rim
      }
      break;
    }
  }
  g.restore();
}

/** a plate (the floor between the caps) in a theme colour with its pattern tiled over it; `aspect` = plate width / depth */
export function createPlateTexture(color: string, deco: { pattern: string; ink: string; tile?: number }, aspect: number): THREE.CanvasTexture {
  const h = 512, w = Math.round(h * aspect), c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  const tile = deco.tile ?? 170; // smaller tiles = a denser pattern (mint chips: owner, 2026-11-20 "초코칩 더 많이")
  for (let y = 0, k = 0; y < h; y += tile) for (let x = 0; x < w; x += tile, k++) {
    g.save();
    g.translate(x, y);
    g.scale(tile / 256, tile / 256);
    drawDeco(g, 256, { pattern: deco.pattern, ink: deco.ink, seed: 50 + k, aspect: 1 });
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** called when an icon picture has loaded into its cap texture: the toy asks for a frame (the render loop sleeps while idle) */
export const iconLoaded = new Set<() => void>();
/** a picture legend (the theme icons): the cap's pattern, then the icon centred at ~70 % of the cap, drawn once it has loaded */
function iconTexture(canvas: HTMLCanvasElement, g: CanvasRenderingContext2D, size: number, src: string, deco?: CapDeco): THREE.CanvasTexture {
  if (deco) drawDeco(g, size, { ...deco, aspect: 1 });
  const tex = finishLegend(canvas);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    const s = size * 0.72;
    g.drawImage(img, (size - s) / 2, (size - s) / 2 + size * 0.01, s, s);
    tex.needsUpdate = true;
    for (const f of iconLoaded) f();
  };
  img.src = src;
  return tex;
}

export function createLegendTexture(
  text: string,
  o: { color?: string; font?: string; sizeRatio?: number; size?: number; deco?: CapDeco; wide?: number; image?: string } = {},
): THREE.CanvasTexture {
  const size = o.size ?? 256;
  // `wide`: a canvas that many times wider than tall, for a wide cap (the space bar) — its legend can then use the whole width
  // instead of being squeezed into a square in the middle (owner, 2026-11-20: the space bar name was too small)
  const wide = Math.max(1, o.wide ?? 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size * wide);
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  if (o.image) return iconTexture(canvas, g, size, o.image, o.deco);
  if (o.deco) {
    if (['blush', 'swirl', 'ring'].includes(o.deco.pattern)) {
      // one-per-cap patterns (a blush, a piped swirl, a typewriter ring) are drawn once across the whole wide cap — tiled they
      // repeated three times on the space bar (owner, 2026-11-20)
      g.save();
      g.scale(wide, 1);
      drawDeco(g, size, { ...o.deco, aspect: wide });
      g.restore();
    } else {
      // scattered patterns are drawn per square tile across the wide canvas (the canvas has the cap's proportions)
      for (let t = 0; t < Math.ceil(wide); t++) {
        g.save();
        g.translate(t * size, 0);
        drawDeco(g, size, { ...o.deco, aspect: 1, seed: o.deco.seed + t * 17 });
        g.restore();
      }
    }
  }
  const px = Math.round(size * (o.sizeRatio ?? 0.42));
  // (emoji faces too: the theme icons on the middle row)
  g.font = o.font ?? `600 ${px}px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif`;
  g.fillStyle = o.color ?? '#3b362f';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  let m = g.measureText(text);
  const inkW = (m.actualBoundingBoxLeft ?? 0) + (m.actualBoundingBoxRight ?? m.width);
  const room = canvas.width * (wide > 1 ? 0.8 : 0.86);
  if (!o.font && inkW > room) {
    // auto-fit long legends
    g.font = g.font.replace(/\d+px/, `${Math.floor((px * room) / inkW)}px`);
    m = g.measureText(text);
  }
  const asc = m.actualBoundingBoxAscent || px * 0.72;
  const desc = m.actualBoundingBoxDescent || 0;
  const left = m.actualBoundingBoxLeft ?? m.width / 2;
  const right = m.actualBoundingBoxRight ?? m.width / 2;
  // centre the actual ink box
  const x = canvas.width / 2 + (left - right) / 2;
  const y = size / 2 + (asc - desc) / 2;
  g.fillText(text, x, y);
  return finishLegend(canvas);
}

function finishLegend(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true;
  tex.anisotropy = 8; // clamped to the GPU max by three
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// case

/**
 * Machined tray: rounded-rect body, filleted bottom edge, 45° chamfered top
 * outer edge, flat top rim of width `wall`, small inner chamfer, recessed
 * pocket `inset` deep with a filleted floor. Origin = bottom centre.
 * Single group; uv = planar top-down (0..1 across the footprint).
 */
export function createCaseGeometry(o: { width: number; depth: number; height: number; radius: number; wall: number; inset: number }): THREE.BufferGeometry {
  const hw = o.width / 2;
  const hd = o.depth / 2;
  const H = o.height;
  const R = o.radius;
  const wall = Math.min(o.wall, Math.min(hw, hd) * 0.9);
  const inset = Math.min(o.inset, H * 0.95);
  const m = Math.min(hw, hd);
  const cb = Math.min(wall * 0.35, H * 0.2); // outer chamfer
  const ci = Math.min(wall * 0.1, inset * 0.15); // inner chamfer
  const fb = Math.min(H * 0.08, 0.04); // bottom fillet

  const prof = filletProfile(
    [
      [-m, 0],
      [0, 0],
      [0, H - cb],
      [-cb, H],
      [-wall + ci, H],
      [-wall, H - ci],
      [-wall, H - inset],
      [-m, H - inset],
    ],
    [0, fb, cb * 0.18, cb * 0.18, ci * 0.4, ci * 0.4, Math.min(0.03, inset * 0.2), 0],
    4,
  );
  // flat bottom and pocket floor get an extra ring so the fill isn't one long fan
  prof.splice(1, 0, { r: -m * 0.5, y: 0, nr: 0, ny: -1 });
  prof.splice(prof.length - 1, 0, { r: (-m + -wall) / 2, y: H - inset, nr: 0, ny: 1 });

  const edgePts = (len: number) => Math.max(1, Math.ceil((5 * len) / (2 * m)));
  const L = makeLayout(10, edgePts(2 * (hw - R)), edgePts(2 * (hd - R)));
  const N = L.n;
  const buf = new Float64Array(N * 4);
  const b = new Builder();
  let prevStart = -1;
  for (const p of prof) {
    const r = p.r;
    const rad = Math.max(0, R + r);
    ring(L, Math.max(0, hw + r), Math.max(0, hd + r), rad, buf);
    const start = b.pos.length / 3;
    for (let i = 0; i < N; i++) {
      const x = buf[i * 4];
      const z = buf[i * 4 + 1];
      b.vert(x, p.y, z, 0.5 + x / (2 * hw), 0.5 - z / (2 * hd), buf[i * 4 + 2] * p.nr, p.ny, buf[i * 4 + 3] * p.nr);
    }
    if (prevStart >= 0) b.strip(prevStart, start, N);
    prevStart = start;
  }
  const g = b.build([]);
  g.addGroup(0, b.idx.length, 0);
  return g;
}
