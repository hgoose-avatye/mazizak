import * as THREE from 'three';

/**
 * Procedural photo-studio environment (softboxes in a neutral room), baked to
 * a PMREM env map once. Gives broad, clean highlights that read as "product
 * photography" instead of the many small hotspots of a generic room.
 * Cached per renderer.
 */
const cache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const hit = cache.get(renderer);
  if (hit) return hit;
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(20, 12, 20),
    new THREE.MeshBasicMaterial({ color: 0x8a8682, side: THREE.BackSide }),
  );
  room.position.y = 4;
  scene.add(room);
  // floor slightly darker (bounce)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0x6b6764 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.9;
  scene.add(floor);

  const box = (w: number, h: number, intensity: number, pos: THREE.Vector3, look: THREE.Vector3, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.copy(pos);
    m.lookAt(look);
    scene.add(m);
  };
  const c = new THREE.Vector3(0, 0, 0);
  box(9, 6, 5.5, new THREE.Vector3(0, 9.5, 1), c); // big top softbox
  box(3.2, 6, 6.5, new THREE.Vector3(-7, 3.5, 5), c, 0xfff6ee); // key (warm) front-left strip
  box(2.2, 7, 3.2, new THREE.Vector3(7.5, 3, -3), c, 0xeef4ff); // cool rim right-back
  box(7, 1.6, 2.2, new THREE.Vector3(0, 2.5, -9), c); // back strip

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  cache.set(renderer, tex);
  return tex;
}

/** Soft radial contact-shadow texture. */
export function radialShadowTexture(inner = 0.85, mid = 0.35): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const gr = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  gr.addColorStop(0, `rgba(48,36,32,${inner})`);
  gr.addColorStop(0.42, `rgba(48,36,32,${mid})`);
  gr.addColorStop(1, 'rgba(48,36,32,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
