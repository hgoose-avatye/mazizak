import { Vector3 } from "three";
import { MaterialCage, PLASTIC_BOUNDS, isStretchy } from "./cage";
import { Spring } from "../../core/spring";
import { SquishyModel, DEFAULT_PARAMS } from "../squishy/model";
import type { FidgetSpec } from "./catalog";

export interface Contact {
  id: number;
  anchor: Vector3;
  normal: Vector3;
  drag: Vector3;
  depth: Spring;
  held: boolean;
  age: number;
  pressure?: number;
  surfacePatch?: number;
}
export class FidgetModel {
  readonly cage: MaterialCage;
  readonly contacts = new Map<number, Contact>();
  readonly stretch = new Spring(1, { freq: 3, damping: 1 });
  readonly axis = new Vector3(1, 0, 0);
  readonly fold = new Spring(0, { freq: 3, damping: 1 });
  readonly foam: SquishyModel | null;
  foldCount = 0;
  time = 0;
  maxStretch = 1;
  compression = 0;
  motion = 0;
  frameTravel = 0;
  private pendingTravel = 0;
  peakCompression = 0;
  events: ("fold" | "bubble")[] = [];
  private pinchStart = 0;
  private foldedGesture = false;
  constructor(readonly spec: FidgetSpec) {
    this.cage = new MaterialCage(spec);
    this.foam =
      spec.shape === "foam"
        ? new SquishyModel({
            ...DEFAULT_PARAMS,
            pressDepth: 0.22,
            holdDepth: 0.55,
            slowTauBase: 1.4,
            slowTauHold: 0.8,
            slowTauDepth: 0.35,
            delayBase: 0.35,
            delayHold: 0.3,
          })
        : null;
  }
  press(id: number, anchor: Vector3, normal: Vector3) {
    if (
      [...this.contacts.values()].filter((c) => c.held).length >=
        (this.foam ? 2 : 4) ||
      // the same pointer id can only be pressed again once it was released: a mouse always reuses id 1, so a fresh click
      // must replace the previous (released, still settling) contact instead of being ignored
      this.contacts.get(id)?.held
    )
      return false;
    if (this.contacts.has(id)) this.contacts.delete(id);
    if (this.contacts.size >= 10) {
      const old = [...this.contacts.values()].find((c) => !c.held);
      if (old) this.contacts.delete(old.id);
    }
    const materialAnchor = this.cage.undeform(anchor, new Vector3());
    this.contacts.set(id, {
      id,
      anchor: materialAnchor,
      normal: normal.clone(),
      drag: new Vector3(),
      depth: new Spring(0, { freq: 8, damping: 1 }),
      held: true,
      age: 0,
    });
    this.foam?.press(id, materialAnchor, normal);
    return true;
  }
  drag(id: number, delta: Vector3) {
    const c = this.contacts.get(id);
    if (!c?.held) return;
    const d = delta
      .clone()
      // elastic 말랑이 pull out a long way too (they spring back on release); crunch / wax keep their small give
      .clampLength(0, this.spec.family === "viscous" ? 2.8 : this.spec.family === "elastic" ? 1.6 : 0.65);
    if (isStretchy(this.spec)) {
      // the pulled point stays a little inside the slime's box, so the pulled end stays round instead of flattening on the edge
      const s = this.spec, a = c.anchor, m = 0.9;
      d.x = Math.max(-s.width * PLASTIC_BOUNDS.x * m - a.x, Math.min(s.width * PLASTIC_BOUNDS.x * m - a.x, d.x));
      d.y = Math.min(s.height * PLASTIC_BOUNDS.y * m - a.y, d.y);
      d.z = Math.max(-s.depth * PLASTIC_BOUNDS.z * m - a.z, Math.min(s.depth * PLASTIC_BOUNDS.z * m - a.z, d.z));
    }
    this.pendingTravel += d.distanceTo(c.drag);
    this.motion = Math.max(this.motion, d.distanceTo(c.drag) * 12);
    c.drag.copy(d);
    this.foam?.drag(id, d);
  }
  setSurfacePatch(id: number, patch: number) {
    const c = this.contacts.get(id);
    if (c) c.surfacePatch = patch;
  }
  setPressure(id: number, pressure: number | undefined) {
    const c = this.contacts.get(id);
    if (c && pressure !== undefined && pressure > 0)
      c.pressure = Math.max(0.05, Math.min(1, pressure));
  }
  release(id: number) {
    const c = this.contacts.get(id);
    if (c) {
      c.held = false;
      // plastic slime keeps the pulled shape in its rest (cage.flow); a lingering pull would stretch it further after release
      if (this.spec.plastic) c.drag.set(0, 0, 0);
      this.foam?.release(id);
    }
    this.pinchStart = 0;
    this.foldedGesture = false;
    this.stretch.target = 1;
  }
  foldNow() {
    if (this.spec.family !== "viscous") return;
    this.foldCount++;
    this.fold.snap(0);
    this.fold.target = 1;
    this.maxStretch = 1;
    this.stretch.target = 1;
    this.events.push("fold");
  }
  gather() {
    this.foldNow();
    for (const c of this.contacts.values()) c.drag.multiplyScalar(0.2);
  }
  step(dt: number) {
    this.time += dt;
    this.frameTravel = this.pendingTravel;
    this.pendingTravel = 0;
    this.compression = 0;
    let moving = false;
    if (this.foam) {
      moving = this.foam.update(dt);
      this.compression = Math.max(
        0,
        ...this.foam.contacts.map((c) => c.depth.x),
      );
    }
    for (const c of this.contacts.values()) {
      c.age += dt;
      if (this.foam) {
        c.depth.x = this.foam.depthOf(c.id);
        if (!c.held) {
          const dent = this.foam.contacts.find(
            (d) => d.pointerId === c.id && d.inUse,
          );
          c.depth.x = dent?.depth.x ?? 0;
        }
      } else {
        c.depth.target = c.held
          ? this.spec.press *
            (c.pressure !== undefined
              ? 0.2 + 0.8 * c.pressure
              : this.spec.family === "viscous"
                ? 0.7 + 0.3 * (1 - Math.exp(-c.age / 0.7))
                : 0.55 + 0.45 * (1 - Math.exp(-c.age / 0.8)))
          : 0;
        c.depth.params = {
          freq: c.held ? 8 : 1 / this.spec.recovery,
          damping: c.held ? 1 : this.spec.damping,
        };
        c.depth.step(dt);
      }
      this.compression = Math.max(this.compression, Math.max(0, c.depth.x));
      if (!c.held)
        c.drag.multiplyScalar(
          Math.exp(-dt / (this.spec.family === "viscous" ? 1.4 : 0.25)),
        );
      if (
        !c.held &&
        Math.abs(c.depth.x) < 0.001 &&
        Math.abs(c.depth.v) < 0.01
      ) {
        this.contacts.delete(c.id);
      } else moving = true;
    }
    this.peakCompression = Math.max(this.peakCompression, this.compression);
    const held = [...this.contacts.values()].filter((c) => c.held);
    if (held.length >= 2 && this.spec.family === "viscous") {
      const a = held[0].anchor.clone().add(held[0].drag),
        b = held[1].anchor.clone().add(held[1].drag);
      const distance = a.distanceTo(b);
      if (!this.pinchStart) this.pinchStart = Math.max(0.25, distance);
      const ratio =
        1 +
        (distance - this.pinchStart) /
          Math.max(this.pinchStart, this.spec.width * 2.5);
      this.axis.copy(b.sub(a));
      this.axis.y = 0;
      if (this.axis.lengthSq() < 0.01) this.axis.set(1, 0, 0);
      this.axis.normalize();
      this.stretch.target = Math.min(this.spec.stretch, Math.max(0.75, ratio));
      this.maxStretch = Math.max(this.maxStretch, this.stretch.target);
      if (
        this.maxStretch > 1.3 &&
        distance < this.pinchStart * 0.82 &&
        !this.foldedGesture
      ) {
        this.foldNow();
        this.foldedGesture = true;
      }
    }
    this.stretch.step(dt);
    this.fold.step(dt);
    this.motion *= Math.exp(-dt * 5);
    const cageMoving = this.cage.step(dt, this.contacts.values(), this.fold.x);
    return (
      moving ||
      cageMoving ||
      !this.stretch.isSettled() ||
      !this.fold.isSettled()
    );
  }
  deform(p: Vector3, out: Vector3) {
    return this.cage.deform(p, out);
  }
  reset() {
    this.contacts.clear();
    this.cage.reset();
    this.foam?.reset();
    this.stretch.snap(1);
    this.fold.snap(0);
    this.foldCount = 0;
    this.time = 0;
    this.pinchStart = 0;
    this.maxStretch = 1;
    this.compression = 0;
    this.peakCompression = 0;
    this.events = [];
    this.motion = 0;
    this.frameTravel = 0;
    this.pendingTravel = 0;
  }
  get held() {
    return [...this.contacts.values()].filter((c) => c.held);
  }
}

/** Same shell engine, different topology, fracture threshold and propagation for thin wax vs thick chocolate. */
export class FractureModel {
  readonly damage: Float32Array;
  readonly broken: Uint8Array;
  crackEvents = 0;
  breakEvents = 0;
  /** number of break zones opened by a deep press (the first one is the "first break") */
  crazeEvents = 0;
  /** share of the shell (by area) that can break by pressing; past it the rest holds (kneading the core then mixes it in, toy.ts) */
  static readonly LIMIT = 0.25;
  private weights: number[];
  private totalWeight: number;
  /** contacts already counted as a hit (each new press counts once) */
  private seen = new Set<number>();
  /**
   * Where the shell is breaking. A deep press opens a zone around the finger; it widens while the finger stays down (up to about
   * half the shell) and stops growing when it lifts. Pressing elsewhere opens another zone. The rest of the shell stays whole.
   */
  private zones: { from: Vector3; reach: number; age: number; v: number }[] = [];
  /** per patch, fixed for the shell: crack depth (0.45–0.9), a jagged-edge factor for the zone border, a fall delay, survivor */
  private crackDepth: Float32Array;
  private edge: Float32Array;
  private breakAt: Float32Array;
  private survivor: Uint8Array;
  /** counts every zone of this session (not reset), so each break of the shell falls apart differently */
  private variation = 0;
  constructor(
    readonly centers: Vector3[],
    readonly chocolate: boolean,
    /** each patch's share of the shell (its area); equal shares when not given */
    weights?: number[],
  ) {
    this.weights = weights?.length === centers.length ? weights : centers.map(() => 1);
    this.totalWeight = this.weights.reduce((a, b) => a + b, 0);
    this.damage = new Float32Array(centers.length);
    this.broken = new Uint8Array(centers.length);
    this.crackDepth = new Float32Array(centers.length);
    this.edge = new Float32Array(centers.length);
    this.breakAt = new Float32Array(centers.length);
    this.survivor = new Uint8Array(centers.length);
    this.vary();
  }
  /** a fresh, uneven pattern: neighbouring patches share values (smooth field), so they crack, fall and stay in clumps */
  private vary() {
    const n = this.centers.length,
      keep = new Float32Array(n),
      v = this.variation;
    for (let i = 0; i < n; i++) {
      const c = this.centers[i], r = (k: number) => this.rnd(i + v * 131, k);
      this.crackDepth[i] = 0.45 + 0.45 * (this.field(c, 2, v) * 0.5 + 0.5) * (0.7 + 0.3 * r(4));
      this.edge[i] = 0.6 + 0.8 * (this.field(c, 5, v) * 0.5 + 0.5) * (0.8 + 0.2 * r(5));
      this.breakAt[i] = (this.field(c, 3, v) * 0.5 + 0.5) * 1.1 + r(1) * 0.35;
      keep[i] = this.field(c, 4, v) + r(2) * 0.35;
    }
    // islands of shell that never fall by themselves: the ≈12 % of patches where the "keep" field is highest, so they come in
    // connected pieces of different sizes rather than as evenly spread single flakes
    this.survivor.fill(0);
    if (n >= 20) {
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => keep[b] - keep[a]);
      for (let k = 0; k < Math.round(n * 0.12); k++) this.survivor[order[k]] = 1;
    }
  }
  /** smooth random field over the shell (three low-frequency waves with directions and phases from `v`), in about [-1, 1] */
  private field(p: Vector3, k: number, v: number) {
    let sum = 0;
    for (let w = 0; w < 3; w++) {
      const a = this.rnd(v, k * 10 + w * 3) * Math.PI * 2,
        b = Math.acos(this.rnd(v, k * 10 + w * 3 + 1) * 2 - 1),
        f = 2.2 + w * 1.7;
      sum += Math.sin(f * (p.x * Math.sin(b) * Math.cos(a) + p.y * Math.cos(b) + p.z * Math.sin(b) * Math.sin(a)) + this.rnd(v, k * 10 + w * 3 + 2) * 6.283) / (w + 1);
    }
    return sum / 1.83;
  }
  get crazing() {
    return this.zones.length > 0;
  }
  /** share of the shell broken off, by area */
  get brokenShare() {
    let w = 0;
    for (let i = 0; i < this.broken.length; i++) if (this.broken[i]) w += this.weights[i];
    return w / this.totalWeight;
  }
  /** as much of the shell has broken as pressing can break */
  get done() {
    return this.brokenShare >= FractureModel.LIMIT;
  }
  /** deterministic per-patch pseudo random in [0,1) */
  private rnd(i: number, k: number) {
    const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }
  /**
   * Every press breaks the shell a little more: a press opens a small break zone under the finger, pressing again near it (or
   * holding on) widens it, pressing elsewhere opens another. The border is jagged and pieces fall in clumps, with islands left
   * standing. Once LIMIT of the shell is gone nothing more breaks. Chocolate never does this: it snaps piece by piece.
   */
  step(dt: number, contacts: Contact[]) {
    const events: number[] = [];
    const choc = this.chocolate;
    let deepest = 0,
      anchor: Vector3 | null = null;
    for (const c of contacts)
      if (c.held && c.depth.x > deepest) {
        deepest = c.depth.x;
        anchor = c.anchor;
      }
    for (const z of this.zones) z.age += dt;
    const done = this.done;
    if (!choc && !done) {
      const near = (at: Vector3) => this.zones.find((z) => z.from.distanceTo(at) < z.reach + 0.3);
      for (const c of contacts) {
        if (!c.held || this.seen.has(c.id)) continue;
        this.seen.add(c.id);
        const zone = near(c.anchor);
        if (zone) zone.reach = Math.min(1.1, zone.reach + 0.14); // another press there: the break spreads
        else {
          this.crazeEvents++;
          this.crackEvents++;
          this.zones.push({ from: c.anchor.clone(), reach: 0.22, age: 0, v: this.variation });
        }
      }
      // holding a deep press widens the break slowly too
      const held = anchor && deepest > 0.05 ? near(anchor) : undefined;
      if (held) held.reach = Math.min(1.1, held.reach + dt * 0.3);
    }
    for (const id of this.seen) if (!contacts.some((c) => c.id === id && c.held)) this.seen.delete(id);
    for (let i = 0; i < this.centers.length; i++) {
      if (this.broken[i]) continue;
      let strain = 0;
      for (const c of contacts) {
        const distance = this.centers[i].distanceToSquared(c.anchor);
        strain = Math.max(
          strain,
          Math.max(0, c.depth.x) *
            (c.surfacePatch === i
              ? 1
              : Math.exp(-distance / (choc ? 0.3 : 0.22))), // chocolate: a press on a groove loads the pieces on both sides (bending at the seam)
        );
      }
      const strength =
        (choc ? 0.24 : 0.18) * (1 + 0.12 * Math.sin(i * 19.7));
      let target = strain / strength;
      for (const z of this.zones) {
        // how far inside the zone's jagged border this patch lies (> 0: inside)
        const inside = z.reach * this.edge[i] - this.centers[i].distanceTo(z.from);
        // cracks run a little past the border, opening to each patch's own depth…
        if (inside > -0.25) target = Math.max(target, this.crackDepth[i] * Math.min(1, (inside + 0.25) / 0.25));
        // …and inside it the pieces fall away at their own time (islands stay)
        if (inside > 0 && !done && !this.survivor[i] && z.age >= 0.15 + this.breakAt[i] * 0.6) target = 1;
      }
      // past the limit the wax only cracks, it no longer comes off (the core is then kneaded to mix it in)
      if (done && !choc) target = Math.min(target, 0.95);
      const before = this.damage[i];
      if (target > before)
        this.damage[i] = Math.min(
          1,
          before + (target - before) * (1 - Math.exp(-dt * (target >= 1 ? 30 : 10))),
        );
      if (before < 0.22 && this.damage[i] >= 0.22 && !this.crazing) this.crackEvents++;
      if (this.damage[i] >= 0.999) {
        this.damage[i] = 1;
        this.broken[i] = 1;
        this.breakEvents++;
        events.push(i);
      }
    }
    return events;
  }
  /** break a patch outright (a line fracture carrying on along the weakest seam); returns true if it was intact */
  forceBreak(i: number) {
    if (this.broken[i]) return false;
    this.damage[i] = 1;
    this.broken[i] = 1;
    this.breakEvents++;
    return true;
  }
  reset() {
    this.damage.fill(0);
    this.broken.fill(0);
    this.crackEvents = 0;
    this.breakEvents = 0;
    this.crazeEvents = 0;
    this.seen.clear();
    this.zones = [];
    this.variation++;
    this.vary(); // a new shell breaks differently
  }
  get brokenCount() {
    return this.broken.reduce((a, b) => a + b, 0);
  }
}

export interface Grain {
  initial: Vector3;
  rest: Vector3;
  pos: Vector3;
  velocity: Vector3;
  integrity: number;
  radius: number;
}
export class GrainModel {
  readonly grains: Grain[] = [];
  crushed = 0;
  collisions = 0;
  rearrangements = 0;
  contactWork = 0;
  private priorCompression = 0;
  private wasHeld = false;
  constructor(readonly soap: boolean) {
    for (let i = 0; i < (soap ? 96 : 220); i++) {
      const u = (i * 0.61803398875) % 1,
        v = (i * 0.41421356) % 1,
        r = Math.sqrt((i + 0.5) / (soap ? 96 : 220)) * 0.8;
      const p = new Vector3(
        Math.cos(u * Math.PI * 2) * r,
        (v - 0.5) * 1.0 + 0.12 * Math.sin(u * 6.28),
        Math.sin(u * Math.PI * 2) * r * 1.0,
      );
      if (!soap) {
        const yy = 1 - 2 * ((i + 0.5) / 220),
          rr = Math.sqrt(1 - yy * yy),
          a = i * 2.399963;
        const radius = 0.72 + 0.18 * ((i * 0.75487766) % 1);
        p.set(
          Math.cos(a) * rr * radius,
          yy * radius,
          Math.sin(a) * rr * radius,
        );
      }
      this.grains.push({
        initial: p.clone(),
        rest: p.clone(),
        pos: p.clone(),
        velocity: new Vector3(),
        integrity: 1,
        radius: soap ? 0.14 : 0.092,
      });
    }
  }
  step(dt: number, model: FidgetModel) {
    let events = 0;
    const target = new Vector3(),
      held = model.held;
    this.contactWork = held.length
      ? Math.max(0, model.compression - this.priorCompression) * 25 +
        Math.min(1, model.motion) * 0.15
      : 0;
    this.priorCompression = model.compression;
    if (this.wasHeld && !held.length && !this.soap) {
      for (const g of this.grains) {
        g.rest.lerp(g.pos, 0.2);
        g.rest.clampLength(0, 0.93);
      }
      this.rearrangements++;
    }
    this.wasHeld = held.length > 0;
    for (const g of this.grains) {
      model.deform(g.rest, target);
      g.velocity.addScaledVector(target.sub(g.pos), dt * 24);
      g.velocity.multiplyScalar(Math.exp(-dt * 7));
      g.pos.addScaledVector(g.velocity, dt);
      if (this.soap && g.integrity > 0) {
        let strain = 0;
        for (const c of held)
          strain = Math.max(
            strain,
            Math.max(0, c.depth.x) *
              Math.exp(-g.rest.distanceToSquared(c.anchor) / 0.55),
          );
        const threshold =
          0.16 + 0.05 * Math.sin(g.initial.x * 32 + g.initial.z * 19);
        const target = Math.max(0, 1 - strain / threshold);
        if (target < g.integrity)
          g.integrity += (target - g.integrity) * (1 - Math.exp(-dt * 10));
        if (g.integrity < 0.01) {
          g.integrity = 0;
          this.crushed++;
          events++;
        }
      }
    }
    if (!this.soap && held.length)
      for (let i = 0; i < this.grains.length; i++)
        for (let j = i + 1; j < this.grains.length; j++) {
          const a = this.grains[i],
            b = this.grains[j],
            dx = b.pos.x - a.pos.x,
            dy = b.pos.y - a.pos.y,
            dz = b.pos.z - a.pos.z,
            len = Math.hypot(dx, dy, dz),
            min = a.radius + b.radius;
          if (len < min && len > 0.001) {
            const k = ((min - len) / len) * 0.5,
              x = dx * k,
              y = dy * k,
              z = dz * k;
            a.pos.x -= x;
            a.pos.y -= y;
            a.pos.z -= z;
            b.pos.x += x;
            b.pos.y += y;
            b.pos.z += z;
            a.velocity.x -= x * 3;
            a.velocity.y -= y * 3;
            a.velocity.z -= z * 3;
            b.velocity.x += x * 3;
            b.velocity.y += y * 3;
            b.velocity.z += z * 3;
            this.collisions++;
            events++;
          }
        }
    return events;
  }
  reset() {
    this.crushed = 0;
    this.collisions = 0;
    this.rearrangements = 0;
    this.priorCompression = 0;
    this.wasHeld = false;
    this.contactWork = 0;
    for (const g of this.grains) {
      g.rest.copy(g.initial);
      g.pos.copy(g.rest);
      g.velocity.set(0, 0, 0);
      g.integrity = 1;
    }
  }
}
