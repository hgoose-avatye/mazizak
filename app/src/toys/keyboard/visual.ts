import type { KeyVisualStyle } from '../../audio/keyPresets';
import * as THREE from 'three';
import { KEYBOARD_COLORS } from './colors';
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
  setStyle(p: KeyVisualStyle): void;
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

const STYLES = KEYBOARD_COLORS;
const inkFor = (hex: number) => {
  const c = new THREE.Color(hex);
  return c.r * .2126 + c.g * .7152 + c.b * .0722 > .28 ? '#302d2a' : '#f5f1e8';
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

  const switchMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2f, roughness: 0.55 });
  const switchGeo = new THREE.BoxGeometry(0.6, 0.16, 0.6);
  const aniso = renderer.capabilities.getMaxAnisotropy();

  const keys: KeyVisual[] = [];
  const legendMats: { mat: THREE.MeshPhysicalMaterial; side: THREE.MeshPhysicalMaterial; text: string; aspect: number }[] = [];
  // Reuse the same two ink variants per legend across all ten designs.
  const legendCache = new Map<string, THREE.Texture>();
  const makeLegend = (text: string, aspect: number, color: string) => {
    const id = `${text}:${aspect}:${color}`;
    const cached = legendCache.get(id);
    if (cached) return cached;
    const tex = createLegendTexture(text, { color });
    tex.anisotropy = aniso;
    if (aspect !== 1) {
      tex.repeat.set(aspect, 1);
      tex.offset.set(-(aspect - 1) / 2, 0);
    }
    legendCache.set(id, tex);
    return tex;
  };
  const addKey = (geo: THREE.BufferGeometry, x: number, z: number, text: string, halfW: number, aspect = 1) => {
    const theme = STYLES.pebble;
    const color = theme.keys[keys.length];
    const side = new THREE.MeshPhysicalMaterial({ color, roughness: theme.roughness, clearcoat: theme.clearcoat, clearcoatRoughness: .3, specularIntensity: .6 });
    const tex = makeLegend(text, aspect, inkFor(color));
    const top = legendMaterial(side, tex);
    legendMats.push({ mat: top, side, text, aspect });
    const mesh = new THREE.Mesh(geo, [side, top]);
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
      addKey(cap1u, (c - 1) * U, (r - 1.5) * U, LEGENDS[i], CAP / 2);
    }
  const spaceW = COLS * U - (U - CAP);
  addKey(createKeycapGeometry({ width: spaceW, depth: CAP, height: CAP_H }), 0, 1.5 * U, '스페이스', spaceW / 2, spaceW / CAP);

  type StyleId = keyof typeof STYLES;
  let style: StyleId = 'pebble';
  const legendsFor = (p: StyleId) => legendMats.map((l, i) => makeLegend(l.text, l.aspect, inkFor(STYLES[p].keys[i])));
  const applyStyle = (p: StyleId) => {
    const s = STYLES[p];
    caseMat.setValues({ color: s.tray, metalness: s.metalness, roughness: s.caseRoughness, clearcoat: s.clearcoat, clearcoatRoughness: .4 });
    const tex = legendsFor(p);
    legendMats.forEach((l, i) => {
      const finish = { color: s.keys[i], roughness: s.roughness, clearcoat: s.clearcoat };
      l.side.setValues(finish);
      l.mat.setValues(finish);
      l.mat.map = tex[i];
      l.mat.needsUpdate = true;
    });
  };
  applyStyle('pebble');
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
