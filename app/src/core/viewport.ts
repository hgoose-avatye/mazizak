import * as THREE from 'three';

/**
 * The one place where the toys' coordinate frames meet:
 *   world (toy geometry, never changes with the screen) → camera (Toy.resize frames it) → canvas CSS px (Runtime input, UI checks).
 * Pointer events arrive already in canvas CSS px (Runtime.bindInput); toys turn them into rays with toNdc + Raycaster.
 */

/** Canvas CSS px → normalised device coordinates (−1…1, y up). */
export function toNdc(x: number, y: number, size: { w: number; h: number }, out = new THREE.Vector2()): THREE.Vector2 {
  return out.set((x / size.w) * 2 - 1, 1 - (y / size.h) * 2);
}

/** World point → canvas CSS px (y down). */
export function toCanvasPx(p: THREE.Vector3, camera: THREE.Camera, size: { w: number; h: number }): { x: number; y: number } {
  const v = p.clone().project(camera);
  return { x: ((v.x + 1) / 2) * size.w, y: ((1 - v.y) / 2) * size.h };
}

/** Canvas-px box around objects' bounding boxes (a conservative outline: the box corners, not the silhouette). Used by the layout checks. */
export function screenBox(objects: THREE.Object3D[], camera: THREE.Camera, size: { w: number; h: number }): { x0: number; y0: number; x1: number; y1: number } {
  const box = new THREE.Box3();
  for (const o of objects) { o.updateMatrixWorld(); box.expandByObject(o); }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  camera.updateMatrixWorld();
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    const { x, y } = toCanvasPx(c, camera, size);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const r = (n: number) => Math.round(n);
  return { x0: r(x0), y0: r(y0), x1: r(x1), y1: r(y1) };
}
