import * as THREE from "three";
import type { FidgetSpec } from "./catalog";
import { BAR, barPieceRect } from "./visuals";

/**
 * W02 chocolate bar — state machine and procedural fracture (user design 2026-11-12):
 *   solid      rigid bar; the core barely deforms until a piece's stress threshold is crossed
 *   fracturing a piece snaps (line fracture: its row-mate across the seam goes with it) and the snapped pieces are cut at runtime
 *              into Voronoi shards seeded around the press point and stretched along the drag direction; the pink core is exposed
 *              The shards stay stuck to the core where they broke (like the original wax ball): a short pop at the snap, a small
 *              permanent tilt so the cracks catch the light, then they ride the core's deformation — nothing flies off or falls.
 *   kneaded    once every piece is broken and the core keeps being kneaded, the shards sink a little into the core and are then
 *              mixed in (toy.ts `mix`: they shrink and sink out of sight while chocolate flecks spread through the pink core)
 * Audio is driven by what moves: shatter on each snap (pitch from shard size), friction crunch from the shards rubbing as the core moves,
 * squish/flow from the core displacement (see toy.ts).
 */
export type ChocoState = "solid" | "fracturing" | "kneaded";
interface Shard {
  mesh: THREE.Mesh;
  rest: THREE.Vector3; // body-local position where it broke
  last: THREE.Vector3; // last displayed body-local position (for the rubbing measure)
  pop: number; // 1 at the snap, decays to 0
  tilt: THREE.Quaternion; // small permanent tilt
  popAxis: THREE.Vector3;
  area: number;
  sink: number; // how deep it sinks into a kneaded core
  poly: [number, number][]; // outline in body-local x/y (so a later press can break it again)
}
/** cut polygon `poly` into Voronoi cells around `seeds` (x/y); returns the non-degenerate cells */
function voronoiCells(poly: [number, number][], seeds: THREE.Vector2[]) {
  return seeds.map((sd, k) => {
    let cell = poly;
    for (let j = 0; j < seeds.length && cell.length; j++) {
      if (j === k) continue;
      const o = seeds[j], mx = (sd.x + o.x) / 2, my = (sd.y + o.y) / 2, nx = o.x - sd.x, ny = o.y - sd.y;
      const next: [number, number][] = [];
      for (let m = 0; m < cell.length; m++) {
        const p = cell[m], q = cell[(m + 1) % cell.length];
        const dp = (p[0] - mx) * nx + (p[1] - my) * ny, dq = (q[0] - mx) * nx + (q[1] - my) * ny;
        if (dp <= 0) next.push(p);
        if (dp <= 0 !== dq <= 0) { const t = dp / (dp - dq); next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
      }
      cell = next;
    }
    return cell;
  }).filter((c) => c.length >= 3);
}
/** most shards a bar breaks into: past it pressing a shard no longer breaks it smaller */
export const MAX_SHARDS = 90; // small pieces (owner, 2026-11-20 "자잘하게"; was 40)
const rand = (n: number) => {
  const x = Math.sin(n * 91.345 + 7.13) * 43758.5453;
  return x - Math.floor(x);
};

export class ChocolateBar {
  state: ChocoState = "solid";
  readonly shards: Shard[] = [];
  /** seconds of core kneading since the last piece came off */
  private kneadT = 0;
  private seed = 1;
  private top: THREE.MeshPhysicalMaterial;
  private cut: THREE.MeshPhysicalMaterial;
  constructor(
    private scene: THREE.Scene,
    private origin: THREE.Vector3,
    private spec: FidgetSpec,
  ) {
    this.top = new THREE.MeshPhysicalMaterial({ color: spec.color, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.18 });
    this.cut = new THREE.MeshPhysicalMaterial({ color: 0x9d7660, roughness: 0.7 });
  }
  /** rigidity of the core: how much of the computed deformation is shown */
  get rigidity() {
    return this.state === "solid" ? 0.85 : this.state === "fracturing" ? 0.35 : 0;
  }
  /**
   * cut piece `i` into shards around `press` (body-local), stretched along `dir`; returns the shards' mean area.
   * Uneven like real chocolate: 2–6 shards, small chips crowded at the press point and a few big chunks further out.
   */
  snap(i: number, press: THREE.Vector3, dir: THREE.Vector2) {
    const r = barPieceRect(this.spec, i);
    const px = THREE.MathUtils.clamp(press.x, r.x0 + 0.02, r.x1 - 0.02),
      py = THREE.MathUtils.clamp(press.y, r.y0 + 0.02, r.y1 - 0.02);
    const d = dir.lengthSq() > 1e-6 ? dir.clone().normalize() : new THREE.Vector2(1, 0);
    const n = 4 + Math.floor(rand(this.seed++) * 6); // 4–9 shards (was 2–6)
    const seeds: THREE.Vector2[] = [new THREE.Vector2(px, py)];
    for (let k = 1; k < n; k++) {
      if (rand(this.seed++) < 0.5) {
        // a chip right at the press point
        const a = rand(this.seed++) * Math.PI * 2, rr = 0.03 + rand(this.seed++) * 0.07;
        seeds.push(new THREE.Vector2(px + Math.cos(a) * rr, py + Math.sin(a) * rr));
      } else {
        // a chunk anywhere in the piece, pulled a little along the drag direction (wedge-like)
        const x = r.x0 + rand(this.seed++) * (r.x1 - r.x0), y = r.y0 + rand(this.seed++) * (r.y1 - r.y0);
        seeds.push(new THREE.Vector2(x + d.x * 0.05, y + d.y * 0.05));
      }
    }
    const cells = voronoiCells([[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]], seeds);
    const areaSum = cells.reduce((sum, cell) => sum + this.addShard(cell, px, py, d), 0);
    if (this.state === "solid") this.state = "fracturing";
    return areaSum / Math.max(1, cells.length);
  }
  /** press on a shard already off the bar: it breaks again into 2–3 smaller pieces; returns their mean area, or 0 if none broke */
  split(press: THREE.Vector3, dir: THREE.Vector2) {
    if (this.state !== "fracturing" || this.shards.length >= MAX_SHARDS) return 0;
    const inside = (poly: [number, number][]) => {
      let c = false;
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++)
        if ((poly[a][1] > press.y) !== (poly[b][1] > press.y) && press.x < ((poly[b][0] - poly[a][0]) * (press.y - poly[a][1])) / (poly[b][1] - poly[a][1]) + poly[a][0]) c = !c;
      return c;
    };
    const k = this.shards.findIndex((s) => inside(s.poly));
    if (k < 0 || this.shards[k].area < 0.004) return 0; // crumbs are too small to break again
    const old = this.shards[k];
    const d = dir.lengthSq() > 1e-6 ? dir.clone().normalize() : new THREE.Vector2(1, 0);
    const n = 2 + Math.floor(rand(this.seed++) * 2);
    const xs = old.poly.map((p) => p[0]), ys = old.poly.map((p) => p[1]);
    const seeds = [new THREE.Vector2(press.x, press.y)];
    for (let m = 1; m < n; m++)
      seeds.push(new THREE.Vector2(
        Math.min(...xs) + rand(this.seed++) * (Math.max(...xs) - Math.min(...xs)),
        Math.min(...ys) + rand(this.seed++) * (Math.max(...ys) - Math.min(...ys)),
      ));
    const cells = voronoiCells(old.poly, seeds);
    if (cells.length < 2) return 0;
    this.scene.remove(old.mesh);
    old.mesh.geometry.dispose();
    this.shards.splice(k, 1);
    const areaSum = cells.reduce((sum, cell) => sum + this.addShard(cell, press.x, press.y, d), 0);
    return areaSum / cells.length;
  }
  /** add one shard with outline `poly`; it pops at the snap and keeps a small tilt (edge near the press dips, far edge lifts) */
  private addShard(poly: [number, number][], px: number, py: number, d: THREE.Vector2) {
    const zIn = this.spec.depth - BAR.shellThickness;
    let cx = 0, cy = 0, area = 0;
    for (let m = 0; m < poly.length; m++) { const a = poly[m], b = poly[(m + 1) % poly.length], c = a[0] * b[1] - b[0] * a[1]; area += c; cx += (a[0] + b[0]) * c; cy += (a[1] + b[1]) * c; }
    area /= 2; cx /= 6 * area; cy /= 6 * area; area = Math.abs(area);
    const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2((x - cx) * 0.97, (y - cy) * 0.97)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: BAR.shellThickness, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1 });
    const mesh = new THREE.Mesh(geo, [this.top, this.cut]);
    this.scene.add(mesh);
    const out = new THREE.Vector2(cx - px, cy - py);
    if (out.lengthSq() < 1e-6) out.set(d.x, d.y);
    out.normalize();
    const axis = new THREE.Vector3(-out.y, out.x, 0);
    const rest = new THREE.Vector3(cx, cy, zIn);
    mesh.position.copy(rest).add(this.origin);
    this.shards.push({
      mesh,
      rest,
      last: rest.clone(),
      pop: 1,
      tilt: new THREE.Quaternion().setFromAxisAngle(axis, 0.05 + rand(this.seed++) * 0.07),
      popAxis: axis,
      area,
      sink: 0.04 + rand(this.seed++) * 0.04,
      poly,
    });
    return area;
  }
  /** advance shards (they ride the core); returns the area-weighted speed of the shards rubbing against each other this frame */
  step(dt: number, opts: { allBroken: boolean; kneading: boolean; mix: number; deform: (p: THREE.Vector3, out: THREE.Vector3) => void }) {
    if (opts.allBroken && opts.kneading) this.kneadT += dt;
    if (this.state === "fracturing" && opts.allBroken && this.kneadT > 1.2) this.state = "kneaded";
    const base = new THREE.Vector3(), shown = new THREE.Vector3(), q = new THREE.Quaternion();
    const sinkK = 1 - Math.exp(-dt * 2);
    let rub = 0,
      popping = 0;
    for (const s of this.shards) {
      s.pop *= Math.exp(-dt * 9);
      if (s.pop < 0.002) s.pop = 0;
      popping += s.pop;
      // kneaded: sink a little into the core; mixing (opts.mix 0 → 1) pulls them all the way in and breaks them smaller
      // (the shard is 0.12 thick: half of `sink` before mixing, out of sight only near the end of the mix)
      const zIn = this.spec.depth - BAR.shellThickness;
      if (this.state === "kneaded") s.rest.z += (zIn - s.sink * 0.5 - 0.13 * opts.mix ** 1.5 - s.rest.z) * sinkK;
      s.mesh.scale.setScalar(1 - 0.5 * opts.mix);
      // follow the core surface the way the core itself is shown (it is partly rigid while fracturing), then sink below it:
      // deforming the sunk point itself would let the bulging surface swallow the shard
      base.set(s.rest.x, s.rest.y, zIn);
      opts.deform(base, shown);
      shown.lerp(base, this.rigidity);
      shown.z -= zIn - s.rest.z;
      if (dt > 0) rub += ((1 - opts.mix) * s.area * shown.distanceTo(s.last)) / dt; // mixed-in crumbs no longer grind
      s.last.copy(shown);
      shown.z += s.pop * 0.05; // the snap lifts it off the core for an instant
      s.mesh.position.copy(shown).add(this.origin);
      q.setFromAxisAngle(s.popAxis, s.pop * 0.35);
      s.mesh.quaternion.copy(s.tilt).premultiply(q);
    }
    return { rub, popping };
  }
  reset() {
    for (const s of this.shards) {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
    }
    this.shards.length = 0;
    this.state = "solid";
    this.kneadT = 0;
  }
}
