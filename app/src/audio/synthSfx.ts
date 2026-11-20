import type { AudioEngine } from '../core/audio';

/**
 * Small synthesized effects (owner, 2026-11-20) — no sound files, so nothing to download, and they go through the engine's master
 * bus, so the sound switch and the volume apply:
 *  - click: a soft "뽁" for the app's buttons (tabs, toy cards, sound / settings / 초기화, popup buttons)
 *  - squash: the wet squelch of a 뭉개기 toy being pressed flat
 *  - splat: a juice drop landing on the table · tick: a crumb / chunk landing · smear: a rub spreading it like paint
 * Each kind is rate-limited so a burst of 15 drops does not become a wall of noise.
 */
type Kind = 'click' | 'squash' | 'splat' | 'tick' | 'smear';
const MIN_GAP: Record<Kind, number> = { click: 0.03, squash: 0.09, splat: 0.035, tick: 0.03, smear: 0.07 };

export class SynthSfx {
  private last: Record<Kind, number> = { click: -1, squash: -1, splat: -1, tick: -1, smear: -1 };
  private noise: AudioBuffer | null = null;

  constructor(private readonly engine: AudioEngine) {}

  private ready(kind: Kind): boolean {
    const ctx = this.engine.ctx;
    if (ctx.state !== 'running') return false;
    if (ctx.currentTime - this.last[kind] < MIN_GAP[kind]) return false;
    this.last[kind] = ctx.currentTime;
    return true;
  }

  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const ctx = this.engine.ctx, b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (this.noise = b);
  }

  /** an envelope gain: up to `peak` in `attack` s, down to silence over `decay` s */
  private env(peak: number, attack: number, decay: number): GainNode {
    const ctx = this.engine.ctx, g = ctx.createGain(), t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.engine.bus);
    return g;
  }

  private tone(type: OscillatorType, from: number, to: number, dur: number, out: AudioNode) {
    const ctx = this.engine.ctx, o = ctx.createOscillator(), t = ctx.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    o.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(filter: BiquadFilterType, freq: number, q: number, dur: number, out: AudioNode, sweepTo?: number) {
    const ctx = this.engine.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), t = ctx.currentTime;
    src.buffer = this.noiseBuffer();
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    src.connect(f).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** a soft rounded "뽁" */
  click() {
    if (!this.ready('click')) return;
    const g = this.env(0.22, 0.004, 0.09);
    this.tone('sine', 620, 300, 0.09, g);
    this.tone('triangle', 1240, 700, 0.03, this.env(0.05, 0.002, 0.03));
  }

  /** a wet squelch: a low sliding body and a damp, lowpassed slap */
  squash(strength = 1) {
    if (!this.ready('squash')) return;
    const s = Math.max(0.3, Math.min(1, strength));
    this.tone('sine', 190 + Math.random() * 40, 70, 0.16, this.env(0.32 * s, 0.006, 0.16));
    this.hiss('lowpass', 1100, 1.2, 0.18, this.env(0.38 * s, 0.004, 0.18), 280);
  }

  // (the landing / rubbing sounds are noise only — no pitched tone, which read as electronic "뿅"s; owner, 2026-11-20)
  /** a juice drop landing: a tiny wet "찰" */
  splat() {
    if (!this.ready('splat')) return;
    this.hiss('lowpass', 1600 + Math.random() * 900, 0.7, 0.05, this.env(0.07, 0.002, 0.05), 500);
  }

  /** a crumb / chunk landing: a faint "톡" */
  tick() {
    if (!this.ready('tick')) return;
    this.hiss('bandpass', 2600 + Math.random() * 1200, 1.1, 0.018, this.env(0.05, 0.001, 0.018));
  }

  /** a rub spreading it on the table: a soft "슥" */
  smear() {
    if (!this.ready('smear')) return;
    this.hiss('lowpass', 900, 0.6, 0.14, this.env(0.06, 0.04, 0.11), 1700);
  }
}

const shared = new WeakMap<AudioEngine, SynthSfx>();
/** one instance per audio engine (the app shell's buttons and the toys share it) */
export const synthSfx = (engine: AudioEngine): SynthSfx => {
  let s = shared.get(engine);
  if (!s) shared.set(engine, (s = new SynthSfx(engine)));
  return s;
};
