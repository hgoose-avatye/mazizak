import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCaseGeometry, createKeycapGeometry } from '../src/toys/keyboard/keycap';

function tris(g: THREE.BufferGeometry): number {
  return g.index!.count / 3;
}

function normalsUnit(g: THREE.BufferGeometry): number {
  const n = g.getAttribute('normal');
  let worst = 0;
  for (let i = 0; i < n.count; i++) worst = Math.max(worst, Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1));
  return worst;
}

/** signed volume via divergence theorem; > 0 means faces wind outward (CCW seen from outside). */
function signedVolume(g: THREE.BufferGeometry): number {
  const p = g.getAttribute('position');
  const idx = g.index!;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let v = 0;
  for (let t = 0; t < idx.count; t += 3) {
    a.fromBufferAttribute(p, idx.getX(t));
    b.fromBufferAttribute(p, idx.getX(t + 1));
    c.fromBufferAttribute(p, idx.getX(t + 2));
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

const keys = {
  '1u': { width: 0.92, depth: 0.92, height: 0.42 },
  spacebar: { width: 2.9, depth: 0.9, height: 0.42 },
};

describe('createKeycapGeometry', () => {
  for (const [name, o] of Object.entries(keys)) {
    describe(name, () => {
      const g = createKeycapGeometry(o);

      it('has indexed position/normal/uv and 2 groups', () => {
        expect(g.index).not.toBeNull();
        for (const a of ['position', 'normal', 'uv']) expect(g.getAttribute(a)).toBeDefined();
        expect(g.groups.length).toBe(2);
        expect(g.groups.map((x) => x.materialIndex)).toEqual([0, 1]);
        expect(g.groups[0].start + g.groups[0].count).toBe(g.groups[1].start);
        expect(g.groups[1].start + g.groups[1].count).toBe(g.index!.count);
      });

      it('bounding box matches options', () => {
        g.computeBoundingBox();
        const bb = g.boundingBox!;
        const tol = 1e-3;
        expect(bb.min.y).toBeCloseTo(0, 5);
        expect(Math.abs(bb.max.y - o.height)).toBeLessThan(tol);
        expect(Math.abs(bb.max.x - bb.min.x - o.width)).toBeLessThan(tol);
        expect(Math.abs(bb.max.z - bb.min.z - o.depth)).toBeLessThan(tol);
        expect(Math.abs(bb.max.x + bb.min.x)).toBeLessThan(tol);
        expect(Math.abs(bb.max.z + bb.min.z)).toBeLessThan(tol);
      });

      it('normals are unit length and face outward', () => {
        expect(normalsUnit(g)).toBeLessThan(1e-4);
        // closed-ish shell (bottom is an open rim) → still positive signed volume when wound outward
        expect(signedVolume(g)).toBeGreaterThan(0);
        // top face normals point up
        const n = g.getAttribute('normal');
        const idx = g.index!;
        const top = g.groups[1];
        for (let i = top.start; i < top.start + top.count; i++) expect(n.getY(idx.getX(i))).toBeGreaterThan(0.5);
      });

      it('top face uv spans 0..1', () => {
        const uv = g.getAttribute('uv');
        const idx = g.index!;
        const top = g.groups[1];
        let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
        for (let i = top.start; i < top.start + top.count; i++) {
          const k = idx.getX(i);
          u0 = Math.min(u0, uv.getX(k));
          u1 = Math.max(u1, uv.getX(k));
          v0 = Math.min(v0, uv.getY(k));
          v1 = Math.max(v1, uv.getY(k));
        }
        expect(u0).toBeCloseTo(0, 3);
        expect(u1).toBeCloseTo(1, 3);
        expect(v0).toBeCloseTo(0, 3);
        expect(v1).toBeCloseTo(1, 3);
      });

      it('top is concave (centre lower than top edge)', () => {
        const p = g.getAttribute('position');
        const idx = g.index!;
        const top = g.groups[1];
        let centreY = Infinity;
        let centreD = Infinity;
        let edgeMax = -Infinity;
        for (let i = top.start; i < top.start + top.count; i++) {
          const k = idx.getX(i);
          const d = Math.hypot(p.getX(k), p.getZ(k));
          if (d < centreD) {
            centreD = d;
            centreY = p.getY(k);
          }
          edgeMax = Math.max(edgeMax, p.getY(k));
        }
        expect(centreY).toBeLessThan(edgeMax - 0.005);
      });
    });
  }

  it('stays inside the triangle budget', () => {
    expect(tris(createKeycapGeometry(keys['1u']))).toBeLessThan(2500);
    expect(tris(createKeycapGeometry(keys.spacebar))).toBeLessThan(4000);
  });
});

describe('createCaseGeometry', () => {
  const o = { width: 3.7, depth: 4.75, height: 0.55, radius: 0.24, wall: 0.2, inset: 0.22 };
  const g = createCaseGeometry(o);

  it('is an indexed hollow tray with sane normals and bbox', () => {
    expect(g.index).not.toBeNull();
    for (const a of ['position', 'normal', 'uv']) expect(g.getAttribute(a)).toBeDefined();
    expect(normalsUnit(g)).toBeLessThan(1e-4);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0, 5);
    expect(bb.max.y).toBeCloseTo(o.height, 4);
    expect(bb.max.x - bb.min.x).toBeCloseTo(o.width, 4);
    expect(bb.max.z - bb.min.z).toBeCloseTo(o.depth, 4);
    expect(signedVolume(g)).toBeGreaterThan(0);
    // hollow: the centre of the tray top surface is at pocket-floor height, and its volume is well below a solid block
    const p = g.getAttribute('position');
    let centreTop = -Infinity;
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < 0.5 && Math.abs(p.getZ(i)) < 0.5) centreTop = Math.max(centreTop, p.getY(i));
    expect(centreTop).toBeCloseTo(o.height - o.inset, 4);
    expect(signedVolume(g)).toBeLessThan(o.width * o.depth * o.height * 0.75);
    expect(tris(g)).toBeLessThan(6000);
  });
});
