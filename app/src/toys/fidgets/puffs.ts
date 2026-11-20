import * as THREE from "three";

/**
 * Little things that rise from where a toy is touched (owner, 2026-11-20):
 *  - "bubble": 비누 — soap bubbles with a rainbow rim and a glint, wobbling up, swelling a little and popping.
 *  - "steam": 모닝빵 — soft wisps of steam from a warm roll, widening and fading as they rise.
 * Camera-facing sprites from one pooled set (no allocation per frame); `step` says whether any are still alive, so the
 * on-demand render loop keeps drawing only while they are.
 */
export type PuffKind = "bubble" | "steam";

interface Puff {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  age: number;
  life: number;
  size: number;
  velocity: THREE.Vector3;
  phase: number;
}

const MAX = 140;

function bubbleTexture() {
  const S = 256, R = 120, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.translate(S / 2, S / 2);
  // 1. the film: clear in the middle, thicker (more visible) towards the rim
  const film = g.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
  film.addColorStop(0, "rgba(255,255,255,0)");
  film.addColorStop(0.6, "rgba(235,245,255,0.22)");
  film.addColorStop(0.9, "rgba(225,235,255,0.7)");
  film.addColorStop(1, "rgba(210,225,250,0.95)");
  g.fillStyle = film;
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.fill();
  // 2. iridescence running round the film (thin-film colours: magenta → gold → green → cyan → violet)
  g.globalCompositeOperation = "source-atop";
  const hue = typeof g.createConicGradient === "function" ? g.createConicGradient(-0.6, 0, 0) : null;
  if (hue) {
    for (const [at, col] of [[0, "#ff7ad9"], [0.18, "#ffd36e"], [0.36, "#8cf0a8"], [0.55, "#6fd6ff"], [0.75, "#b48cff"], [1, "#ff7ad9"]] as const) hue.addColorStop(at, col);
    g.globalAlpha = 1;
    g.fillStyle = hue;
    g.fillRect(-S / 2, -S / 2, S, S);
    g.globalAlpha = 1;
  }
  // faint swirling bands across the film
  g.lineWidth = 7;
  for (const [r, a0, a1, col] of [[R * 0.78, 3.6, 5.3, "rgba(255,140,220,0.22)"], [R * 0.66, 0.3, 1.9, "rgba(120,220,255,0.2)"], [R * 0.86, 1.6, 2.9, "rgba(255,230,140,0.25)"]] as const) {
    g.strokeStyle = col;
    g.beginPath();
    g.arc(0, 0, r, a0, a1);
    g.stroke();
  }
  g.globalCompositeOperation = "source-over";
  // 3. a crisp bright edge and a soft cool outline, so it reads on a pale backdrop
  g.lineWidth = 2.5;
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.arc(0, 0, R - 2, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3.5;
  g.strokeStyle = "rgba(95,125,175,0.7)"; // reads on the pale backdrops too
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.stroke();
  // 4. reflections: a curved window light top-left, a small glint under it, a soft crescent bottom-right
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.beginPath();
  g.ellipse(-R * 0.42, -R * 0.42, R * 0.26, R * 0.12, -Math.PI / 4, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(-R * 0.16, -R * 0.62, R * 0.06, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = "rgba(255,255,255,0.5)";
  g.beginPath();
  g.arc(0, 0, R * 0.8, 0.25, 1.15);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function steamTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  // a few overlapping soft blobs, so a wisp is not a perfect disc
  for (const [x, y, r, a] of [[64, 70, 48, 0.55], [48, 58, 30, 0.35], [80, 52, 28, 0.3]] as const) {
    const s = g.createRadialGradient(x, y, 0, x, y, r);
    s.addColorStop(0, `rgba(255,255,255,${a})`);
    s.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = s;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Puffs {
  private pool: Puff[] = [];
  private next = 0;
  private texture: THREE.Texture;
  private live = 0;

  constructor(private readonly scene: THREE.Scene, private readonly kind: PuffKind) {
    this.texture = kind === "bubble" ? bubbleTexture() : steamTexture();
    for (let i = 0; i < MAX; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        // steam is a little grey-blue so it shows over a pale backdrop too
        color: kind === "steam" ? 0xeef3f6 : 0xffffff,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 10;
      scene.add(sprite);
      this.pool.push({ sprite, material, age: 0, life: 0, size: 0, velocity: new THREE.Vector3(), phase: 0 });
    }
  }

  /** `count` new ones at world point `at`, nudged out along `out` (the surface normal) */
  emit(at: THREE.Vector3, count: number, out = new THREE.Vector3(0, 1, 0)) {
    for (let n = 0; n < count; n++) {
      const p = this.pool[this.next];
      this.next = (this.next + 1) % MAX;
      const r = () => Math.random() * 2 - 1;
      p.age = 0;
      p.phase = Math.random() * Math.PI * 2;
      if (this.kind === "bubble") {
        p.life = 1.6 + Math.random() * 1.4;
        p.size = 0.14 + Math.random() * 0.3; // big enough to read as bubbles next to the bar
        p.velocity.set(r() * 0.2, 0.4 + Math.random() * 0.35, r() * 0.1).addScaledVector(out, 0.25);
        p.sprite.position.copy(at).addScaledVector(out, 0.04 + Math.random() * 0.05).add(new THREE.Vector3(r() * 0.08, r() * 0.04, r() * 0.05));
      } else {
        p.life = 1.2 + Math.random() * 1;
        p.size = 0.22 + Math.random() * 0.16;
        p.velocity.set(r() * 0.14, 0.55 + Math.random() * 0.35, r() * 0.06); // a puff, not a trickle
        p.sprite.position.copy(at).addScaledVector(out, 0.03).add(new THREE.Vector3(r() * 0.1, 0, r() * 0.06));
      }
      p.sprite.visible = true;
      p.sprite.scale.setScalar(p.size);
      p.material.opacity = 0;
      p.material.rotation = this.kind === "bubble" ? 0 : Math.random() * Math.PI * 2; // a bubble keeps its light top-left
    }
    this.live = this.pool.filter((p) => p.sprite.visible).length;
  }

  /** advance; true while any is still in the air */
  step(dt: number): boolean {
    if (!this.live) return false;
    let live = 0;
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.sprite.visible = false;
        continue;
      }
      live++;
      if (this.kind === "bubble") {
        // wobble up, drifting, slowing a little; swell at the end and pop (a quick fade)
        p.velocity.y *= Math.exp(-dt * 0.4);
        p.sprite.position.addScaledVector(p.velocity, dt);
        p.sprite.position.x += Math.sin(p.age * 3.1 + p.phase) * 0.12 * dt;
        const swell = t > 0.85 ? 1 + (t - 0.85) * 1.6 : 1;
        const k = p.size * (0.6 + 0.4 * Math.min(1, t * 6)) * swell, jiggle = 0.06 * Math.sin(p.age * 9 + p.phase) * (1 - t);
        p.sprite.scale.set(k * (1 + jiggle), k * (1 - jiggle), 1); // a soft wobble as it rises
        p.material.opacity = Math.min(1, t * 8) * (t > 0.9 ? (1 - t) * 10 : 1);
      } else {
        // rise, slow down, curl sideways, widen and fade
        p.velocity.y *= Math.exp(-dt * 0.6);
        p.sprite.position.addScaledVector(p.velocity, dt);
        p.sprite.position.x += Math.sin(p.age * 2.2 + p.phase) * 0.08 * dt;
        p.sprite.scale.setScalar(p.size * (1 + t * 2.2));
        p.material.rotation += dt * 0.3;
        p.material.opacity = 0.95 * Math.min(1, t * 5) * (1 - t) ** 1.2;
      }
    }
    this.live = live;
    return live > 0;
  }

  clear() {
    for (const p of this.pool) p.sprite.visible = false;
    this.live = 0;
  }

  dispose() {
    for (const p of this.pool) {
      this.scene.remove(p.sprite);
      p.material.dispose();
    }
    this.texture.dispose();
  }
}
