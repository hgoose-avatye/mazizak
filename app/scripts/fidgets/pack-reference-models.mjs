// Pack the reference 3D models of 모닝빵 (S02) and 찹쌀떡 (S03) for the PUBLIC build:
//   <local reference folder>/models/{bread,peachmochi}.glb   →   public/models/{bread,peachmochi}.glb  (+ models.json)
//
// The project owner chose to ship these two models (2026-11-16, the owner's statement). The originals are
// 1.3 MB and 8.3 MB because they carry 4096-pixel PNG textures (three of them for the mochi). The game reads only the FIRST mesh and its
// base-colour texture (references.ts: meshFromGltf), shrinks that texture to 1024 px anyway and recomputes the normals, so the packed file
// keeps exactly that: positions (with the node transforms baked in), UVs, indices and the base-colour texture as a 1024 px JPEG.
//
// Usage: FFMPEG=/path/to/ffmpeg node scripts/fidgets/pack-reference-models.mjs          (re-runnable)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SRC = path.join(process.env.MANZIZAK_LOCAL_FIDGET_DIR ?? `${os.homedir()}/Music/MANZIZAK/dev-reference/fidgets`, 'models');
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/models');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const MAX_TEX = 1024;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const MODELS = { bread: { toy: 'S02', name: '모닝빵' }, peachmochi: { toy: 'S03', name: '찹쌀떡' } };

// ── glb reading ──
function readGlb(buf) {
  if (buf.toString('ascii', 0, 4) !== 'glTF' || buf.readUInt32LE(4) !== 2) throw new Error('not a glTF 2 binary');
  let off = 12, json, bin;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4), chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  return { json, bin };
}
const COMPONENT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
/** accessor → a tightly packed copy (honours byteStride), as plain numbers */
function readAccessor(json, bin, index) {
  const a = json.accessors[index], bv = json.bufferViews[a.bufferView], [Type, size] = COMPONENT[a.componentType], w = WIDTH[a.type];
  if (a.sparse) throw new Error('sparse accessors are not supported');
  const stride = bv.byteStride || size * w, base = (bv.byteOffset || 0) + (a.byteOffset || 0), out = new Float64Array(a.count * w);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  for (let i = 0; i < a.count; i++) for (let k = 0; k < w; k++) out[i * w + k] = size === 1 ? dv[get](base + i * stride + k) : dv[get](base + i * stride + k * size, true);
  if (a.normalized) throw new Error('normalized attributes are not supported');
  return { data: out, width: w, count: a.count, Type };
}
// ── node transforms (column-major 4×4) ──
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function local(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
/** world matrix of the first node (depth first, in scene order) that carries a mesh */
function firstMeshNode(json) {
  const scene = json.scenes[json.scene ?? 0];
  const walk = (i, parent) => {
    const n = json.nodes[i], world = mul(parent, local(n));
    if (n.mesh !== undefined) return { node: n, world };
    for (const c of n.children ?? []) { const r = walk(c, world); if (r) return r; }
    return null;
  };
  for (const i of scene.nodes) { const r = walk(i, IDENTITY); if (r) return r; }
  throw new Error('no mesh node');
}

function pack(name) {
  const srcFile = path.join(SRC, `${name}.glb`), original = fs.readFileSync(srcFile);
  const { json, bin } = readGlb(original);
  const { node, world } = firstMeshNode(json);
  const prim = json.meshes[node.mesh].primitives[0];
  const pos = readAccessor(json, bin, prim.attributes.POSITION), uv = readAccessor(json, bin, prim.attributes.TEXCOORD_0), idx = readAccessor(json, bin, prim.indices);
  // positions with the node transform baked in (the runtime used to apply mesh.matrixWorld itself)
  const P = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.data[i * 3], y = pos.data[i * 3 + 1], z = pos.data[i * 3 + 2];
    for (let r = 0; r < 3; r++) P[i * 3 + r] = world[r] * x + world[4 + r] * y + world[8 + r] * z + world[12 + r];
  }
  const UV = Float32Array.from(uv.data);
  const index = pos.count < 65536 ? Uint16Array.from(idx.data) : Uint32Array.from(idx.data);
  // base-colour texture → ≤ 1024 px JPEG (the only image the game uses)
  const mat = json.materials[prim.material], texIndex = mat.pbrMetallicRoughness.baseColorTexture.index, imgIndex = json.textures[texIndex].source, im = json.images[imgIndex], bv = json.bufferViews[im.bufferView];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-glb-'));
  fs.writeFileSync(path.join(tmp, 'in.img'), bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
  const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', path.join(tmp, 'in.img'), '-vf', `scale='min(${MAX_TEX},iw)':'min(${MAX_TEX},ih)':force_original_aspect_ratio=decrease:flags=lanczos`, '-q:v', '3', path.join(tmp, 'out.jpg')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  const jpg = fs.readFileSync(path.join(tmp, 'out.jpg'));
  const size = spawnSync(FFMPEG, ['-hide_banner', '-i', path.join(tmp, 'out.jpg')], { encoding: 'utf8' }).stderr.match(/, (\d+)x(\d+)/);
  fs.rmSync(tmp, { recursive: true, force: true });

  // ── write a minimal GLB: one node, one mesh, one JPEG-textured material ──
  const pad = (b, v = 0) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, v)]);
  const parts = [Buffer.from(P.buffer), Buffer.from(UV.buffer), pad(Buffer.from(index.buffer)), pad(jpg)];
  const offs = []; let o = 0; for (const p of parts) { offs.push(o); o += p.length; }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.count; i++) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[i * 3 + k]); max[k] = Math.max(max[k], P[i * 3 + k]); }
  const out = {
    asset: { version: '2.0', generator: 'scripts/fidgets/pack-reference-models.mjs' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: name }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 } }],
    textures: [{ source: 0, sampler: 0 }], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    images: [{ bufferView: 3, mimeType: 'image/jpeg' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.count, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: pos.count, type: 'VEC2' },
      { bufferView: 2, componentType: index instanceof Uint16Array ? 5123 : 5125, count: index.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offs[0], byteLength: P.byteLength, target: 34962 },
      { buffer: 0, byteOffset: offs[1], byteLength: UV.byteLength, target: 34962 },
      { buffer: 0, byteOffset: offs[2], byteLength: index.byteLength, target: 34963 },
      { buffer: 0, byteOffset: offs[3], byteLength: jpg.length },
    ],
    buffers: [{ byteLength: o }],
  };
  const jsonChunk = pad(Buffer.from(JSON.stringify(out), 'utf8'), 0x20), binChunk = Buffer.concat(parts);
  const head = Buffer.alloc(12); head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  const glb = Buffer.concat([head, ch(jsonChunk.length, 0x4e4f534a), jsonChunk, ch(binChunk.length, 0x004e4942), binChunk]);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.glb`), glb);
  return {
    toy: MODELS[name].toy, name: MODELS[name].name, file: `${name}.glb`,
    original: { file: `${name}.glb`, bytes: original.length, sha256: sha(original), images: json.images.length, mesh: `${pos.count} vertices, ${idx.count / 3} triangles` },
    packed: { bytes: glb.length, sha256: sha(glb), vertices: pos.count, triangles: index.length / 3, texture: { mime: 'image/jpeg', width: +size[1], height: +size[2], bytes: jpg.length } },
  };
}
const entries = Object.keys(MODELS).map(pack);
const manifest = {
  _doc: 'Reference 3D models of 모닝빵 (S02) and 찹쌀떡 (S03) shipped with the app. Packed by scripts/fidgets/pack-reference-models.mjs.',
  clearance: {
    status: 'permission to use in the public build obtained',
    statedBy: 'project owner',
    statedOn: '2026-11-16',
    note: "The owner's statement; the permission terms are not stored in the repository. The exact source of the files is not recorded (the local reference folder holds the originals).",
  },
  models: entries,
};
fs.writeFileSync(path.join(OUT, 'models.json'), JSON.stringify(manifest, null, 1) + '\n');
for (const e of entries) console.log(`${e.file.padEnd(16)} ${(e.original.bytes / 1e6).toFixed(2)} MB → ${(e.packed.bytes / 1e3).toFixed(0)} KB  (${e.packed.vertices} vertices, texture ${e.packed.texture.width}×${e.packed.texture.height} JPEG ${(e.packed.texture.bytes / 1e3).toFixed(0)} KB)`);
