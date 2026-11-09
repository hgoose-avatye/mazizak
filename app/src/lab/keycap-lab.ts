// Visual lab for procedural keycaps + case. Open /lab-keycap.html (dev server).
// ?angle=55 (camera elevation, deg)  ?az=0 (azimuth, deg)  ?fov=30
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createCaseGeometry, createKeycapGeometry, createLegendTexture } from '../toys/keyboard/keycap';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 3));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8e4de);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.42;

const sun = new THREE.DirectionalLight(0xfff6ea, 3.0);
sun.position.set(-2, 6, -0.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 4;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.01;
Object.assign(sun.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: 0.5, far: 15 });
scene.add(sun);

// ---------- layout ----------
const U = 1; // key pitch
const CAP = 0.92;
const CAP_H = 0.4;
const COLS = 3;
const ROWS = 3;
const POCKET_W = COLS * U + 0.16;
const POCKET_D = (ROWS + 1) * U + 0.16;
const WALL = 0.2;
const CASE_H = 0.62;
const INSET = 0.24;
const PLATE_Y = CASE_H - INSET; // pocket floor
const CAP_Y = PLATE_Y + 0.16; // cap bottom (switch housing visible in the gap)

// ---------- materials ----------
const caseMat = new THREE.MeshPhysicalMaterial({
  color: 0xb9bcc1,
  metalness: 1,
  roughness: 0.42,
  clearcoat: 0.25,
  clearcoatRoughness: 0.4,
});
const plateMat = new THREE.MeshPhysicalMaterial({ color: 0x1c1d20, metalness: 0.6, roughness: 0.5 });
const switchMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2f, roughness: 0.55 });
const creamPBT: THREE.MeshPhysicalMaterialParameters = { color: 0xe4d9c2, roughness: 0.58, specularIntensity: 0.6 };
const accentPBT = { ...creamPBT, color: 0xd9643a };

/** top-face material: base PBT with a premultiplied legend composited over the albedo. */
function legendMaterial(params: THREE.MeshPhysicalMaterialParameters, tex: THREE.Texture): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ ...params, map: tex });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace(
      '#include <map_fragment>',
      'vec4 lg = texture2D( map, vMapUv ); diffuseColor.rgb = diffuseColor.rgb * ( 1.0 - lg.a ) + lg.rgb;',
    );
  };
  m.customProgramCacheKey = () => 'legend';
  return m;
}

// ---------- case + plate ----------
const caseGeo = createCaseGeometry({ width: POCKET_W + 2 * WALL, depth: POCKET_D + 2 * WALL, height: CASE_H, radius: 0.3, wall: WALL, inset: INSET });
const caseMesh = new THREE.Mesh(caseGeo, caseMat);
caseMesh.castShadow = caseMesh.receiveShadow = true;
scene.add(caseMesh);
const plate = new THREE.Mesh(new THREE.BoxGeometry(POCKET_W - 0.04, 0.03, POCKET_D - 0.04), plateMat);
plate.position.y = PLATE_Y + 0.015;
plate.receiveShadow = true;
scene.add(plate);

// ---------- keys ----------
const legends = ['만', '지', '작', '↺', '♪', '★', '1', '2', '3'];
const capGeo1u = createKeycapGeometry({ width: CAP, depth: CAP, height: CAP_H });
const spaceW = COLS * U - (U - CAP);
const capGeoSpace = createKeycapGeometry({ width: spaceW, depth: CAP, height: CAP_H });
const switchGeo = new THREE.BoxGeometry(0.6, 0.16, 0.6);

function addKey(geo: THREE.BufferGeometry, x: number, z: number, params: THREE.MeshPhysicalMaterialParameters, legend: string, aspect = 1): void {
  const tex = createLegendTexture(legend, { color: params === accentPBT ? '#fff4ea' : '#4a443b' });
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (aspect !== 1) {
    // keep glyph proportions on wide keys: shrink horizontally around the centre
    tex.repeat.set(aspect, 1);
    tex.offset.set(-(aspect - 1) / 2, 0);
  }
  const side = new THREE.MeshPhysicalMaterial(params);
  const mesh = new THREE.Mesh(geo, [side, legendMaterial(params, tex)]);
  mesh.position.set(x, CAP_Y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  const sw = new THREE.Mesh(switchGeo, switchMat);
  sw.position.set(x, PLATE_Y + 0.08, z);
  sw.castShadow = true;
  scene.add(sw);
}

for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    addKey(capGeo1u, (c - 1) * U, (r - 1.5) * U, i === 4 ? accentPBT : creamPBT, legends[i]);
  }
addKey(capGeoSpace, 0, 1.5 * U, creamPBT, '스페이스', spaceW / CAP);

// ground contact shadow
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.22 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- camera: fit the board in a portrait viewport ----------
const camera = new THREE.PerspectiveCamera(num('fov', 30), 1, 0.1, 100);
const target = new THREE.Vector3(num('tx', 0), CASE_H * 0.6, num('tz', 0.1));
function resize(): void {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const el = THREE.MathUtils.degToRad(num('angle', 55));
  const az = THREE.MathUtils.degToRad(num('az', 0));
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  // fit: board half extents (projected roughly) vs frustum
  const halfW = (POCKET_W + 2 * WALL) / 2 + 0.15;
  const halfH = ((POCKET_D + 2 * WALL) / 2) * Math.sin(el) + CASE_H + 0.3;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const dist = Math.max(halfW / (tanV * camera.aspect), halfH / tanV) * num('zoom', 1);
  camera.position.copy(target).addScaledVector(dir, dist);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}
addEventListener('resize', resize);
resize();
document.fonts?.ready.then(() => renderer.render(scene, camera));
(window as unknown as { __labReady: boolean }).__labReady = true;
