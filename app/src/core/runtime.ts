import * as THREE from 'three';
import { Rolling } from './metrics';
import type { Toy } from './toy';
import { settings, type Quality } from './settings';

export type PointerKind = 'down' | 'move' | 'up' | 'cancel';

export interface InputEvt {
  kind: PointerKind;
  id: number;
  /** CSS px relative to canvas */
  x: number;
  y: number;
  /** event.timeStamp (same origin as performance.now()) */
  t: number;
  /** performance.now() when our handler ran */
  th?: number;
  pointerType: string;
  /** Optional physical pressure, never inferred from elapsed hold time. */
  pressure?: number;
}

const DPR_STEPS = [2, 1.75, 1.5, 1.25, 1];

/**
 * One WebGL renderer for the whole app + on-demand rAF loop + input queue +
 * frame metrics + adaptive resolution. Toys are swapped in with setToy().
 */
export class Runtime {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  toy: Toy | null = null;

  // metrics (ms)
  readonly frameIntervals = new Rolling(600);
  readonly workTimes = new Rolling(600);
  readonly inputDelays = new Rolling(600);
  readonly dispatchDelays = new Rolling(600);
  readonly queueDelays = new Rolling(600);
  framesRendered = 0;
  dprDowngrades = 0;

  private queue: InputEvt[] = [];
  private rafId = 0;
  private lastT = 0;
  private running = false;
  private activePointers = new Set<number>();
  private dprCap = 2;
  private recent = new Rolling(90);
  private alwaysLoop = new URLSearchParams(location.search).get('loop') === 'always';

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'stage';
    container.appendChild(this.canvas);
    this.applyQuality(settings.get().quality);
    settings.subscribe((s, k) => {
      if (k === 'quality') this.applyQuality(s.quality);
    });

    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.releaseAll();
        this.stop();
      } else {
        this.requestFrame();
      }
    });
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.stop();
    });
    this.canvas.addEventListener('webglcontextrestored', () => this.requestFrame());
  }

  get width(): number {
    return this.canvas.clientWidth;
  }
  get height(): number {
    return this.canvas.clientHeight;
  }

  private applyQuality(q: Quality): void {
    const dpr = window.devicePixelRatio || 1;
    this.dprCap = q === 'saver' ? 1 : 2;
    this.renderer.setPixelRatio(Math.min(dpr, this.dprCap));
    this.recent.clear();
    this.resize();
  }

  setToy(toy: Toy | null): void {
    this.releaseAll();
    this.toy?.leave();
    this.toy = toy;
    this.container.classList.toggle('active', !!toy);
    if (toy) {
      toy.enter();
      this.resize();
      this.renderer.compile(toy.scene, toy.camera);
    }
    this.requestFrame();
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, true);
    this.toy?.resize(w, h);
    this.requestFrame();
  }

  requestFrame(): void {
    if (this.running || !this.toy) return;
    this.running = true;
    this.lastT = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (t: number): void => {
    const toy = this.toy;
    if (!toy) {
      this.running = false;
      return;
    }
    const work0 = performance.now();
    let dt = 1 / 60;
    if (this.lastT > 0) {
      const interval = t - this.lastT;
      this.frameIntervals.push(interval);
      this.recent.push(interval);
      dt = Math.min(interval / 1000, 1 / 20);
    }
    this.lastT = t;

    const input = this.queue;
    this.queue = [];
    const consumeAt = performance.now();
    for (const e of input) {
      this.inputDelays.push(consumeAt - e.t);
      if (e.th !== undefined) {
        this.dispatchDelays.push(e.th - e.t);
        this.queueDelays.push(consumeAt - e.th);
      }
    }

    const animating = toy.frame(dt, input);
    this.renderer.render(toy.scene, toy.camera);
    this.framesRendered++;
    this.workTimes.push(performance.now() - work0);
    this.adapt();

    if (animating || this.alwaysLoop || this.activePointers.size > 0 || this.queue.length > 0) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.running = false;
    }
  };

  /** Auto quality: step resolution down if frames are consistently slow. */
  private adapt(): void {
    if (settings.get().quality !== 'auto' || this.recent.count < 90) return;
    const p50 = this.recent.percentile(50);
    const slow = this.recent.fractionAbove(Math.max(20, p50 * 1.6));
    // on 60/120 Hz displays a healthy p50 is ≤ 17 ms
    if (p50 > 19 || slow > 0.15) {
      const cur = this.renderer.getPixelRatio();
      const next = DPR_STEPS.find((d) => d < cur - 0.01);
      if (next !== undefined) {
        this.renderer.setPixelRatio(next);
        this.resize();
        this.dprDowngrades++;
      }
    }
    this.recent.clear();
  }

  /** Release every tracked pointer on the CURRENT toy right now (not queued for a later toy). */
  private releaseAll(): void {
    const toy = this.toy;
    const cancels: InputEvt[] = [];
    for (const id of this.activePointers) {
      const e: InputEvt = { kind: 'cancel', id, x: 0, y: 0, t: performance.now(), th: performance.now(), pointerType: 'touch' };
      toy?.inputImmediate(e, new Event('pointercancel'));
      cancels.push(e);
    }
    this.activePointers.clear();
    const pending = this.queue.concat(cancels);
    this.queue = [];
    if (toy && pending.length) toy.frame(0, pending);
  }

  private push(e: InputEvt): void {
    if (e.kind === 'move') {
      const last = this.queue[this.queue.length - 1];
      if (last && last.kind === 'move' && last.id === e.id) {
        this.queue[this.queue.length - 1] = { ...e, t: last.t, th: last.th };
        return;
      }
    }
    this.queue.push(e);
    this.requestFrame();
  }

  private bindInput(): void {
    const c = this.canvas;
    const toEvt = (kind: PointerKind, ev: PointerEvent): InputEvt => {
      const r = c.getBoundingClientRect();
      return { kind, id: ev.pointerId, x: ev.clientX - r.left, y: ev.clientY - r.top, t: ev.timeStamp, th: performance.now(), pointerType: ev.pointerType, pressure: ev.pressure };
    };
    c.addEventListener('pointerdown', (ev) => {
      if (!this.toy) return;
      ev.preventDefault();
      try {
        c.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      this.activePointers.add(ev.pointerId);
      const e = toEvt('down', ev);
      this.toy.inputImmediate(e, ev);
      this.push(e);
    });
    c.addEventListener('pointermove', (ev) => {
      if (!this.toy || !this.activePointers.has(ev.pointerId)) return;
      const e = toEvt('move', ev);
      this.toy.inputImmediate(e, ev);
      this.push(e);
    });
    const end = (kind: PointerKind) => (ev: PointerEvent) => {
      if (!this.activePointers.has(ev.pointerId)) return;
      this.activePointers.delete(ev.pointerId);
      const e = toEvt(kind, ev);
      this.toy?.inputImmediate(e, ev);
      this.push(e);
    };
    c.addEventListener('pointerup', end('up'));
    c.addEventListener('pointercancel', end('cancel'));
    c.addEventListener('lostpointercapture', end('cancel'));
    c.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  deviceInfo(): Record<string, unknown> {
    const gl = this.renderer.getContext();
    let gpu = 'unknown';
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    } catch {
      /* ignore */
    }
    return {
      userAgent: navigator.userAgent,
      gpu,
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
      devicePixelRatio: window.devicePixelRatio,
      renderPixelRatio: this.renderer.getPixelRatio(),
      dprDowngrades: this.dprDowngrades,
      canvasCss: [this.width, this.height],
      quality: settings.get().quality,
    };
  }
}
