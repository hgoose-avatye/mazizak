import * as THREE from "three";

/**
 * 뭉개기: what a squash throws out (owner, 2026-11-20 — "튀는 거랑 잔해가 허접함, 피 같은 느낌"):
 *  - juice drops: small glossy, see-through 3-D drops that stretch along their flight, land as flat puddles with a few tiny
 *    satellite drops round them;
 *  - chunks: little irregular lumps of the food (tomato flesh, strawberry, tofu, butter, custard) that tumble, bounce once and
 *    settle;
 *  - seeds: tomato / strawberry seeds;
 *  - smears: rubbing the squashed toy spreads it on the table like paint — long streaks along the finger's path
 *    (owner, 2026-11-20 "비비면 문질러지는 느낌, 물감처럼").
 * Juice colours are the fruit's own (orange tomato juice, pink strawberry juice, custard), never a deep red. Everything stays on
 * the table until 초기화 (the oldest pieces are recycled past the cap). Instanced meshes: one draw call per layer.
 */
export interface SplatRecipe {
  /** juice colour, or null for a dry food (tofu, butter) */
  juice: number | null;
  /** juice opacity (a little see-through reads as juice, not paint) */
  juiceOpacity?: number;
  /** chunk colours (one picked per chunk) */
  chunks: number[];
  /** seed colour, or null */
  seeds: number | null;
  /** per burst */
  counts: { drops: number; chunks: number; seeds: number };
  /** colour of the paint-like smear a rub leaves on the table */
  smear: number;
}

export const SPLAT_RECIPES: Partial<Record<string, SplatRecipe>> = {
  tomato: { juice: 0xff7a45, juiceOpacity: 0.78, chunks: [0xe8452f, 0xff8a63, 0xf5b46a], seeds: 0xf1d98a, counts: { drops: 14, chunks: 0, seeds: 0 }, smear: 0xf2603c }, // juice only (owner, 2026-11-20)
  strawberry: { juice: 0xff8ea6, juiceOpacity: 0.78, chunks: [0xec3b4c, 0xff9aa8, 0xffd0d4], seeds: 0xf6e27a, counts: { drops: 12, chunks: 0, seeds: 0 }, smear: 0xf2707f }, // juice only
  pudding: { juice: 0xf7d56e, juiceOpacity: 0.92, chunks: [0xf7d56e, 0xf2c75a, 0x9a5418], seeds: null, counts: { drops: 10, chunks: 0, seeds: 0 }, smear: 0xf3cf62 }, // custard drops only (owner, 2026-11-20)
  tofu: { juice: null, chunks: [0xf7f3e8, 0xefe9da, 0xfbf8f0], seeds: null, counts: { drops: 0, chunks: 12, seeds: 0 }, smear: 0xf1ece0 },
  butter: { juice: null, chunks: [0xf8df86, 0xf3d26c, 0xfbe9a8], seeds: null, counts: { drops: 0, chunks: 0, seeds: 0 }, smear: 0xf5d871 }, // nothing thrown, it only smears (owner, 2026-11-20)
  cheese: { juice: null, chunks: [0xf7c948, 0xf2bb34, 0xfad673], seeds: null, counts: { drops: 0, chunks: 0, seeds: 0 }, smear: 0xf5cf5a }, // nothing thrown, it only smears
  cream: { juice: null, chunks: [0xfffdf8, 0xfbf6ec, 0xffffff], seeds: null, counts: { drops: 0, chunks: 0, seeds: 0 }, smear: 0xfbf7ef }, // nothing thrown, it only smears
};

type Kind = "drop" | "puddle" | "chunk" | "seed" | "smear";
interface Bit {
  kind: Kind;
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  size: number;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  landed: boolean;
  bounced: boolean;
  grow: number; // puddle spread 0 → 1
  length: number; // smear: length along its direction (× size)
  color: THREE.Color;
}

const CAP = { drop: 90, puddle: 70, chunk: 70, seed: 60, smear: 160 } as const;
const GRAVITY = 8;

/** a lumpy little rock of food: an icosahedron with its corners pushed in and out */
function lumpGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 0.78 + 0.32 * Math.abs(Math.sin(v.x * 5.1 + v.y * 3.7) * Math.cos(v.z * 4.3 - v.x * 2.1));
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y * 0.8, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** a puddle: a flat disc with a wobbly edge and a slightly domed middle */
function puddleGeometry() {
  const seg = 28, g = new THREE.CircleGeometry(1, seg);
  const p = g.getAttribute("position");
  for (let i = 1; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), a = Math.atan2(y, x);
    const r = 1 + 0.16 * Math.sin(a * 5 + 0.7) + 0.09 * Math.sin(a * 9 + 2.1);
    p.setXYZ(i, x * r, y * r, 0);
  }
  p.setZ(0, 0.08);
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** a smear piece: a flat strip with round ends (length 2 along x before scaling, width 2 along z), lying on the table */
function strokeGeometry() {
  const shape = new THREE.Shape();
  const half = 0.5, r = 1;
  shape.moveTo(-half, -r);
  shape.lineTo(half, -r);
  shape.absarc(half, 0, r, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-half, r);
  shape.absarc(-half, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  const g = new THREE.ShapeGeometry(shape, 12);
  g.scale(1 / (half + r), 1, 1); // the strip is 2 long (ends included), 2 wide
  g.rotateX(-Math.PI / 2);
  return g;
}

export class Splatter {
  private bits: Record<Kind, Bit[]> = { drop: [], puddle: [], chunk: [], seed: [], smear: [] };
  private meshes: Record<Kind, THREE.InstancedMesh | null>;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private dir = new THREE.Vector3();
  private next: Record<Kind, number> = { drop: 0, puddle: 0, chunk: 0, seed: 0, smear: 0 };
  private lastSmear: THREE.Vector3 | null = null;
  /** sound hooks (toy.ts → synthSfx): a drop or a chunk landing on the table, a smear stroke laid down */
  onLand: ((what: "splat" | "tick") => void) | null = null;
  onSmear: (() => void) | null = null;

  constructor(scene: THREE.Scene, private readonly recipe: SplatRecipe, private readonly floorY: number) {
    const juice = recipe.juice !== null
      ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: recipe.juiceOpacity ?? 0.85, depthWrite: false })
      : null;
    const make = (kind: Kind, geometry: THREE.BufferGeometry, material: THREE.Material | null) => {
      if (!material) return null;
      const mesh = new THREE.InstancedMesh(geometry, material, CAP[kind]);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = kind === "puddle" ? 1 : 2;
      for (let i = 0; i < CAP[kind]; i++) {
        this.bits[kind].push({ kind, alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 0, rot: new THREE.Euler(), spin: new THREE.Vector3(), landed: false, bounced: false, grow: 0, length: 1, color: new THREE.Color() });
        mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      }
      scene.add(mesh);
      return mesh;
    };
    this.meshes = {
      drop: make("drop", new THREE.SphereGeometry(1, 14, 10), juice),
      puddle: make("puddle", puddleGeometry(), juice ? juice.clone() : null),
      chunk: make("chunk", lumpGeometry(), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: recipe.juice !== null ? 0.25 : 0.6, clearcoat: recipe.juice !== null ? 0.6 : 0.1 })),
      seed: make("seed", new THREE.SphereGeometry(1, 8, 6), recipe.seeds !== null ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }) : null),
      // a smear: a soft-ended streak of paint, a little glossy, slightly see-through at the thin edges
      // (a smooth round-ended strip — the wobbly puddle outline stretched long read as jagged steps; drawn a little above the
      // table with a depth offset so it never flickers into it)
      smear: make("smear", strokeGeometry(), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.5, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    };
  }

  private take(kind: Kind): Bit | null {
    if (!this.meshes[kind]) return null;
    const list = this.bits[kind], b = list[this.next[kind]];
    this.next[kind] = (this.next[kind] + 1) % list.length; // past the cap the oldest piece is reused
    return b;
  }

  /** a squash at world point `at` (strength 0–1 scales the burst) */
  burst(at: THREE.Vector3, strength = 1) {
    const r = () => Math.random() * 2 - 1, c = this.recipe.counts;
    const n = (k: number) => Math.max(0, Math.round(k * (0.5 + 0.5 * strength)));
    const throwBit = (kind: Kind, size: number, speed: number, color: number) => {
      const b = this.take(kind);
      if (!b) return;
      const a = Math.random() * Math.PI * 2, sp = speed * (0.6 + Math.random() * 0.8);
      b.alive = true;
      b.landed = false;
      b.bounced = false;
      b.grow = 0;
      b.size = size * (0.6 + Math.random() * 0.8);
      b.pos.copy(at).add(this.s.set(r() * 0.08, Math.random() * 0.05, r() * 0.06));
      b.vel.set(Math.cos(a) * sp, 1.2 + Math.random() * 1.8, Math.sin(a) * sp * 0.75);
      b.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      b.spin.set(r() * 9, r() * 9, r() * 9);
      b.color.setHex(color);
    };
    const juice = this.recipe.juice;
    if (juice !== null) for (let i = 0; i < n(c.drops); i++) throwBit("drop", 0.035, 1.9, juice);
    for (let i = 0; i < n(c.chunks); i++) throwBit("chunk", 0.05, 1.5, this.recipe.chunks[Math.floor(Math.random() * this.recipe.chunks.length)]);
    if (this.recipe.seeds !== null) for (let i = 0; i < n(c.seeds); i++) throwBit("seed", 0.016, 1.7, this.recipe.seeds);
  }

  /**
   * The finger rubbed from the last smear point to `at` (world, over the toy): paint the table under its path. Each stretch of
   * the stroke becomes a streak aligned with it, pressed a little wider where it starts.
   */
  smear(at: THREE.Vector3) {
    const p = this.s.set(at.x, this.floorY + 0.006, at.z);
    if (!this.lastSmear) { this.lastSmear = p.clone(); return; }
    const d = p.distanceTo(this.lastSmear);
    if (d < 0.04) return;
    const b = this.take("smear");
    if (!b) return;
    b.alive = true;
    b.landed = true;
    b.grow = 0;
    b.size = 0.075 + Math.random() * 0.02;
    // each piece reaches back over the last one (round ends overlapping), so a stroke is one unbroken streak
    b.length = 1 + (d * 0.5) / b.size;
    b.pos.copy(p).add(this.lastSmear).multiplyScalar(0.5);
    b.pos.y = this.floorY + 0.006 + Math.random() * 0.002;
    b.rot.set(0, -Math.atan2(p.z - this.lastSmear.z, p.x - this.lastSmear.x), 0);
    b.color.setHex(this.recipe.smear).multiplyScalar(0.92 + Math.random() * 0.1);
    this.lastSmear.copy(p);
    this.onSmear?.();
  }
  /** the finger lifted: the next rub starts a new stroke */
  endStroke() {
    this.lastSmear = null;
  }

  private puddle(at: THREE.Vector3, size: number, color: THREE.Color) {
    const p = this.take("puddle");
    if (!p) return;
    p.alive = true;
    p.landed = true;
    p.grow = 0;
    p.size = size;
    p.pos.set(at.x, this.floorY + 0.002 + Math.random() * 0.002, at.z);
    p.rot.set(0, Math.random() * Math.PI * 2, 0);
    p.color.copy(color);
  }

  /** advance; true while anything is still flying or spreading */
  step(dt: number): boolean {
    let moving = false;
    const floor = this.floorY;
    for (const kind of ["drop", "chunk", "seed", "puddle", "smear"] as Kind[]) {
      const mesh = this.meshes[kind];
      if (!mesh) continue;
      let count = 0;
      for (const b of this.bits[kind]) {
        if (!b.alive) continue;
        if (kind === "puddle" || kind === "smear") {
          if (b.grow < 1) { b.grow = Math.min(1, b.grow + dt * 6); moving = true; }
          const k = b.size * (0.35 + 0.65 * (1 - (1 - b.grow) ** 3));
          this.q.setFromEuler(b.rot);
          this.m.compose(b.pos, this.q, this.s.set(kind === "smear" ? k * b.length : k, k, k));
        } else {
          if (!b.landed) {
            moving = true;
            b.vel.y -= GRAVITY * dt;
            b.pos.addScaledVector(b.vel, dt);
            b.rot.x += b.spin.x * dt; b.rot.y += b.spin.y * dt; b.rot.z += b.spin.z * dt;
            const rest = floor + b.size * (kind === "chunk" ? 0.75 : 0.5);
            if (b.pos.y <= rest) {
              b.pos.y = rest;
              if (kind === "drop") {
                // a drop hits the table: a puddle, and a couple of tiny satellite drops round it
                b.alive = false;
                this.onLand?.("splat");
                this.puddle(b.pos, b.size * 2.6, b.color);
                for (let i = 0; i < 2; i++) {
                  const a = Math.random() * Math.PI * 2, d = b.size * (2.6 + Math.random() * 2.2);
                  this.puddle(this.s.set(b.pos.x + Math.cos(a) * d, 0, b.pos.z + Math.sin(a) * d), b.size * (0.5 + Math.random() * 0.5), b.color);
                }
                continue;
              }
              if (!b.bounced && b.vel.y < -1) {
                if (kind === "chunk") this.onLand?.("tick");
                b.bounced = true; // a chunk bounces once and skids a little
                b.vel.set(b.vel.x * 0.35, -b.vel.y * 0.28, b.vel.z * 0.35);
                b.spin.multiplyScalar(0.4);
              } else {
                b.landed = true;
                b.rot.x = 0; b.rot.z = 0; // settles flat side down
              }
            }
          }
          if (kind === "drop") {
            // stretched along its flight: a teardrop
            const speed = b.vel.length();
            this.dir.copy(b.vel).normalize();
            this.q.setFromUnitVectors(this.up, this.dir);
            this.m.compose(b.pos, this.q, this.s.set(b.size, b.size * (1 + Math.min(1.6, speed * 0.35)), b.size));
          } else {
            this.q.setFromEuler(b.rot);
            const flat = kind === "seed" ? 0.55 : 1;
            this.m.compose(b.pos, this.q, this.s.set(b.size, b.size * flat, b.size * (kind === "seed" ? 0.75 : 1)));
          }
        }
        mesh.setMatrixAt(count, this.m);
        mesh.setColorAt(count, b.color);
        count++;
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    return moving;
  }

  clear() {
    for (const kind of Object.keys(this.bits) as Kind[]) {
      for (const b of this.bits[kind]) b.alive = false;
      const mesh = this.meshes[kind];
      if (mesh) mesh.count = 0;
    }
  }
}
