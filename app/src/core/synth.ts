/**
 * PLACEHOLDER SOUNDS — procedurally synthesized for the technical spike only.
 *
 * These are NOT the product sounds. Per the approved plan, final sounds come
 * from in-house foley recordings. These exist so that latency, round-robin,
 * voice limiting and gesture-unlock behaviour can be tested before recording.
 * Nothing here is derived from third-party recordings.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Mode {
  freq: number;
  decay: number; // seconds (time constant)
  amp: number;
}

interface HitSpec {
  dur: number;
  modes: Mode[];
  /** noise burst amplitude and decay */
  noiseAmp: number;
  noiseDecay: number;
  /** one-pole lowpass coefficient on noise (0..1, higher = brighter) */
  noiseBright: number;
  /** optional second noise layer (friction) */
  frictionAmp?: number;
  frictionDur?: number;
  pitchDrop?: number; // fractional pitch drop over the sound
  attack?: number; // seconds
}

function renderHit(sr: number, spec: HitSpec, rnd: () => number): Float32Array {
  const n = Math.floor(spec.dur * sr);
  const out = new Float32Array(n);
  const attack = spec.attack ?? 0.0006;
  // modal resonators
  for (const m of spec.modes) {
    const ph0 = rnd() * Math.PI * 2;
    let phase = ph0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const drop = spec.pitchDrop ? 1 - spec.pitchDrop * Math.min(1, t / spec.dur) : 1;
      phase += (2 * Math.PI * m.freq * drop) / sr;
      const env = Math.exp(-t / m.decay) * Math.min(1, t / attack);
      out[i] += m.amp * env * Math.sin(phase);
    }
  }
  // transient noise
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const white = rnd() * 2 - 1;
    lp += spec.noiseBright * (white - lp);
    const env = Math.exp(-t / spec.noiseDecay) * Math.min(1, t / attack);
    out[i] += spec.noiseAmp * env * lp;
  }
  // friction layer (band-limited noise with slow envelope)
  if (spec.frictionAmp) {
    const fd = spec.frictionDur ?? 0.03;
    let a = 0;
    let b = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const white = rnd() * 2 - 1;
      a += 0.35 * (white - a);
      b += 0.05 * (a - b);
      const hp = a - b; // crude band-pass
      const env = Math.sin(Math.PI * Math.min(1, t / fd)) * (t < fd ? 1 : 0);
      out[i] += spec.frictionAmp * env * hp;
    }
  }
  // tail fade + normalize-ish
  const fade = Math.floor(0.004 * sr);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] *= 0.8 / peak;
  return out;
}

function toBuffer(ctx: BaseAudioContext, data: Float32Array, gain = 1): AudioBuffer {
  const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
  const ch = b.getChannelData(0);
  for (let i = 0; i < data.length; i++) ch[i] = data[i] * gain;
  return b;
}

export type KeyPresetId = 'pebble' | 'clack' | 'hush';

export const KEY_PRESETS: Record<KeyPresetId, { label: string; note: string }> = {
  pebble: { label: '조약돌', note: '묵직한 저음 (임시 합성음)' },
  clack: { label: '얼음', note: '선명한 고음 (임시 합성음)' },
  hush: { label: '서각서각', note: '조용한 마찰음 (임시 합성음, 비교용)' },
};

/** Generate round-robin sets for one keyboard preset. */
export function makeKeyboardSet(
  ctx: BaseAudioContext,
  preset: KeyPresetId,
  seed = 1,
): { down: AudioBuffer[]; up: AudioBuffer[]; spaceDown: AudioBuffer[]; spaceUp: AudioBuffer[] } {
  const sr = ctx.sampleRate;
  const rnd = mulberry32(seed * 7919 + preset.length);
  const j = (v: number, pct: number) => v * (1 + (rnd() * 2 - 1) * pct);

  const downSpec = (space: boolean): HitSpec => {
    const s = space ? 0.72 : 1;
    switch (preset) {
      case 'pebble':
        return {
          dur: space ? 0.16 : 0.11,
          modes: [
            { freq: j(210 * s, 0.08), decay: j(0.028, 0.15), amp: 1 },
            { freq: j(340 * s, 0.08), decay: j(0.018, 0.15), amp: 0.55 },
            { freq: j(1150 * s, 0.1), decay: j(0.006, 0.2), amp: 0.25 },
          ],
          noiseAmp: 0.5,
          noiseDecay: 0.004,
          noiseBright: 0.25,
        };
      case 'clack':
        return {
          dur: space ? 0.12 : 0.08,
          modes: [
            { freq: j(3100 * s, 0.08), decay: j(0.012, 0.2), amp: 0.7 },
            { freq: j(4700 * s, 0.08), decay: j(0.008, 0.2), amp: 0.45 },
            { freq: j(620 * s, 0.1), decay: j(0.014, 0.2), amp: 0.35 },
          ],
          noiseAmp: 1,
          noiseDecay: 0.003,
          noiseBright: 0.85,
        };
      case 'hush':
        return {
          dur: space ? 0.09 : 0.07,
          modes: [{ freq: j(260 * s, 0.1), decay: j(0.01, 0.2), amp: 0.25 }],
          noiseAmp: 0.15,
          noiseDecay: 0.003,
          noiseBright: 0.3,
          frictionAmp: 1,
          frictionDur: j(0.035, 0.2),
        };
    }
  };
  const upSpec = (space: boolean): HitSpec => {
    const d = downSpec(space);
    return {
      ...d,
      dur: d.dur * 0.7,
      modes: d.modes.map((m) => ({ ...m, freq: m.freq * j(1.12, 0.04), decay: m.decay * 0.6, amp: m.amp * 0.8 })),
      noiseAmp: d.noiseAmp * 0.7,
      frictionAmp: d.frictionAmp ? d.frictionAmp * 0.6 : undefined,
    };
  };
  const upGain = preset === 'clack' ? 0.8 : preset === 'pebble' ? 0.5 : 0.35;
  const presetGain = preset === 'hush' ? 0.6 : preset === 'clack' ? 0.7 : 0.9;
  const make = (fn: () => HitSpec, count: number, g: number) =>
    Array.from({ length: count }, () => toBuffer(ctx, renderHit(sr, fn(), rnd), g * presetGain));
  return {
    down: make(() => downSpec(false), 8, 1),
    up: make(() => upSpec(false), 6, upGain),
    spaceDown: make(() => downSpec(true), 4, 1),
    spaceUp: make(() => upSpec(true), 3, upGain),
  };
}

/** Squishy (TPR jelly) placeholder set. */
export function makeSquishySet(ctx: BaseAudioContext, seed = 3): { press: AudioBuffer[]; pressHard: AudioBuffer[]; release: AudioBuffer[]; friction: AudioBuffer } {
  const sr = ctx.sampleRate;
  const rnd = mulberry32(seed * 104729);
  const j = (v: number, pct: number) => v * (1 + (rnd() * 2 - 1) * pct);

  const press = (hard: boolean): HitSpec => ({
    dur: hard ? 0.2 : 0.14,
    modes: [{ freq: j(hard ? 95 : 120, 0.1), decay: j(0.05, 0.2), amp: 0.6 }],
    noiseAmp: hard ? 1 : 0.7,
    noiseDecay: j(hard ? 0.05 : 0.035, 0.2),
    noiseBright: hard ? 0.12 : 0.08,
    attack: 0.004,
  });
  const release = (): HitSpec => ({
    dur: 0.18,
    modes: [
      { freq: j(300, 0.12), decay: j(0.045, 0.2), amp: 1 },
      { freq: j(610, 0.12), decay: j(0.02, 0.2), amp: 0.25 },
    ],
    noiseAmp: 0.25,
    noiseDecay: 0.01,
    noiseBright: 0.1,
    pitchDrop: 0.25,
    attack: 0.002,
  });
  // friction loop: 1.5 s of soft band-limited noise, loop-friendly crossfade
  const len = Math.floor(1.5 * sr);
  const fr = new Float32Array(len);
  let a = 0;
  let b = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd() * 2 - 1;
    a += 0.2 * (w - a);
    b += 0.02 * (a - b);
    fr[i] = (a - b) * (0.7 + 0.3 * Math.sin(i / sr * 2 * Math.PI * 7 + rnd() * 0.2));
  }
  const xf = Math.floor(0.1 * sr);
  for (let i = 0; i < xf; i++) {
    const k = i / xf;
    fr[i] = fr[i] * k + fr[len - xf + i] * (1 - k);
  }
  const frictionData = fr.subarray(0, len - xf);
  let pk = 0;
  for (const v of frictionData) pk = Math.max(pk, Math.abs(v));

  return {
    press: Array.from({ length: 6 }, () => toBuffer(ctx, renderHit(sr, press(false), rnd), 0.55)),
    pressHard: Array.from({ length: 4 }, () => toBuffer(ctx, renderHit(sr, press(true), rnd), 0.7)),
    release: Array.from({ length: 6 }, () => toBuffer(ctx, renderHit(sr, release(), rnd), 0.6)),
    friction: toBuffer(ctx, frictionData, 0.7 / (pk || 1)),
  };
}

/** Short sharp click for latency measurements (camera / mic). */
export function makeClick(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(0.03 * sr);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] = Math.sin(2 * Math.PI * 2000 * t) * Math.exp(-t / 0.006);
  }
  return toBuffer(ctx, d, 0.9);
}
