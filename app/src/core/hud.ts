import type { Runtime } from './runtime';
import type { AudioEngine } from './audio';
import { round, summarize } from './metrics';

/**
 * Optional performance overlay (Settings → 성능 정보 표시, or ?stats=1).
 * Shows what THIS device measured; "JSON 저장" exports a report.
 */
export class StatsOverlay {
  private el: HTMLDivElement | null = null;
  private pre: HTMLPreElement | null = null;
  private timer = 0;

  constructor(
    private readonly rt: Runtime,
    private readonly audio: AudioEngine,
  ) {
    (window as unknown as { __mzk: unknown }).__mzk = { report: () => this.report(), reset: () => this.reset() };
  }

  show(on: boolean): void {
    if (on && !this.el) {
      this.el = document.createElement('div');
      this.el.className = 'stats';
      this.pre = document.createElement('pre');
      this.pre.style.margin = '0';
      const reset = document.createElement('button');
      reset.textContent = '리셋';
      reset.onclick = () => this.reset();
      const save = document.createElement('button');
      save.textContent = 'JSON 저장';
      save.onclick = () => this.save();
      this.el.append(this.pre, reset, save);
      document.body.appendChild(this.el);
      this.timer = window.setInterval(() => this.update(), 300);
    } else if (!on && this.el) {
      clearInterval(this.timer);
      this.el.remove();
      this.el = null;
    }
  }

  reset(): void {
    for (const r of [this.rt.frameIntervals, this.rt.workTimes, this.rt.inputDelays, this.rt.dispatchDelays, this.rt.queueDelays]) r.clear();
  }

  report(): Record<string, unknown> {
    const fi = this.rt.frameIntervals.values();
    const info = this.rt.renderer.info;
    return {
      at: new Date().toISOString(),
      url: location.href,
      toy: this.rt.toy?.id ?? null,
      device: this.rt.deviceInfo(),
      frames: {
        note: 'rAF interval ms while animating (first frame after idle excluded)',
        interval: summarize(fi),
        longFrameRatioOver20ms: round(this.rt.frameIntervals.fractionAbove(20), 3),
        jsWorkPerFrame: summarize(this.rt.workTimes.values()),
      },
      input: {
        note: 'event.timeStamp → processed in rAF (not photon latency)',
        eventToProcess: summarize(this.rt.inputDelays.values()),
        eventToHandler: summarize(this.rt.dispatchDelays.values()),
        handlerToFrame: summarize(this.rt.queueDelays.values()),
      },
      render: { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures },
      audio: { state: this.audio.state, ...this.audio.latencyInfo(), unlockLogs: this.audio.unlockLogs.slice(-10) },
      toyReport: this.rt.toy?.report?.() ?? null,
    };
  }

  private update(): void {
    if (!this.pre) return;
    const f = summarize(this.rt.frameIntervals.values());
    const w = summarize(this.rt.workTimes.values());
    const d = summarize(this.rt.inputDelays.values());
    const info = this.rt.renderer.info;
    const l = this.audio.latencyInfo();
    const lines = [
      `frame p50 ${f.p50} p95 ${f.p95} max ${f.max} ms (n=${f.n})  fps≈${f.n ? round(1000 / f.p50, 0) : '-'}`,
      `js/frame p95 ${w.p95}  evt→frame p50 ${d.p50} p95 ${d.p95}`,
      `draw ${info.render.calls} tri ${info.render.triangles} dpr ${this.rt.renderer.getPixelRatio()} (↓${this.rt.dprDowngrades})`,
      `audio ${this.audio.state} base ${l.baseLatency === undefined ? 'n/a' : round(l.baseLatency * 1000, 1)}ms out ${l.outputLatency === undefined ? 'n/a' : round(l.outputLatency * 1000, 1)}ms v${this.audio.activeVoices}`,
    ];
    const extra = this.rt.toy?.stats?.();
    if (extra) for (const [k, v] of Object.entries(extra)) lines.push(`${k}: ${v}`);
    this.pre.textContent = lines.join('\n');
  }

  private save(): void {
    const blob = new Blob([JSON.stringify(this.report(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `manzizak-stats-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
