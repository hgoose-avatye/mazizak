import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { FidgetSpec } from "./catalog";
export const LOCAL_FIDGETS = import.meta.env.VITE_LOCAL_FIDGETS === "1";
interface ReferenceToy {
  model?: string | null;
  [role: string]: string[] | string | null | undefined;
}
interface ReferenceManifest {
  toys: Record<string, ReferenceToy>;
  usage: string;
}
let manifest: Promise<ReferenceManifest> | undefined;
export function referenceManifest() {
  return (manifest ??= fetch("/__local-fidgets/manifest.json").then((r) => {
    if (!r.ok) throw Error("Local fidget manifest unavailable");
    return r.json() as Promise<ReferenceManifest>;
  }));
}
const buffers = new WeakMap<
  BaseAudioContext,
  Map<string, Promise<AudioBuffer>>
>();
export async function referenceSounds(ctx: BaseAudioContext, id: string) {
  const entry = (await referenceManifest()).toys[id];
  if (!entry) throw Error(`No reference audio for ${id}`);
  let cache = buffers.get(ctx);
  if (!cache) {
    cache = new Map();
    buffers.set(ctx, cache);
  }
  const roles: Record<string, AudioBuffer[]> = {};
  for (const [role, paths] of Object.entries(entry)) {
    if (!Array.isArray(paths)) continue;
    roles[role] = await Promise.all(
      paths.map((path) => {
        let p = cache!.get(path);
        if (!p) {
          p = fetch("/__local-fidgets/" + path).then(async (r) => {
            if (!r.ok) throw Error(`${path}: ${r.status}`);
            const original = await ctx.decodeAudioData(await r.arrayBuffer());
            const mono = new Float32Array(original.length);
            for (let c = 0; c < original.numberOfChannels; c++) {
              const x = original.getChannelData(c);
              for (let i = 0; i < x.length; i++)
                mono[i] += x[i] / original.numberOfChannels;
            }
            let peak = 0;
            for (const x of mono) peak = Math.max(peak, Math.abs(x));
            const threshold = Math.max(0.002, peak * 0.025);
            let first = 0,
              last = mono.length - 1;
            while (first < last && Math.abs(mono[first]) < threshold) first++;
            while (last > first && Math.abs(mono[last]) < threshold) last--;
            first = Math.max(
              0,
              first - Math.round(original.sampleRate * 0.008),
            );
            last = Math.min(
              mono.length,
              last + Math.round(original.sampleRate * 0.025),
            );
            const length = Math.min(
              last - first,
              Math.round(original.sampleRate * 2.4),
            );
            const b = ctx.createBuffer(
                1,
                Math.max(1, length),
                original.sampleRate,
              ),
              dst = b.getChannelData(0);
            const gain = Math.min(5, 0.8 / Math.max(0.01, peak));
            for (let i = 0; i < dst.length; i++)
              dst[i] =
                mono[first + i] *
                gain *
                Math.min(
                  1,
                  i / (original.sampleRate * 0.003),
                  (dst.length - i - 1) / (original.sampleRate * 0.018),
                );
            return b;
          });
          cache!.set(path, p);
        }
        return p;
      }),
    );
  }
  return roles;
}
export async function referenceMesh(spec: FidgetSpec) {
  const path = (await referenceManifest()).toys[spec.id]?.model;
  if (typeof path !== "string") return null;
  const gltf = await new GLTFLoader().loadAsync("/__local-fidgets/" + path);
  gltf.scene.updateMatrixWorld(true);
  let mesh: THREE.Mesh | undefined;
  gltf.scene.traverse((o) => {
    if (!mesh && o instanceof THREE.Mesh) mesh = o;
  });
  if (!mesh) throw Error("Reference mesh is empty");
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  if (spec.shape === "mango") geometry.rotateY(Math.PI / 2);
  if (spec.shape === "cheese") geometry.rotateY(-0.3);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!,
    center = box.getCenter(new THREE.Vector3()),
    size = box.getSize(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(
    (spec.width * 2) / size.x,
    (spec.height * 2) / size.y,
    (spec.depth * 2) / size.z,
  );
  geometry.computeVertexNormals();
  const material = (
    Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  ) as THREE.MeshStandardMaterial;
  let map = material.map;
  const image = map?.image as
    | (CanvasImageSource & { width: number; height: number })
    | undefined;
  if (
    map &&
    image &&
    (Math.max(image.width, image.height) > 1024 || spec.shape === "mango")
  ) {
    const canvas = document.createElement("canvas"),
      factor = 1024 / Math.max(image.width, image.height);
    canvas.width = Math.round(image.width * factor);
    canvas.height = Math.round(image.height * factor);
    canvas
      .getContext("2d")!
      .drawImage(image, 0, 0, canvas.width, canvas.height);
    if (spec.shape === "mango") {
      const ctx = canvas.getContext("2d")!,
        pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const light =
          (pixels.data[i] * 0.25 +
            pixels.data[i + 1] * 0.65 +
            pixels.data[i + 2] * 0.1) /
          185;
        pixels.data[i] = Math.min(255, 252 * light);
        pixels.data[i + 1] = Math.min(255, 170 * light);
        pixels.data[i + 2] = Math.min(255, 40 * light);
      }
      ctx.putImageData(pixels, 0, 0);
    }
    const resized = new THREE.CanvasTexture(canvas);
    resized.colorSpace = THREE.SRGBColorSpace;
    resized.flipY = false;
    map.dispose();
    map = resized;
  }
  return { geometry, map, source: path };
}
