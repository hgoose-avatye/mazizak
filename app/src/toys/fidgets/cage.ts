import { Vector3 } from "three";
import type { FidgetSpec } from "./catalog";
export interface CageContact {
  anchor: Vector3;
  normal: Vector3;
  drag: Vector3;
  depth: { x: number; v: number };
  held: boolean;
}
interface Profile {
  volumeCompliance: number;
  skin: number;
  returnHz: number;
  damping: number;
}
/**
 * Toys you can pull well out of shape: plastic slime (stays stretched) and the elastic 말랑이 (spring back). Both stretch inside
 * PLASTIC_BOUNDS, under a fixed camera that leaves room for it (toy.ts resize). Crunch / wax toys keep their small give.
 */
export const isStretchy = (s: FidgetSpec) => s.family === "viscous" || s.family === "elastic";
/**
 * KEEP_SHAPE, let go: how much of the squash / pull stays — all of it (owner, 2026-11-20: "살짝 돌아가는 느낌 없애줘"; a partial
 * spring-back was tried first). Kept per material so it can be tuned again.
 */
const KEEP_FRACTION: Record<FidgetSpec["family"], number> = { elastic: 1, viscous: 1, wax: 1, particles: 1 };
/** neighbour-averaging passes over the kept offset when let go (0 = the exact squashed shape; 1+ softened a dent, read as springing back) */
const SETTLE_SMOOTHING = 0;
/** How far a stretchy toy may reach, as multiples of its half width / height / depth (the view leaves room for ≈1.65× the width). */
export const PLASTIC_BOUNDS = { x: 1.35, y: 2, z: 1.1 } as const;
/** A shared tetrahedral material cage. Mesh UVs/textures stay intact; vertices sample
 * its displacement. Foam is compressible; gel/encapsulated slime preserve local volume.
 * This is a bounded real-time approximation, not a fluid/rupture FEM solver. */
export class MaterialCage {
  readonly n = 6;
  /** Current rest shape. Equal to `origin` except for plastic slime, whose rest follows the pull and then flows back. */
  readonly rest: Float64Array;
  /** The material's original lattice: the coordinate frame of the mesh embedding (deform / undeform) and of contact anchors. */
  readonly origin: Float64Array;
  /** Rest shape when the current grab began (plastic only): finger targets are measured from it, so the creep cannot run away. */
  private grabRest: Float64Array;
  private grabbing = false;
  /** KEEP_SHAPE: the softened shape the rest settles into after a release, and whether it is still on its way */
  private settleTo: Float64Array;
  private settling = false;
  /** memory foam (finite plastic): seconds since the last release — the dent holds a moment before it starts to fill in */
  private releasedFor = 0;
  /** Plastic slime: largest offset of the rest shape from its origin (0 when fully home). */
  plasticOffset = 0;
  readonly position: Float64Array;
  readonly velocity: Float64Array;
  private previous: Float64Array;
  private edges: number[] = [];
  private lengths: number[] = [];
  private skinWeights: number[] = [];
  private tets: number[] = [];
  private volumes: number[] = [];
  private accumulator = 0;
  private profile: Profile;
  private initialVolume = 0;
  volumeRatio = 1;
  speed = 0;
  private dimensions: Vector3;
  constructor(readonly spec: FidgetSpec) {
    const n = this.n,
      count = n * n * n;
    this.dimensions = new Vector3(spec.width, spec.height, spec.depth);
    this.rest = new Float64Array(count * 3);
    this.origin = new Float64Array(count * 3);
    this.grabRest = new Float64Array(count * 3);
    this.settleTo = new Float64Array(count * 3);
    this.position = new Float64Array(count * 3);
    this.velocity = new Float64Array(count * 3);
    this.previous = new Float64Array(count * 3);
    const foam = spec.shape === "foam",
      fluid = spec.family === "viscous",
      gel = spec.shape === "ball";
    this.profile = {
      volumeCompliance: foam ? 2e-4 : fluid ? 1e-9 : 4e-9,
      skin: foam ? 0.1 : fluid ? 0.09 : gel ? 0.18 : 0.16, // 슬랑이 softer (owner, 2026-11-20; was 0.3)
      returnHz: foam
        ? 1.3
        : fluid
          ? spec.shape === "cream"
            ? 0.4
            : spec.shape === "mango"
              ? 0.55
              : 0.65
          : gel
            ? 1.6 // softer, slower wobble (was 2.6)
            : 1.4,
      damping: foam
        ? 18
        : fluid
          ? spec.shape === "cream"
            ? 7
            : spec.shape === "mango"
              ? 4.5
              : 5
          : gel
            ? 7
            : 14,
    };
    // KEEP_SHAPE toys feel like dough, not a balloon (owner, 2026-11-20 "풍선 같은 느낌 사라지게"): a press may lose a little volume
    // instead of bulging the other side out, the skin pulls back less and the wobble dies fast
    // 찹쌀떡 (mochi) is dough: it keeps its volume and skin, or a squash reads as a deflated balloon (owner, 2026-11-20) — only its
    // wobble is cut
    const mochi = spec.shape === "mochi";
    if (!Number.isFinite(spec.plastic ?? 0) && !foam) {
      if (!mochi) {
        this.profile.volumeCompliance = fluid ? 4e-5 : 3e-4;
        this.profile.skin *= fluid ? 0.7 : 0.4;
      }
      this.profile.damping = Math.max(this.profile.damping, fluid ? 10 : 16);
    }
    // 뭉개기: squash flat like dough under a palm, not a balloon bulging out round the finger (owner, 2026-11-20) — volume may go,
    // almost no skin tension, no wobble
    // 치즈 · 망고 · 휘핑크림 (memory-foam slime): heavy, not floaty — the slow wobble settles at once (owner, 2026-11-20 "묵직하게")
    if (fluid && spec.category !== "뭉개기") {
      this.profile.returnHz = 1;
      this.profile.damping = 14;
    }
    if (spec.category === "뭉개기") {
      // no volume pull at all (it pushed the sides out like a balloon and crept back), no skin pull, no wobble
      // (owner, 2026-11-20 "복원 느낌 있으면 안 됨 · 풍선 느낌 더 빼")
      this.profile.volumeCompliance = Infinity;
      this.profile.skin = 0;
      this.profile.damping = 26;
    }
    const index = (x: number, y: number, z: number) => x + n * (y + n * z);
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const i = index(x, y, z) * 3;
          this.rest[i] = ((x / (n - 1)) * 2 - 1) * spec.width;
          this.rest[i + 1] = ((y / (n - 1)) * 2 - 1) * spec.height;
          this.rest[i + 2] = ((z / (n - 1)) * 2 - 1) * spec.depth;
          for (const [dx, dy, dz] of [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ])
            if (x + dx < n && y + dy < n && z + dz < n) {
              const j = index(x + dx, y + dy, z + dz) * 3;
              this.edges.push(i, j);
              this.lengths.push(
                Math.hypot(
                  (dx * 2 * spec.width) / (n - 1),
                  (dy * 2 * spec.height) / (n - 1),
                  (dz * 2 * spec.depth) / (n - 1),
                ),
              );
              const boundary =
                x === 0 ||
                x === n - 1 ||
                y === 0 ||
                y === n - 1 ||
                z === 0 ||
                z === n - 1;
              this.skinWeights.push(boundary ? 1 : 0.15);
            }
        }
    this.position.set(this.rest);
    this.origin.set(this.rest);
    this.grabRest.set(this.rest);
    for (let z = 0; z < n - 1; z++)
      for (let y = 0; y < n - 1; y++)
        for (let x = 0; x < n - 1; x++) {
          const c = [
            index(x, y, z),
            index(x + 1, y, z),
            index(x, y + 1, z),
            index(x + 1, y + 1, z),
            index(x, y, z + 1),
            index(x + 1, y, z + 1),
            index(x, y + 1, z + 1),
            index(x + 1, y + 1, z + 1),
          ];
          for (const t of [
            [0, 1, 3, 7],
            [0, 3, 2, 7],
            [0, 2, 6, 7],
            [0, 6, 4, 7],
            [0, 4, 5, 7],
            [0, 5, 1, 7],
          ]) {
            const ids = t.map((i) => c[i] * 3);
            this.tets.push(...ids);
            const v = this.volume(...(ids as [number, number, number, number]));
            this.volumes.push(v);
            this.initialVolume += Math.abs(v);
          }
        }
  }
  private volume(a: number, b: number, c: number, d: number) {
    const p = this.position,
      ax = p[b] - p[a],
      ay = p[b + 1] - p[a + 1],
      az = p[b + 2] - p[a + 2],
      bx = p[c] - p[a],
      by = p[c + 1] - p[a + 1],
      bz = p[c + 2] - p[a + 2],
      cx = p[d] - p[a],
      cy = p[d + 1] - p[a + 1],
      cz = p[d + 2] - p[a + 2];
    return (
      (ax * (by * cz - bz * cy) +
        ay * (bz * cx - bx * cz) +
        az * (bx * cy - by * cx)) /
      6
    );
  }
  step(dt: number, contacts: Iterable<CageContact>, fold: number) {
    this.accumulator += Math.min(0.05, Math.max(0, dt));
    const list = Array.from(contacts);
    if (this.spec.plastic) this.flow(Math.min(0.05, Math.max(0, dt)), list.some((c) => c.held));
    const h = 1 / 120;
    let iterations = 0;
    while (this.accumulator >= h && iterations++ < 6) {
      this.integrate(h, list, fold);
      this.accumulator -= h;
    }
    let volume = 0;
    for (let i = 0; i < this.volumes.length; i++) {
      const j = i * 4;
      volume += Math.abs(
        this.volume(
          this.tets[j],
          this.tets[j + 1],
          this.tets[j + 2],
          this.tets[j + 3],
        ),
      );
    }
    this.volumeRatio = volume / this.initialVolume;
    return this.speed > 0.002 || this.plasticOffset > 0.003;
  }
  /**
   * Plastic slime. While held, the rest shape creeps toward where the fingers have pulled the material (it yields), so on release
   * it stays put; once let go it flows back to the original shape with time constant `spec.plastic`. Finger targets use the
   * rest shape snapshotted at the start of the grab, otherwise rest ← position ← rest + pull would grow without bound.
   */
  private flow(dt: number, held: boolean) {
    const r = this.rest,
      p = this.position,
      o = this.origin;
    const keep = !Number.isFinite(this.spec.plastic!); // KEEP_SHAPE: never flows all the way back
    // let go: the shape at that instant is the kept one (the rest lagged the squash a hair; snapping it stops a tiny spring-back)
    if (keep && !held && this.grabbing) { r.set(p); this.beginSettle(); }
    if (held && !this.grabbing) this.grabRest.set(r);
    this.grabbing = held;
    if (keep && !held) {
      // let go: ease into the softened, partly sprung-back shape (≈0.3 s); what was lifted sags down over ≈1 s
      if (!this.settling) { this.plasticOffset = 0; return; }
      const k = 1 - Math.exp(-dt / 0.3), sag = 1 - Math.exp(-dt / 1);
      let left = 0;
      for (let i = 0; i < r.length; i++) {
        const lifted = i % 3 === 1 && r[i] > this.settleTo[i];
        r[i] += (this.settleTo[i] - r[i]) * (lifted ? sag : k);
        left = Math.max(left, Math.abs(this.settleTo[i] - r[i]));
      }
      for (let i = 1; i < r.length; i += 3) r[i] = Math.max(-this.spec.height, r[i]);
      if (left < 0.002) { r.set(this.settleTo); this.settling = false; }
      this.plasticOffset = this.settling ? left : 0; // at rest once settled: no endless redraw
      return;
    }
    // while held the rest follows the squash fast (0.08 s): even a quick tap leaves its mark, and on release there is no quick
    // spring-back first — a kept shape stays, a memory-foam one (찹쌀떡) only fills back in slowly
    this.releasedFor = held ? 0 : this.releasedFor + dt;
    const hold = !held && this.releasedFor < 0.4; // memory foam: the dent stays ≈0.4 s, then slowly fills back in
    const k = held ? 1 - Math.exp(-dt / 0.08) : hold ? 0 : 1 - Math.exp(-dt / this.spec.plastic!),
      // let go, what was lifted sags down first (≈1 s); spreading back to the original outline takes the full `plastic` time
      sag = held ? k : hold ? 0 : 1 - Math.exp(-dt / Math.min(1, this.spec.plastic!));
    let offset = 0;
    for (let i = 0; i < r.length; i++) {
      const lifted = !held && i % 3 === 1 && r[i] > o[i];
      r[i] += ((held ? p[i] : o[i]) - r[i]) * (lifted ? sag : k);
      offset = Math.max(offset, Math.abs(r[i] - o[i]));
    }
    // the floor holds the rest shape too: what flows back slumps along the table, not through it
    for (let i = 1; i < r.length; i += 3) r[i] = Math.max(-this.spec.height, r[i]);
    if (offset < 0.003 && !held) r.set(o);
    this.plasticOffset = offset < 0.003 && !held ? 0 : offset;
  }
  /**
   * The shape a kept squash settles into: the rest's offset from the original (optionally smoothed over the lattice,
   * SETTLE_SMOOTHING passes), scaled by the material's KEEP_FRACTION, nothing left hanging in the air (lifted parts come down).
   */
  private beginSettle() {
    const n = this.n, r = this.rest, o = this.origin, count = n * n * n;
    let off = new Float64Array(count * 3);
    for (let i = 0; i < off.length; i++) off[i] = r[i] - o[i];
    const at = (x: number, y: number, z: number) => (x + n * (y + n * z)) * 3;
    for (let pass = 0; pass < SETTLE_SMOOTHING; pass++) {
      const next = new Float64Array(off.length);
      for (let z = 0; z < n; z++)
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n; x++) {
            const i = at(x, y, z);
            const nb = [[x - 1, y, z], [x + 1, y, z], [x, y - 1, z], [x, y + 1, z], [x, y, z - 1], [x, y, z + 1]]
              .filter(([a, b, c]) => a >= 0 && b >= 0 && c >= 0 && a < n && b < n && c < n);
            for (let d = 0; d < 3; d++) {
              let sum = 0;
              for (const [a, b, c] of nb) sum += off[at(a, b, c) + d];
              next[i + d] = 0.5 * off[i + d] + 0.5 * (sum / nb.length);
            }
          }
      off = next;
    }
    const keep = KEEP_FRACTION[this.spec.family];
    for (let i = 0; i < off.length; i++) {
      let v = o[i] + off[i] * keep;
      if (i % 3 === 1) v = Math.max(-this.spec.height, Math.min(v, Math.max(o[i], r[i] - (r[i] - o[i]) * 1))); // lifted parts come down
      if (i % 3 === 1 && v > o[i]) v = o[i];
      this.settleTo[i] = v;
    }
    this.settling = true;
  }
  private integrate(dt: number, contacts: CageContact[], fold: number) {
    const p = this.position,
      r = this.rest,
      v = this.velocity,
      old = this.previous,
      profile = this.profile,
      o = this.origin,
      plastic = !!this.spec.plastic,
      stretchy = isStretchy(this.spec),
      g = plastic && this.grabbing ? this.grabRest : r;
    old.set(p);
    const omega = 2 * Math.PI * profile.returnHz,
      damping = Math.exp(-profile.damping * dt);
    for (let i = 0; i < p.length; i += 3) {
      let ry = r[i + 1];
      if (fold > 0)
        ry += fold * 0.14 * Math.cos(r[i] * 4) * Math.exp(-r[i + 2] * r[i + 2]);
      v[i] = (v[i] + (r[i] - p[i]) * omega * omega * dt) * damping;
      v[i + 1] = (v[i + 1] + (ry - p[i + 1]) * omega * omega * dt) * damping;
      v[i + 2] =
        (v[i + 2] + (r[i + 2] - p[i + 2]) * omega * omega * dt) * damping;
      p[i] += v[i] * dt;
      p[i + 1] += v[i + 1] * dt;
      p[i + 2] += v[i + 2] * dt;
    }
    const held = contacts.filter((c) => c.held),
      paired = held.length === 2 && this.spec.shape !== "foam";
    const midpoint = paired
      ? held[0].anchor.clone().add(held[1].anchor).multiplyScalar(0.5)
      : null;
    const alpha = profile.volumeCompliance / (dt * dt);
    const volumeOn = Number.isFinite(profile.volumeCompliance); // 뭉개기: off
    for (let iteration = 0; iteration < 3; iteration++) {
      // Tetrahedral volume constraints move displaced filling into neighbouring regions.
      for (let t = 0; volumeOn && t < this.volumes.length; t++) {
        const k = t * 4,
          a = this.tets[k],
          b = this.tets[k + 1],
          c = this.tets[k + 2],
          d = this.tets[k + 3];
        const ax = p[b] - p[a],
          ay = p[b + 1] - p[a + 1],
          az = p[b + 2] - p[a + 2],
          bx = p[c] - p[a],
          by = p[c + 1] - p[a + 1],
          bz = p[c + 2] - p[a + 2],
          cx = p[d] - p[a],
          cy = p[d + 1] - p[a + 1],
          cz = p[d + 2] - p[a + 2];
        const g1x = (by * cz - bz * cy) / 6,
          g1y = (bz * cx - bx * cz) / 6,
          g1z = (bx * cy - by * cx) / 6;
        const g2x = (cy * az - cz * ay) / 6,
          g2y = (cz * ax - cx * az) / 6,
          g2z = (cx * ay - cy * ax) / 6;
        const g3x = (ay * bz - az * by) / 6,
          g3y = (az * bx - ax * bz) / 6,
          g3z = (ax * by - ay * bx) / 6;
        const g0x = -g1x - g2x - g3x,
          g0y = -g1y - g2y - g3y,
          g0z = -g1z - g2z - g3z;
        const denominator =
          g0x * g0x +
          g0y * g0y +
          g0z * g0z +
          g1x * g1x +
          g1y * g1y +
          g1z * g1z +
          g2x * g2x +
          g2y * g2y +
          g2z * g2z +
          g3x * g3x +
          g3y * g3y +
          g3z * g3z +
          alpha;
        const volume = ax * g1x + ay * g1y + az * g1z,
          lambda = Math.max(
            -5,
            Math.min(
              5,
              -(volume - this.volumes[t]) / Math.max(1e-10, denominator),
            ),
          );
        p[a] += lambda * g0x;
        p[a + 1] += lambda * g0y;
        p[a + 2] += lambda * g0z;
        p[b] += lambda * g1x;
        p[b + 1] += lambda * g1y;
        p[b + 2] += lambda * g1z;
        p[c] += lambda * g2x;
        p[c + 1] += lambda * g2y;
        p[c + 2] += lambda * g2z;
        p[d] += lambda * g3x;
        p[d + 1] += lambda * g3y;
        p[d + 2] += lambda * g3z;
      }
      for (let e = 0; e < this.lengths.length; e++) {
        const a = this.edges[e * 2],
          b = this.edges[e * 2 + 1],
          x = p[b] - p[a],
          y = p[b + 1] - p[a + 1],
          z = p[b + 2] - p[a + 2],
          length = Math.hypot(x, y, z);
        if (length < 1e-8) continue;
        // plastic slime: the skin keeps the current (stretched) shape's edge lengths, so it does not pull itself back together
        const rest = plastic
            ? Math.hypot(r[b] - r[a], r[b + 1] - r[a + 1], r[b + 2] - r[a + 2])
            : this.lengths[e],
          stiffness = profile.skin * this.skinWeights[e],
          correction = ((length - rest) / length) * 0.5 * stiffness;
        p[a] += x * correction;
        p[a + 1] += y * correction;
        p[a + 2] += z * correction;
        p[b] -= x * correction;
        p[b + 1] -= y * correction;
        p[b + 2] -= z * correction;
      }
      // A finger constrains nearby membrane nodes; the filling resists volume loss.
      for (const c of contacts) {
        if (Math.abs(c.depth.x) < 0.0001 && c.drag.lengthSq() < 0.000001)
          continue;
        const normal =
          paired && c.held
            ? c.anchor.clone().sub(midpoint!).normalize()
            : c.normal;
        const depth = c.depth.x * (paired && c.held ? 0.35 : 1);
        const baseRadius =
          this.spec.shape === "mochi" ? 0.95 : this.spec.family === "viscous" ? 0.85 : 0.72;
        // no spikes (owner, 2026-11-20 "뾰족한 느낌 없애줘"): a long pull takes a wider patch of the body along (a rounded
        // mound, not a horn) and one point can be drawn out at most about 1.3 × that patch
        const rawDrag = c.drag.length(),
          radius = baseRadius * (1 + Math.min(0.9, rawDrag * 0.55)),
          dragScale = rawDrag > radius * 1.3 ? (radius * 1.3) / rawDrag : 1,
          drag = dragScale < 1 ? c.drag.clone().multiplyScalar(dragScale) : c.drag,
          dragLength = rawDrag * dragScale,
          dragDirection =
            dragLength > 0.001 ? drag.clone().divideScalar(dragLength) : null;
        for (let i = 0; i < p.length; i += 3) {
          const dx = o[i] - c.anchor.x,
            dy = o[i + 1] - c.anchor.y,
            dz = o[i + 2] - c.anchor.z;
          let w = Math.exp(
            -(dx * dx + dy * dy + dz * dz) / (radius * radius * 0.65),
          );
          if (w < 0.005) continue;
          // plastic slime lifted off the table: its underside stays stuck down, so an upward pull draws a strand from a base
          if (plastic && c.held && drag.y > 0)
            w *= 0.25 + 0.75 * ((o[i + 1] + this.spec.height) / (2 * this.spec.height));
          const grip = 0.5 * w,
            tx = g[i] + drag.x * w - normal.x * depth * w,
            ty = g[i + 1] + drag.y * w - normal.y * depth * w,
            tz = g[i + 2] + drag.z * w - normal.z * depth * w;
          const ex = tx - p[i],
            ey = ty - p[i + 1],
            ez = tz - p[i + 2],
            pressure = (ex * normal.x + ey * normal.y + ez * normal.z) * grip;
          p[i] += normal.x * pressure;
          p[i + 1] += normal.y * pressure;
          p[i + 2] += normal.z * pressure;
          // Leave the perpendicular axes free for displaced filling to bulge.
          if (dragDirection && Math.abs(dragDirection.dot(normal)) < 0.8) {
            const t =
              (ex * dragDirection.x +
                ey * dragDirection.y +
                ez * dragDirection.z) *
              grip *
              0.7;
            p[i] += dragDirection.x * t;
            p[i + 1] += dragDirection.y * t;
            p[i + 2] += dragDirection.z * t;
          }
        }
      }
      const d = this.dimensions;
      for (let i = 0; i < p.length; i += 3) {
        p[i + 1] = Math.max(-this.spec.height, p[i + 1]);
        for (let k = 0; k < 3; k++)
          p[i + k] = Math.max(
            r[i + k] - 2.5,
            Math.min(r[i + k] + 2.5, p[i + k]),
          );
        // a stretchy toy stretches inside a fixed box around where it sits: it never leaves the (fixed) view, and it barely
        // moves toward / away from the camera, so a pull reads as stretching rather than as the piece tilting into depth
        if (stretchy) {
          p[i] = Math.max(-d.x * PLASTIC_BOUNDS.x, Math.min(d.x * PLASTIC_BOUNDS.x, p[i]));
          p[i + 1] = Math.min(d.y * PLASTIC_BOUNDS.y, p[i + 1]);
          p[i + 2] = Math.max(-d.z * PLASTIC_BOUNDS.z, Math.min(d.z * PLASTIC_BOUNDS.z, p[i + 2]));
        }
      }
    }
    let speed = 0;
    for (let i = 0; i < p.length; i++) {
      v[i] = (p[i] - old[i]) / dt;
      speed = Math.max(speed, Math.abs(v[i]));
    }
    this.speed = speed;
  }
  /** Trilinear cage embedding; no per-vertex allocation and no global mesh scale. */
  deform(point: Vector3, out: Vector3) {
    const n = this.n,
      s = n - 1,
      d = this.dimensions;
    const gx = Math.max(0, Math.min(s - 1e-8, (point.x / d.x + 1) * 0.5 * s)),
      gy = Math.max(0, Math.min(s - 1e-8, (point.y / d.y + 1) * 0.5 * s)),
      gz = Math.max(0, Math.min(s - 1e-8, (point.z / d.z + 1) * 0.5 * s));
    const x = Math.floor(gx),
      y = Math.floor(gy),
      z = Math.floor(gz),
      u = gx - x,
      v = gy - y,
      w = gz - z;
    out.copy(point);
    for (let dz = 0; dz < 2; dz++)
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const weight = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w),
            i = (x + dx + n * (y + dy + n * (z + dz))) * 3;
          out.x += (this.position[i] - this.origin[i]) * weight;
          out.y += (this.position[i + 1] - this.origin[i + 1]) * weight;
          out.z += (this.position[i + 2] - this.origin[i + 2]) * weight;
        }
    return out;
  }
  /** Inverse embedding keeps a second squeeze attached to material already moving. */
  undeform(point: Vector3, out: Vector3) {
    out.copy(point);
    const sampled = new Vector3();
    for (let i = 0; i < 5; i++) {
      this.deform(out, sampled);
      out.addScaledVector(sampled.sub(point), -0.7);
      out.x = Math.max(-this.spec.width, Math.min(this.spec.width, out.x));
      out.y = Math.max(-this.spec.height, Math.min(this.spec.height, out.y));
      out.z = Math.max(-this.spec.depth, Math.min(this.spec.depth, out.z));
    }
    return out;
  }
  reset() {
    this.rest.set(this.origin);
    this.grabRest.set(this.origin);
    this.grabbing = false;
    this.settling = false;
    this.plasticOffset = 0;
    this.position.set(this.rest);
    this.velocity.fill(0);
    this.previous.set(this.rest);
    this.accumulator = 0;
    this.volumeRatio = 1;
    this.speed = 0;
  }
}
