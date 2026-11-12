import { Vector3 } from "three";
import { MaterialCage } from "./cage";
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
      .clampLength(0, this.spec.family === "viscous" ? 2.8 : 0.65);
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
        this.maxStretch > 1.35 &&
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
  constructor(
    readonly centers: Vector3[],
    readonly chocolate: boolean,
  ) {
    this.damage = new Float32Array(centers.length);
    this.broken = new Uint8Array(centers.length);
  }
  step(dt: number, contacts: Contact[]) {
    const events: number[] = [];
    // Peak local deformation, not time held, breaks the wax. A stationary hand
    // cannot keep propagating cracks around the whole shell.
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
              : Math.exp(-distance / (this.chocolate ? 0.16 : 0.22))),
        );
      }
      const strength =
        (this.chocolate ? 0.24 : 0.18) * (1 + 0.12 * Math.sin(i * 19.7));
      const target = strain / strength;
      const before = this.damage[i];
      if (target > before)
        this.damage[i] = Math.min(
          1,
          before + (target - before) * (1 - Math.exp(-dt * 10)),
        );
      if (before < 0.22 && this.damage[i] >= 0.22) this.crackEvents++;
      if (this.damage[i] >= 1) {
        this.broken[i] = 1;
        this.breakEvents++;
        events.push(i);
      }
    }
    return events;
  }
  reset() {
    this.damage.fill(0);
    this.broken.fill(0);
    this.crackEvents = 0;
    this.breakEvents = 0;
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
