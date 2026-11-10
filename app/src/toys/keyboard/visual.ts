import type { KeyPresetId } from '../../audio/keyPresets';
import * as THREE from 'three';
import { createCaseGeometry, createKeycapGeometry, createLegendTexture } from './keycap';

/**
 * Keyboard visual: machined tray case, dark plate, switch housings, sculpted
 * keycaps with legends. Interaction code only sees `keys[]` + `travel`.
 */
export interface KeyVisual {
  object: THREE.Object3D;
  rest: THREE.Vector3;
  halfW: number;
  halfD: number;
  topY: number;
}

export interface KeyboardVisual {
  root: THREE.Group;
  keys: KeyVisual[]; // 9 x 1u then spacebar
  size: THREE.Vector3;
  travel: number;
  setStyle(p: KeyPresetId): void;
  /**
   * Compile shader programs and upload legend textures for the styles not currently shown,
   * so the first setStyle() to them does no GPU compile/upload work (no switch hitch).
   * Call once while idle, after the renderer state (tone mapping, environment) is final.
   */
  prewarm(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
  setShadowQuality(high: boolean): void;
  sun: THREE.DirectionalLight;
}

const U = 1;
const CAP = 0.92;
const CAP_H = 0.4;
const COLS = 3;
const ROWS = 3;
const POCKET_W = COLS * U + 0.16;
const POCKET_D = (ROWS + 1) * U + 0.16;
const WALL = 0.2;
const CASE_H = 0.62;
const INSET = 0.24;
const PLATE_Y = CASE_H - INSET;
const CAP_Y = PLATE_Y + 0.16;
const ACCENT_INDEX = 4;
export const LEGENDS = ['만', '지', '작', '↺', '♪', '★', '1', '2', '3'];

/** PBT/ABS top material compositing a premultiplied legend texture over the albedo. */
function legendMaterial(base: THREE.MeshPhysicalMaterial, tex: THREE.Texture): THREE.MeshPhysicalMaterial {
  const m = base.clone();
  m.map = tex;
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace(
      '#include <map_fragment>',
      'vec4 lg = texture2D( map, vMapUv ); diffuseColor.rgb = diffuseColor.rgb * ( 1.0 - lg.a ) + lg.rgb;',
    );
  };
  m.customProgramCacheKey = () => 'mzk-legend';
  return m;
}

interface Style {
  cap: THREE.MeshPhysicalMaterialParameters;
  accent: THREE.MeshPhysicalMaterialParameters;
  legend: string;
  case: number;
  caseRough: number;
}
const STYLES: Record<KeyPresetId, Style> = {
  // matte cream PBT, warm accent, light aluminium tray
  pebble: {
    cap: { color: 0xe4d9c2, roughness: 0.58, clearcoat: 0, specularIntensity: 0.6 },
    accent: { color: 0xd9643a, roughness: 0.58, clearcoat: 0, specularIntensity: 0.6 },
    legend: '#4a443b',
    case: 0xb9bcc1,
    caseRough: 0.42,
  },
  // soft sage-mint PBT, dusty-rose accent, lilac-grey tray (creamy-thocky: visibly different from pebble's cream/orange)
  'creamy-thocky': {
    cap: { color: 0xcfe0d2, roughness: 0.52, clearcoat: 0.1, clearcoatRoughness: 0.5, specularIntensity: 0.6 },
    accent: { color: 0xe39aa8, roughness: 0.52, clearcoat: 0.1, clearcoatRoughness: 0.5, specularIntensity: 0.6 },
    legend: '#3f4a43',
    case: 0xb8aec4,
    caseRough: 0.46,
  },
  // glossy white ABS, cool accent, dark anodized tray
  clack: {
    cap: { color: 0xf2f2ef, roughness: 0.28, clearcoat: 0.45, clearcoatRoughness: 0.2, specularIntensity: 0.8 },
    accent: { color: 0x3f6fa8, roughness: 0.28, clearcoat: 0.45, clearcoatRoughness: 0.2, specularIntensity: 0.8 },
    legend: '#3b3f46',
    case: 0x45484e,
    caseRough: 0.35,
  },
};

export function buildKeyboardVisual(renderer: THREE.WebGLRenderer): KeyboardVisual {
  const root = new THREE.Group();

  const sun = new THREE.DirectionalLight(0xfff6ea, 3.0);
  sun.position.set(-2, 6, -0.5);
  // Real-time shadow maps rendered fully shadowed in iOS WebKit (simulator) — disabled for robustness.
  sun.castShadow = false;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  Object.assign(sun.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: 0.5, far: 15 });
  root.add(sun);

  const caseMat = new THREE.MeshPhysicalMaterial({ color: 0xb9bcc1, metalness: 1, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.4 });
  const caseMesh = new THREE.Mesh(
    createCaseGeometry({ width: POCKET_W + 2 * WALL, depth: POCKET_D + 2 * WALL, height: CASE_H, radius: 0.3, wall: WALL, inset: INSET }),
    caseMat,
  );
  caseMesh.castShadow = caseMesh.receiveShadow = true;
  root.add(caseMesh);
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(POCKET_W - 0.04, 0.03, POCKET_D - 0.04),
    new THREE.MeshPhysicalMaterial({ color: 0x1c1d20, metalness: 0.6, roughness: 0.5 }),
  );
  plate.position.y = PLATE_Y + 0.015;
  plate.receiveShadow = true;
  root.add(plate);

  const capMat = new THREE.MeshPhysicalMaterial(STYLES.pebble.cap);
  const accentMat = new THREE.MeshPhysicalMaterial(STYLES.pebble.accent);
  const switchMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2f, roughness: 0.55 });
  const switchGeo = new THREE.BoxGeometry(0.6, 0.16, 0.6);
  const aniso = renderer.capabilities.getMaxAnisotropy();

  const keys: KeyVisual[] = [];
  const legendMats: { mat: THREE.MeshPhysicalMaterial; accent: boolean; text: string; aspect: number }[] = [];
  const makeLegend = (text: string, accent: boolean, aspect: number, color: string) => {
    const tex = createLegendTexture(text, { color: accent ? '#fff4ea' : color });
    tex.anisotropy = aniso;
    if (aspect !== 1) {
      tex.repeat.set(aspect, 1);
      tex.offset.set(-(aspect - 1) / 2, 0);
    }
    return tex;
  };
  const addKey = (geo: THREE.BufferGeometry, x: number, z: number, accent: boolean, text: string, halfW: number, aspect = 1) => {
    const tex = makeLegend(text, accent, aspect, STYLES.pebble.legend);
    const top = legendMaterial(accent ? accentMat : capMat, tex);
    legendMats.push({ mat: top, accent, text, aspect });
    const mesh = new THREE.Mesh(geo, [accent ? accentMat : capMat, top]);
    const rest = new THREE.Vector3(x, CAP_Y, z);
    mesh.position.copy(rest);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    const sw = new THREE.Mesh(switchGeo, switchMat);
    sw.position.set(x, PLATE_Y + 0.08, z);
    sw.castShadow = true;
    root.add(sw);
    keys.push({ object: mesh, rest, halfW, halfD: CAP / 2, topY: CAP_Y + CAP_H });
  };

  const cap1u = createKeycapGeometry({ width: CAP, depth: CAP, height: CAP_H });
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      addKey(cap1u, (c - 1) * U, (r - 1.5) * U, i === ACCENT_INDEX, LEGENDS[i], CAP / 2);
    }
  const spaceW = COLS * U - (U - CAP);
  addKey(createKeycapGeometry({ width: spaceW, depth: CAP, height: CAP_H }), 0, 1.5 * U, false, '스페이스', spaceW / 2, spaceW / CAP);

  type StyleId = keyof typeof STYLES;
  let style: StyleId = 'pebble';
  // legend textures per style, created once and kept (re-creating 10 canvases + GPU uploads on every switch caused a hitch)
  const legendTex = new Map<StyleId, THREE.Texture[]>([['pebble', legendMats.map((l) => l.mat.map!)]]);
  const legendsFor = (p: StyleId) => {
    let t = legendTex.get(p);
    if (!t) legendTex.set(p, (t = legendMats.map((l) => makeLegend(l.text, l.accent, l.aspect, STYLES[p].legend))));
    return t;
  };
  const applyStyle = (p: StyleId) => {
    const s = STYLES[p];
    capMat.setValues(s.cap);
    accentMat.setValues(s.accent);
    caseMat.color.set(s.case);
    caseMat.roughness = s.caseRough;
    const tex = legendsFor(p);
    legendMats.forEach((l, i) => {
      l.mat.setValues(l.accent ? s.accent : s.cap);
      l.mat.map = tex[i];
      l.mat.needsUpdate = true;
    });
  };
  return {
    root,
    keys,
    sun,
    size: new THREE.Vector3(POCKET_W + 2 * WALL, CASE_H + CAP_H, POCKET_D + 2 * WALL),
    travel: 0.13,
    setStyle(p) {
      if (p === style) return;
      style = p;
      applyStyle(p);
    },
    prewarm(renderer, scene, camera) {
      const cur = style;
      for (const p of Object.keys(STYLES) as StyleId[]) {
        if (p === cur) continue;
        applyStyle(p);
        renderer.compile(scene, camera); // programs are cached per material → later switches only look them up
        for (const t of legendsFor(p)) renderer.initTexture(t);
      }
      applyStyle(cur);
    },
    setShadowQuality(high) {
      const n = high ? 2048 : 1024;
      if (sun.shadow.mapSize.x !== n) {
        sun.shadow.mapSize.set(n, n);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    },
  };
}
