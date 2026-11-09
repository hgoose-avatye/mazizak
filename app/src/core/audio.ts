/**
 * Minimal low-latency audio engine for the P0 spike.
 *
 * - One AudioContext, created at load (starts 'suspended' on mobile) so that
 *   buffers can be prepared before the first gesture.
 * - `unlock()` must be called from inside a user-gesture event handler.
 *   Which events count as a gesture is exactly what audio-test.html measures.
 * - Sounds are always scheduled even if the context is not running yet; the
 *   engine records whether the context was running at schedule time so the
 *   test page can correlate "audible?" reports with context state.
 * - Respects the iOS silent switch: navigator.audioSession is left at its
 *   default ('auto'), and a user mute toggle is provided.
 */

export interface PlayOpts {
  gainDb?: number;
  /** random detune range in cents (±) */
  detuneCents?: number;
  /** random gain range in dB (±) */
  gainJitterDb?: number;
  pan?: number;
  /** fixed detune in cents (e.g. per-key offset) */
  baseDetune?: number;
  /** start later by this many seconds (e.g. recovery sound after the hold delay) */
  delaySec?: number;
  /** playback rate (changes length and pitch together) */
  rate?: number;
  /** optional low-pass cutoff in Hz (gentle, for soft-touch variants) */
  lowpassHz?: number;
}

export interface UnlockLog {
  eventType: string;
  pointerType?: string;
  t: number;
  stateBefore: AudioContextState | string;
  stateAfterCall: AudioContextState | string;
  userActivationIsActive?: boolean;
  userActivationHasBeen?: boolean;
  resumeResolvedMs?: number;
  resumeError?: string;
}

export interface PlayLog {
  name: string;
  eventType: string;
  stateAtSchedule: string;
  t: number;
  /**
   * played            — context was running, started immediately
   * played-after-resume — context was suspended, resumed within LATE_MS, played (late by delayMs)
   * dropped-late      — context resumed too late; sound discarded so it never plays out of sync
   * pending           — still waiting
   */
  outcome: 'played' | 'played-after-resume' | 'dropped-late' | 'pending' | 'muted' | 'stopped';
  delayMs?: number;
  /** fade out and stop this sound (or cancel it if still pending); not serialized */
  stop?: (fadeSec?: number) => void;
}

/** A sound requested while suspended is only played if the context resumes within this window. */
export const LATE_MS = 80;

class Bag {
  private recent: number[] = [];
  constructor(
    readonly buffers: AudioBuffer[],
    private readonly avoid = 2,
  ) {}
  next(): AudioBuffer {
    const n = this.buffers.length;
    if (n === 1) return this.buffers[0];
    const avoid = Math.min(this.avoid, n - 1);
    let idx = 0;
    for (let tries = 0; tries < 16; tries++) {
      idx = Math.floor(Math.random() * n);
      if (!this.recent.includes(idx)) break;
    }
    this.recent.push(idx);
    if (this.recent.length > avoid) this.recent.shift();
    return this.buffers[idx];
  }
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  started: number;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly offline: boolean;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private bags = new Map<string, Bag>();
  private voices: Voice[] = [];
  readonly maxVoices: number;
  muted = false;

  readonly unlockLogs: UnlockLog[] = [];
  readonly playLogs: PlayLog[] = [];
  onStateChange: (s: string) => void = () => {};

  /** `offline` lets tests render the exact engine graph with an OfflineAudioContext. */
  constructor(maxVoices = 20, offline?: OfflineAudioContext) {
    const Ctor: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = offline ? (offline as unknown as AudioContext) : new Ctor({ latencyHint: 'interactive' });
    this.offline = !!offline;
    this.maxVoices = maxVoices;
    this.limiter = this.ctx.createDynamicsCompressor();
    // approximate limiter (not brick-wall)
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.08;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    // final safety: gentle tanh soft-clip so stacked spiky transients never hard-clip
    const shaper = this.ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.abs(x) < 0.7 ? x : Math.sign(x) * (0.7 + 0.29 * Math.tanh((Math.abs(x) - 0.7) / 0.29));
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    this.master.connect(this.limiter).connect(shaper).connect(this.ctx.destination);
    this.ctx.addEventListener('statechange', () => {
      if (this.ctx.state === 'running') this.flushPending();
      this.onStateChange(this.ctx.state);
    });
  }

  get state(): string {
    return this.ctx.state;
  }

  latencyInfo(): { baseLatency?: number; outputLatency?: number; sampleRate: number } {
    const c = this.ctx as AudioContext & { outputLatency?: number };
    return { baseLatency: c.baseLatency, outputLatency: c.outputLatency, sampleRate: c.sampleRate };
  }

  register(name: string, buffers: AudioBuffer[]): void {
    this.bags.set(name, new Bag(buffers));
  }

  has(name: string): boolean {
    return this.bags.has(name);
  }

  /** Call inside a DOM event handler. Safe to call repeatedly. */
  unlock(ev: Event): void {
    if (this.ctx.state === 'running') return;
    const pe = ev as PointerEvent;
    const ua = (navigator as Navigator & { userActivation?: { isActive: boolean; hasBeenActive: boolean } }).userActivation;
    const log: UnlockLog = {
      eventType: ev.type,
      pointerType: pe.pointerType,
      t: performance.now(),
      stateBefore: this.ctx.state,
      stateAfterCall: '',
      userActivationIsActive: ua?.isActive,
      userActivationHasBeen: ua?.hasBeenActive,
    };
    {
      // Legacy iOS trick: start a 1-sample silent buffer inside the gesture.
      try {
        const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
        const s = this.ctx.createBufferSource();
        s.buffer = b;
        s.connect(this.ctx.destination);
        s.start(0);
      } catch {
        /* ignore */
      }
      const t0 = performance.now();
      this.ctx
        .resume()
        .then(() => {
          log.resumeResolvedMs = performance.now() - t0;
        })
        .catch((err: unknown) => {
          log.resumeError = String(err);
        });
    }
    log.stateAfterCall = this.ctx.state;
    this.unlockLogs.push(log);
    if (this.unlockLogs.length > 200) this.unlockLogs.shift();
  }

  play(name: string, opts: PlayOpts = {}, eventType = ''): PlayLog | null {
    const bag = this.bags.get(name);
    if (!bag) return null;
    const log: PlayLog = { name, eventType, stateAtSchedule: this.ctx.state, t: performance.now(), outcome: 'pending' };
    this.playLogs.push(log);
    if (this.playLogs.length > 200) this.playLogs.shift();
    if (this.muted) {
      log.outcome = 'muted';
      return log;
    }
    if (!this.offline && this.ctx.state !== 'running') {
      const entry = { log, run: () => this.attach(log, this.start(bag, opts)) };
      this.pending.push(entry);
      log.stop = () => {
        this.pending = this.pending.filter((x) => x !== entry);
        log.outcome = 'stopped';
      };
      return log;
    }
    log.outcome = 'played';
    this.attach(log, this.start(bag, opts));
    return log;
  }

  private pending: { log: PlayLog; run: () => void }[] = [];

  private flushPending(): void {
    const now = performance.now();
    for (const p of this.pending) {
      const age = now - p.log.t;
      p.log.delayMs = age;
      if (age <= LATE_MS) {
        p.log.outcome = 'played-after-resume';
        p.run();
      } else {
        p.log.outcome = 'dropped-late';
      }
    }
    this.pending = [];
  }

  /** recent start times (ctx clock) for density-based de-stacking */
  private recentStarts: number[] = [];

  private attach(log: PlayLog, v: Voice): void {
    log.stop = (fadeSec = 0.12) => {
      log.outcome = 'stopped';
      const now = this.ctx.currentTime;
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, fadeSec / 3);
        v.src.stop(now + fadeSec + 0.05);
      } catch {
        /* already stopped */
      }
    };
  }

  private start(bag: Bag, opts: PlayOpts): Voice {
    this.reap();
    // De-stack near-simultaneous one-shots (chords, multi-touch): spread by 0–6 ms and
    // lower gain ~1/sqrt(n) so identical-instant transients don't sum into clipping.
    const nowT = this.ctx.currentTime;
    this.recentStarts = this.recentStarts.filter((t) => nowT - t < 0.03);
    const n = this.recentStarts.length;
    this.recentStarts.push(nowT);
    const spread = n > 0 ? 0.001 + Math.random() * 0.005 : 0;
    const densityDb = n > 0 ? -10 * Math.log10(n + 1) * 0.8 : 0;
    if (this.voices.length >= this.maxVoices) {
      const oldest = this.voices.shift()!;
      const now = this.ctx.currentTime;
      oldest.gain.gain.setTargetAtTime(0, now, 0.003);
      oldest.src.stop(now + 0.02);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = bag.next();
    const detune = (opts.baseDetune ?? 0) + (opts.detuneCents ? (Math.random() * 2 - 1) * opts.detuneCents : 0);
    src.detune.value = detune;
    if (opts.rate) src.playbackRate.value = opts.rate;
    const g = this.ctx.createGain();
    const db = (opts.gainDb ?? 0) + densityDb + (opts.gainJitterDb ? (Math.random() * 2 - 1) * opts.gainJitterDb : 0);
    g.gain.value = Math.pow(10, db / 20);
    let node: AudioNode = src;
    if (opts.lowpassHz) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.lowpassHz;
      f.Q.value = 0.5;
      node = node.connect(f);
    }
    node = node.connect(g);
    if (opts.pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node = node.connect(p);
    }
    node.connect(this.master);
    const when = (opts.delaySec ?? 0) + spread;
    src.start(when > 0 ? this.ctx.currentTime + when : 0);
    const v: Voice = { src, gain: g, started: this.ctx.currentTime };
    src.onended = () => {
      const i = this.voices.indexOf(v);
      if (i >= 0) this.voices.splice(i, 1);
    };
    this.voices.push(v);
    return v;
  }

  get activeVoices(): number {
    return this.voices.length;
  }

  private reap(): void {
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => !v.src.buffer || v.started + v.src.buffer.duration + 0.05 > now);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.01);
  }

  volume = 0.9;
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (!this.muted) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  /** Continuous (looping) sound whose gain/filter are driven every frame. */
  createLoop(buffer: AudioBuffer): ContinuousSound {
    return new ContinuousSound(this.ctx, buffer, this.master);
  }
}

export class ContinuousSound {
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode;
  private filter: BiquadFilterNode;

  constructor(
    private readonly ctx: AudioContext,
    private readonly buffer: AudioBuffer,
    out: AudioNode,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 800;
    this.filter.connect(this.gain).connect(out);
  }

  /** level 0..1, brightness 0..1 */
  set(level: number, brightness: number): void {
    if (!this.src && level > 0.001) {
      this.src = this.ctx.createBufferSource();
      this.src.buffer = this.buffer;
      this.src.loop = true;
      this.src.connect(this.filter);
      this.src.start(0, Math.random() * this.buffer.duration);
    }
    const now = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.6, now, 0.03);
    this.filter.frequency.setTargetAtTime(1200 + brightness * 6000, now, 0.03);
    if (this.src && level <= 0.001) {
      const s = this.src;
      this.src = null;
      s.stop(now + 0.25);
    }
  }
}
