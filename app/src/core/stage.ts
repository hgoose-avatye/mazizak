import * as THREE from 'three';

/**
 * The little stage every toy stands on (quality pass, 2026-11-20): a soft key light behind the toy on the backdrop, and a round
 * cushion mat under it, so the toy is placed somewhere instead of floating on a flat page colour.
 *
 * - stageBackdrop(color): screen-space background texture. Its top and bottom rows are exactly `color`, which main.ts also gives
 *   the page around the canvas (--stage-bg), so the header area and the dock's corners meet the canvas without a seam. Brighter
 *   behind the toy, a little darker toward the sides in the middle band.
 * - stageMat(color, radius): a flat disc on the floor (y = 0) drawn as a mat seen from the front: a lighter top face, a thin
 *   darker edge that is thicker at the front (reads as thickness at the camera's 20° angle), and a soft shadow around it.
 *   Splats, crumbs and puddles still land on the same floor, on or off the mat.
 */
const hex = (c: THREE.Color) => `#${c.getHexString()}`;
const mix = (a: THREE.Color, b: THREE.Color | number, t: number) => a.clone().lerp(new THREE.Color(b), t);

const backdrops = new Map<number, THREE.Texture>();
export function stageBackdrop(color: number): THREE.Texture {
  const hit = backdrops.get(color);
  if (hit) return hit;
  const base = new THREE.Color(color);
  const W = 128, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = hex(base);
  g.fillRect(0, 0, W, H);
  // key light behind the toy (fades out before the top row, so the top stays `color`)
  const glow = g.createRadialGradient(W / 2, H * 0.47, 0, W / 2, H * 0.47, H * 0.42);
  glow.addColorStop(0, hex(mix(base, 0xffffff, 0.55)));
  glow.addColorStop(0.55, `rgba(${Math.round(mix(base, 0xffffff, 0.3).r * 255)},${Math.round(mix(base, 0xffffff, 0.3).g * 255)},${Math.round(mix(base, 0xffffff, 0.3).b * 255)},0.55)`);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  // the sides darken a little in the middle band only: the top AND bottom rows stay exactly `color`, because the page shows that
  // colour around the canvas (above it, and beside the dock's rounded top corners) and any other edge colour shows as a cut there
  const dark = mix(base, 0x1c2a24, 0.09);
  const rgba = (a: number) => `rgba(${Math.round(dark.r * 255)},${Math.round(dark.g * 255)},${Math.round(dark.b * 255)},${a})`;
  const side = document.createElement('canvas');
  side.width = W; side.height = H;
  const s = side.getContext('2d')!;
  const sides = s.createLinearGradient(0, 0, W, 0);
  sides.addColorStop(0, rgba(0.8)); sides.addColorStop(0.3, rgba(0)); sides.addColorStop(0.7, rgba(0)); sides.addColorStop(1, rgba(0.8));
  s.fillStyle = sides;
  s.fillRect(0, 0, W, H);
  s.globalCompositeOperation = 'destination-in';
  const mask = s.createLinearGradient(0, 0, 0, H);
  mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(0.45, 'rgba(0,0,0,1)'); mask.addColorStop(0.7, 'rgba(0,0,0,1)'); mask.addColorStop(1, 'rgba(0,0,0,0)');
  s.fillStyle = mask;
  s.fillRect(0, 0, W, H);
  g.drawImage(side, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  backdrops.set(color, t);
  return t;
}

const mats = new Map<number, THREE.Texture>();
function matTexture(color: number): THREE.Texture {
  const hit = mats.get(color);
  if (hit) return hit;
  const base = new THREE.Color(color);
  const N = 512, C = N / 2;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const R = N * 0.5;
  // soft shadow around the mat, a little toward the front (canvas bottom = toward the camera)
  const sh = g.createRadialGradient(C, C + R * 0.05, R * 0.78, C, C + R * 0.05, R);
  const ink = mix(base, 0x1c2a24, 0.55);
  const ic = (a: number) => `rgba(${Math.round(ink.r * 255)},${Math.round(ink.g * 255)},${Math.round(ink.b * 255)},${a})`;
  sh.addColorStop(0, ic(0.32)); sh.addColorStop(0.45, ic(0.12)); sh.addColorStop(1, ic(0));
  g.fillStyle = sh;
  g.fillRect(0, 0, N, N);
  // the edge (side of the cushion): shifted to the front so it is thick there and thin at the back
  g.fillStyle = hex(mix(base, 0x5f7a70, 0.4));
  g.beginPath(); g.arc(C, C + R * 0.035, R * 0.84, 0, Math.PI * 2); g.fill();
  // top face: lighter than the room, brightest in the middle
  const top = g.createRadialGradient(C, C - R * 0.1, 0, C, C, R * 0.8);
  top.addColorStop(0, hex(mix(base, 0xffffff, 0.62)));
  top.addColorStop(0.75, hex(mix(base, 0xffffff, 0.42)));
  top.addColorStop(1, hex(mix(base, 0xffffff, 0.3)));
  g.fillStyle = top;
  g.beginPath(); g.arc(C, C, R * 0.8, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  mats.set(color, t);
  return t;
}

/** The mat under a toy of `radius` (world units, the toy's half width); its top face is ~radius × 1.12 across. */
export function stageMat(color: number, radius: number): THREE.Mesh {
  const size = radius * 1.4 * 2; // the texture's top face is 80% of its half size
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: matTexture(color), transparent: true, depthWrite: false, toneMapped: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.004;
  m.renderOrder = -1;
  m.name = 'stage-mat';
  return m;
}
