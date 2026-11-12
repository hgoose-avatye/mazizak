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
/** A shared tetrahedral material cage. Mesh UVs/textures stay intact; vertices sample
 * its displacement. Foam is compressible; gel/encapsulated slime preserve local volume.
 * This is a bounded real-time approximation, not a fluid/rupture FEM solver. */
export class MaterialCage {
  readonly n = 6;
  readonly rest: Float64Array;
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
    this.position = new Float64Array(count * 3);
    this.velocity = new Float64Array(count * 3);
    this.previous = new Float64Array(count * 3);
    const foam = spec.shape === "foam",
      fluid = spec.family === "viscous",
      gel = spec.shape === "ball";
    this.profile = {
      volumeCompliance: foam ? 2e-4 : fluid ? 1e-9 : 4e-9,
      skin: foam ? 0.1 : fluid ? 0.09 : gel ? 0.3 : 0.16,
      returnHz: foam
        ? 1.3
        : fluid
          ? spec.shape === "cream"
            ? 0.4
            : spec.shape === "mango"
              ? 0.55
              : 0.65
          : gel
            ? 2.6
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
            ? 5
            : 14,
    };
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
    return this.speed > 0.002;
  }
  private integrate(dt: number, contacts: CageContact[], fold: number) {
    const p = this.position,
      r = this.rest,
      v = this.velocity,
      old = this.previous,
      profile = this.profile;
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
    for (let iteration = 0; iteration < 3; iteration++) {
      // Tetrahedral volume constraints move displaced filling into neighbouring regions.
      for (let t = 0; t < this.volumes.length; t++) {
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
        const rest = this.lengths[e],
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
        const dragLength = c.drag.length(),
          dragDirection =
            dragLength > 0.001 ? c.drag.clone().divideScalar(dragLength) : null;
        const radius =
          this.spec.shape === "mochi"
            ? 0.95
            : this.spec.family === "viscous"
              ? 0.85
              : 0.72;
        for (let i = 0; i < p.length; i += 3) {
          const dx = r[i] - c.anchor.x,
            dy = r[i + 1] - c.anchor.y,
            dz = r[i + 2] - c.anchor.z,
            w = Math.exp(
              -(dx * dx + dy * dy + dz * dz) / (radius * radius * 0.65),
            );
          if (w < 0.005) continue;
          const grip = 0.5 * w,
            tx = r[i] + c.drag.x * w - normal.x * depth * w,
            ty = r[i + 1] + c.drag.y * w - normal.y * depth * w,
            tz = r[i + 2] + c.drag.z * w - normal.z * depth * w;
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
      for (let i = 0; i < p.length; i += 3) {
        p[i + 1] = Math.max(-this.spec.height, p[i + 1]);
        for (let k = 0; k < 3; k++)
          p[i + k] = Math.max(
            r[i + k] - 2.5,
            Math.min(r[i + k] + 2.5, p[i + k]),
          );
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
          out.x += (this.position[i] - this.rest[i]) * weight;
          out.y += (this.position[i + 1] - this.rest[i + 1]) * weight;
          out.z += (this.position[i + 2] - this.rest[i + 2]) * weight;
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
    this.position.set(this.rest);
    this.velocity.fill(0);
    this.previous.set(this.rest);
    this.accumulator = 0;
    this.volumeRatio = 1;
    this.speed = 0;
  }
}
