import * as THREE from "three";
import type { FidgetSpec } from "./catalog";
import { BAR, barPieceRect } from "./visuals";

/**
 * W02 chocolate bar — state machine and procedural fracture (user design 2026-11-12):
 *   solid      rigid bar; the core barely deforms until a piece's stress threshold is crossed
 *   fracturing a piece snaps (line fracture: its row-mate across the seam goes with it) and the snapped pieces are cut at runtime
 *              into Voronoi shards seeded around the press point and stretched along the drag direction; the pink core is exposed
 *   kneaded    once every piece is off and the core keeps being kneaded, the shards sink into the core and ride its deformation
 * Audio is driven by what moves: shatter on each snap (pitch from shard size), friction crunch from the shards' kinetic energy,
 * squish/flow from the core displacement (see toy.ts).
 */
export type ChocoState = "solid" | "fracturing" | "kneaded";
interface Shard {
  mesh: THREE.Mesh;
  pos: THREE.Vector3; // body-local
  vel: THREE.Vector3;
  spin: number;
  rot: number;
  area: number;
  anchor: THREE.Vector3; // where it sinks into the core (body-local)
}
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
  /** cut piece `i` into Voronoi shards around `press` (body-local), stretched along `dir`; returns the shards' mean area */
  snap(i: number, press: THREE.Vector3, dir: THREE.Vector2) {
    const r = barPieceRect(this.spec, i);
    const px = THREE.MathUtils.clamp(press.x, r.x0 + 0.02, r.x1 - 0.02),
      py = THREE.MathUtils.clamp(press.y, r.y0 + 0.02, r.y1 - 0.02);
    const d = dir.lengthSq() > 1e-6 ? dir.clone().normalize() : new THREE.Vector2(1, 0);
    const n = 3 + Math.floor(rand(this.seed++) * 3); // 3–5 shards
    const seeds: THREE.Vector2[] = [new THREE.Vector2(px, py)];
    for (let k = 1; k < n; k++) {
      // wedge-like shards: seeds spread along the drag direction, less across it
      const a = rand(this.seed++) * Math.PI * 2, along = (rand(this.seed++) - 0.5) * 0.5, across = (rand(this.seed++) - 0.5) * 0.22;
      seeds.push(new THREE.Vector2(px + d.x * along - d.y * across + Math.cos(a) * 0.05, py + d.y * along + d.x * across + Math.sin(a) * 0.05));
    }
    const zIn = this.spec.depth - BAR.shellThickness;
    let areaSum = 0;
    seeds.forEach((sd, k) => {
      let poly: [number, number][] = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
      for (let j = 0; j < seeds.length && poly.length; j++) {
        if (j === k) continue;
        const o = seeds[j], mx = (sd.x + o.x) / 2, my = (sd.y + o.y) / 2, nx = o.x - sd.x, ny = o.y - sd.y;
        const next: [number, number][] = [];
        for (let m = 0; m < poly.length; m++) {
          const p = poly[m], q = poly[(m + 1) % poly.length];
          const dp = (p[0] - mx) * nx + (p[1] - my) * ny, dq = (q[0] - mx) * nx + (q[1] - my) * ny;
          if (dp <= 0) next.push(p);
          if (dp <= 0 !== dq <= 0) { const t = dp / (dp - dq); next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
        }
        poly = next;
      }
      if (poly.length < 3) return;
      let cx = 0, cy = 0, area = 0;
      for (let m = 0; m < poly.length; m++) { const a = poly[m], b = poly[(m + 1) % poly.length], c = a[0] * b[1] - b[0] * a[1]; area += c; cx += (a[0] + b[0]) * c; cy += (a[1] + b[1]) * c; }
      area /= 2; cx /= 6 * area; cy /= 6 * area; area = Math.abs(area);
      const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2((x - cx) * 0.97, (y - cy) * 0.97)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: BAR.shellThickness, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1 });
      const mesh = new THREE.Mesh(geo, [this.top, this.cut]);
      this.scene.add(mesh);
      const out = new THREE.Vector2(cx - px, cy - py);
      const sp = 0.25 + rand(this.seed++) * 0.35;
      this.shards.push({
        mesh,
        pos: new THREE.Vector3(cx, cy, zIn),
        vel: new THREE.Vector3(out.x * 3 + d.x * 0.3, out.y * 3 + 0.25, sp),
        spin: (rand(this.seed++) - 0.5) * 3,
        rot: 0,
        area,
        anchor: new THREE.Vector3(cx * 0.9, cy * 0.9, zIn - 0.05 - rand(this.seed++) * 0.06),
      });
      areaSum += area;
    });
    if (this.state === "solid") this.state = "fracturing";
    return areaSum / Math.max(1, n);
  }
  /** advance shards; returns kinetic energy (∝ Σ area·v²) and the impact of shards landing on each other / the table this frame (friction-crunch layer) */
  step(dt: number, opts: { allBroken: boolean; kneading: boolean; deform: (p: THREE.Vector3, out: THREE.Vector3) => void }) {
    if (opts.allBroken && opts.kneading) this.kneadT += dt;
    if (this.state === "fracturing" && opts.allBroken && this.kneadT > 1.2) this.state = "kneaded";
    const zIn = this.spec.depth - BAR.shellThickness, floor = -this.spec.height * 0.98;
    const tmp = new THREE.Vector3();
    let ke = 0,
      impact = 0;
    for (const s of this.shards) {
      if (this.state === "kneaded") {
        // embedded: slide into the core and then ride its deformation
        s.pos.lerp(s.anchor, 1 - Math.exp(-dt * 3));
        s.vel.multiplyScalar(Math.exp(-dt * 8));
        opts.deform(s.pos, tmp);
        s.mesh.position.copy(tmp).add(this.origin);
        s.mesh.scale.setScalar(THREE.MathUtils.lerp(s.mesh.scale.x || 1, 0.85, 1 - Math.exp(-dt * 2)));
      } else {
        s.vel.y -= 2.4 * dt; // fall
        s.vel.z += (zIn + 0.04 - s.pos.z) * 10 * dt; // stay against the bar's front
        s.vel.multiplyScalar(Math.exp(-dt * 2.2)); // friction
        s.pos.addScaledVector(s.vel, dt);
        if (s.pos.y < floor) {
          if (s.vel.y < -0.15) impact += s.area * -s.vel.y; // a shard lands on the pile
          s.pos.y = floor;
          s.vel.y *= -0.2;
          s.vel.x *= 0.6;
          s.spin *= 0.6;
        }
        s.pos.x = THREE.MathUtils.clamp(s.pos.x, -this.spec.width * 1.3, this.spec.width * 1.3);
        s.rot += s.spin * dt;
        s.spin *= Math.exp(-dt * 2);
        s.mesh.position.copy(s.pos).add(this.origin);
        s.mesh.rotation.set(0, 0, s.rot);
      }
      ke += s.area * s.vel.lengthSq();
    }
    return { ke, impact };
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
