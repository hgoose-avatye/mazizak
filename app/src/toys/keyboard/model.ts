import { Spring, type SpringParams } from '../../core/spring';

/** Screen-space rectangle of a key top (CSS px). */
export interface KeyRect {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface KeyboardParams {
  /** spring toward bottom-out while pressed */
  down: SpringParams;
  /** spring back to top on release */
  up: SpringParams;
}

export const DEFAULT_KB_PARAMS: KeyboardParams = {
  down: { freq: 38, damping: 1.0 },
  up: { freq: 17, damping: 0.5 },
};

/**
 * Hard stops: a real stem is caught by the top housing at rest (travel 0) and bottoms
 * out at full travel (1). On reaching the top the remaining upward speed rebounds
 * downward (into the travel) by this fraction instead of overshooting above rest.
 */
export const TOP_RESTITUTION = 0.12;

export interface KeyPressRecord {
  keyId: number;
  /** press → 90% travel (sim clock) */
  downMs: number | null;
  /** release → settled at top (sim clock) */
  upSettleMs: number | null;
}

class KeyState {
  readonly spring = new Spring(0);
  readonly holders = new Set<string>();
  downAt = 0;
  upAt = 0;
  downMs: number | null = null;
  pendingRecord = false;
}

/**
 * Discrete-key model. A key can be held by several sources (pointer ids or
 * physical keys); it is down while at least one holder remains.
 */
export class KeyboardModel {
  readonly keys: KeyState[];
  readonly records: KeyPressRecord[] = [];
  private bySource = new Map<string, number>();
  private time = 0;

  constructor(
    readonly count: number,
    public params: KeyboardParams = DEFAULT_KB_PARAMS,
  ) {
    this.keys = Array.from({ length: count }, () => new KeyState());
  }

  /** Returns true if this made the key go down (i.e. play the down sound). */
  press(keyId: number, source: string): boolean {
    if (keyId < 0 || keyId >= this.count) return false;
    if (this.bySource.has(source)) return false;
    this.bySource.set(source, keyId);
    const k = this.keys[keyId];
    const wasDown = k.holders.size > 0;
    k.holders.add(source);
    if (!wasDown) {
      k.spring.target = 1;
      k.spring.params = this.params.down;
      k.downAt = this.time;
      k.downMs = null;
      k.pendingRecord = true;
    }
    return !wasDown;
  }

  /** Returns the key id that went up (play the up sound), or -1. */
  release(source: string): number {
    const keyId = this.bySource.get(source);
    if (keyId === undefined) return -1;
    this.bySource.delete(source);
    const k = this.keys[keyId];
    k.holders.delete(source);
    if (k.holders.size === 0) {
      k.spring.target = 0;
      k.spring.params = this.params.up;
      k.upAt = this.time;
      return keyId;
    }
    return -1;
  }

  keyOf(source: string): number {
    return this.bySource.get(source) ?? -1;
  }

  isDown(keyId: number): boolean {
    return this.keys[keyId].holders.size > 0;
  }

  downCount(): number {
    return this.keys.filter((k) => k.holders.size > 0).length;
  }

  update(dt: number): boolean {
    this.time += dt;
    let moving = false;
    this.keys.forEach((k, id) => {
      k.spring.step(dt);
      const s = k.spring;
      if (s.x < 0) {
        s.x = 0;
        if (s.v < 0) s.v = -s.v * TOP_RESTITUTION;
      } else if (s.x > 1) {
        s.x = 1;
        if (s.v > 0) s.v = 0;
      }
      if (k.holders.size > 0 && k.downMs === null && k.spring.x >= 0.9) k.downMs = (this.time - k.downAt) * 1000;
      const settled = k.spring.isSettled(0.002, 0.05);
      if (!settled) moving = true;
      if (k.pendingRecord && k.holders.size === 0 && settled) {
        k.pendingRecord = false;
        this.records.push({ keyId: id, downMs: k.downMs, upSettleMs: (this.time - k.upAt) * 1000 });
        if (this.records.length > 200) this.records.shift();
      }
    });
    return moving;
  }

  travel(keyId: number): number {
    return this.keys[keyId].spring.x;
  }

  reset(): void {
    this.bySource.clear();
    for (const k of this.keys) {
      k.holders.clear();
      k.spring.snap(0);
      k.pendingRecord = false;
    }
  }
}

/**
 * 2D hit test: key whose rect (expanded by `margin`) contains the point;
 * if several, the one whose center is nearest. No raycasting needed.
 */
export function hitTest(rects: KeyRect[], x: number, y: number, margin = 0): number {
  let best = -1;
  let bestD = Infinity;
  for (const r of rects) {
    if (x < r.x0 - margin || x > r.x1 + margin || y < r.y0 - margin || y > r.y1 + margin) continue;
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    // normalize by size so wide keys (space) are not penalized
    const dx = (x - cx) / Math.max(1, r.x1 - r.x0);
    const dy = (y - cy) / Math.max(1, r.y1 - r.y0);
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = r.id;
    }
  }
  return best;
}
