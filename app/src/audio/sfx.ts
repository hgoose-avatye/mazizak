/**
 * MANZIZAK SFX — physically-motivated procedural synthesis (no recordings).
 *
 * Everything here is generated in-house from math: modal (two-pole resonator)
 * synthesis excited by Hertzian contact-force pulses for the keyboard, and
 * glide-sine / bubble-chirp / stick-slip friction models for the TPR squishy.
 * Only ctx.createBuffer + ctx.sampleRate are used, so it runs in Node with a
 * tiny shim. All randomness comes from seeded PRNGs → fully deterministic.
 */

export type KeySwitchPreset = 'pebble' | 'clack';

export interface KeyboardSounds {
  down: AudioBuffer[];
  up: AudioBuffer[];
  spaceDown: AudioBuffer[];
  spaceUp: AudioBuffer[];
}

export interface SquishySounds {
  press: AudioBuffer[];
  pressHard: AudioBuffer[];
  release: AudioBuffer[];
  friction: AudioBuffer;
  stretch: AudioBuffer;
}

export const SFX_NOTES =
  'All MANZIZAK sound effects in src/audio/sfx.ts are synthesized in-house at load time from ' +
  'physical models (modal resonator banks excited by Hertzian contact-force pulses for the keyboard ' +
  'switches; damped pitch-gliding sines, Minnaert-style bubble chirps, filtered noise and a stick-slip ' +
  'friction oscillator for the TPR squishy) using a seeded PRNG. No recorded, sampled, CC0 or ' +
  'third-party audio of any kind is used or derived from, so there are no external licenses or ' +
  'attributions to track. These are interim sounds pending the in-house foley recordings planned in ' +
  'the design doc §8.6.';

// ───────────────────────────── primitives ─────────────────────────────

const TWO_PI = Math.PI * 2;
/** Peak ceiling: -3 dBFS. */
const CEIL = Math.pow(10, -3 / 20);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rnd = () => number;
/** v × (1 ± pct) uniform */
const jit = (r: Rnd, v: number, pct: number) => v * (1 + (r() * 2 - 1) * pct);
const uni = (r: Rnd, a: number, b: number) => a + (b - a) * r();

interface Mode {
  f: number; // Hz
  tau: number; // amplitude 1/e time, s
  a: number; // relative amplitude
}

/**
 * Two-pole resonator bank driven by `exc`, summed into `out`.
 * Input is pre-scaled by sin(w) so a unit impulse gives a unit-amplitude
 * exponentially decaying sinusoid → `a` is the mode amplitude per unit
 * impulse area at DC-ish excitation.
 */
function resonate(exc: Float32Array, out: Float32Array, sr: number, modes: Mode[], from = 0): void {
  const n = out.length;
  for (const m of modes) {
    if (m.f >= sr * 0.45) continue;
    const w = (TWO_PI * m.f) / sr;
    const r = Math.exp(-1 / (m.tau * sr));
    const c1 = 2 * r * Math.cos(w);
    const c2 = -r * r;
    const g = m.a * Math.sin(w) * sr; // ×sr: excitation pulses have unit area in seconds
    let y1 = 0;
    let y2 = 0;
    const floor = 1e-7;
    let quiet = 0;
    for (let i = from; i < n; i++) {
      const y = c1 * y1 + c2 * y2 + g * exc[i];
      out[i] += y;
      y2 = y1;
      y1 = y;
      // early exit once the mode has died and excitation is over
      if (Math.abs(y) < floor && exc[i] === 0) {
        if (++quiet > 64) break;
      } else quiet = 0;
    }
  }
}

/**
 * Hertzian contact force: half-sine^1.5 pulse of duration `width`, unit area
 * (in seconds·amplitude), scaled by `amp`. Pulse width sets the brightness:
 * spectrum rolls off above ~1/width (hard ABS on aluminium ≈ 0.1 ms,
 * thick PBT on foam-damped PC ≈ 0.8 ms).
 */
function contact(exc: Float32Array, sr: number, t0: number, width: number, amp: number): void {
  const start = t0 * sr;
  const len = Math.max(2, width * sr);
  const i0 = Math.floor(start);
  const i1 = Math.min(exc.length - 1, Math.ceil(start + len));
  let area = 0;
  const tmp: number[] = [];
  for (let i = i0; i <= i1; i++) {
    const x = (i - start) / len;
    const v = x <= 0 || x >= 1 ? 0 : Math.pow(Math.sin(Math.PI * x), 1.5);
    tmp.push(v);
    area += v;
  }
  if (area <= 0) return;
  const k = amp / (area * sr); // pulse area (in seconds) = amp / sr  → resonator mode amplitude ≈ a·amp
  for (let i = i0, j = 0; i <= i1; i++, j++) exc[i] += tmp[j] * k;
}

/** Exponentially decaying white noise burst into exc (contact roughness). */
function noiseBurst(exc: Float32Array, sr: number, t0: number, tau: number, amp: number, r: Rnd): void {
  const i0 = Math.floor(t0 * sr);
  const n = Math.min(exc.length, i0 + Math.ceil(tau * 7 * sr));
  for (let i = i0; i < n; i++) exc[i] += amp * (r() * 2 - 1) * Math.exp(-(i - i0) / (tau * sr));
}

/** One-pole lowpass in place. */
function lowpass(x: Float32Array, sr: number, fc: number): void {
  const a = 1 - Math.exp((-TWO_PI * fc) / sr);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    x[i] = y;
  }
}

/** One-pole highpass in place. */
function highpass(x: Float32Array, sr: number, fc: number): void {
  const a = 1 - Math.exp((-TWO_PI * fc) / sr);
  let lp = 0;
  for (let i = 0; i < x.length; i++) {
    lp += a * (x[i] - lp);
    x[i] = x[i] - lp;
  }
}

/** Smooth random control signal (cosine-interpolated points every `step` s), range ~[-1,1]. */
function smoothNoise(n: number, sr: number, step: number, r: Rnd): Float32Array {
  const out = new Float32Array(n);
  const hop = Math.max(1, Math.floor(step * sr));
  const pts = Math.ceil(n / hop) + 2;
  const p = Array.from({ length: pts }, () => r() * 2 - 1);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(i / hop);
    const f = (i - k * hop) / hop;
    const w = 0.5 - 0.5 * Math.cos(Math.PI * f);
    out[i] = p[k] * (1 - w) + p[k + 1] * w;
  }
  return out;
}

/** Cosine fade-out over the last `fade` seconds (no click at the end). */
function fadeOut(x: Float32Array, sr: number, fade: number): void {
  const m = Math.min(x.length, Math.floor(fade * sr));
  for (let i = 0; i < m; i++) {
    const k = i / m; // 0 at the very end
    x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * k);
  }
}

function peakOf(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}

/** Max short-term RMS (sliding `win` s window, hop win/4) — crude loudness proxy for transients. */
function loudness(src: Float32Array, sr: number, win = 0.02): number {
  // crude loudness weighting: ignore energy below ~150 Hz (phone speakers / ear sensitivity)
  const x = src.slice();
  highpass(x, sr, 150);
  const w = Math.max(1, Math.floor(win * sr));
  const hop = Math.max(1, w >> 2);
  let best = 0;
  for (let s = 0; s < x.length; s += hop) {
    let e = 0;
    const end = Math.min(x.length, s + w);
    for (let i = s; i < end; i++) e += x[i] * x[i];
    best = Math.max(best, e / w);
  }
  return Math.sqrt(best);
}

/** Remove DC with a gentle highpass (also clears sub-sonic offsets from asymmetric pulses). */
function dcBlock(x: Float32Array, sr: number, fc = 25): void {
  highpass(x, sr, fc);
}

/**
 * Loudness-normalize to `target` (short-term RMS), then make sure the peak
 * never exceeds -3 dBFS. Returns the AudioBuffer.
 */
function finish(ctx: BaseAudioContext, x: Float32Array, target: number): AudioBuffer {
  const sr = ctx.sampleRate;
  dcBlock(x, sr);
  const l = loudness(x, sr);
  let g = l > 0 ? target / l : 0;
  const p = peakOf(x) * g;
  if (p > CEIL) g *= CEIL / p;
  const b = ctx.createBuffer(1, x.length, sr);
  const ch = b.getChannelData(0);
  for (let i = 0; i < x.length; i++) ch[i] = x[i] * g;
  return b;
}

// ───────────────────────────── keyboard ─────────────────────────────

interface KeyVoice {
  dur: number;
  width: number; // contact pulse width s
  modes: Mode[];
  roughAmp: number; // contact-roughness noise into resonators
  roughTau: number;
  clickAmp: number; // directly radiated high-passed contact noise
  clickHp: number;
  clickTau: number;
  bounce: [number, number]; // secondary contact (keycap wobble): delay range s, rel amp
  lp: number; // final lowpass (housing/foam damping)
  rattle?: { n: number; amp: number; modes: Mode[] };
  ends?: number; // spacebar: second end contact delay (s)
}

/** Base mode tables (frequencies, decays, amps) per preset — the "material" of the switch+keycap+case. */
function keyModes(preset: KeySwitchPreset): Mode[] {
  return preset === 'pebble'
    ? [
        // deep, round, muted: case/air cavity + thick PBT keycap modes, foam-damped
        { f: 235, tau: 0.018, a: 0.7 },
        { f: 375, tau: 0.015, a: 1.0 },
        { f: 540, tau: 0.011, a: 0.9 },
        { f: 780, tau: 0.008, a: 0.6 },
        { f: 1120, tau: 0.0045, a: 0.35 },
        { f: 1750, tau: 0.0025, a: 0.2 },
        { f: 2900, tau: 0.0012, a: 0.12 },
      ]
    : [
        // bright, snappy, a little hollow ring: thin ABS cap, aluminium plate, empty case
        { f: 430, tau: 0.006, a: 0.3 },
        { f: 1180, tau: 0.012, a: 0.5 },
        { f: 2350, tau: 0.016, a: 0.9 },
        { f: 3280, tau: 0.011, a: 0.75 },
        { f: 4650, tau: 0.008, a: 0.6 },
        { f: 6200, tau: 0.005, a: 0.42 },
        { f: 8300, tau: 0.003, a: 0.22 },
      ];
}

function keySpec(preset: KeySwitchPreset, up: boolean, space: boolean, r: Rnd): KeyVoice {
  const peb = preset === 'pebble';
  // whole-key pitch offset (keycap size/position) shared by all modes → coherent variation
  const kf = jit(r, 1, up ? 0.07 : 0.045) * (up ? (peb ? 1.18 : 1.08) : 1) * (space ? (peb ? 0.66 : 0.62) : 1);
  const kt = (up ? 0.6 : 1) * (space ? 1.6 : 1);
  const modes = keyModes(preset).map((m) => ({
    f: jit(r, m.f * kf, 0.035), // individual mode scatter
    tau: jit(r, m.tau * kt, 0.15),
    a: jit(r, m.a, 0.3) * (up && m.f < 500 ? 0.6 : 1), // top-out excites the case less
  }));
  const v: KeyVoice = peb
    ? {
        dur: space ? 0.22 : up ? 0.075 : 0.11,
        width: jit(r, up ? 0.85e-3 : 0.6e-3, 0.15),
        modes,
        roughAmp: 0.15,
        roughTau: 0.0015,
        clickAmp: up ? 0.05 : 0.14,
        clickHp: 1800,
        clickTau: 0.0006,
        bounce: [uni(r, 0.003, 0.007), uni(r, 0.08, 0.2)],
        lp: space ? 3000 : 4500,
      }
    : {
        dur: space ? 0.2 : up ? 0.07 : 0.085,
        width: jit(r, up ? 0.14e-3 : 0.11e-3, 0.2),
        modes,
        roughAmp: 0.3,
        roughTau: 0.0008,
        clickAmp: up ? 0.35 : 0.5,
        clickHp: 3500,
        clickTau: 0.0005,
        bounce: [uni(r, 0.0015, 0.0045), uni(r, 0.15, 0.35)],
        lp: 14000,
      };
  if (space) {
    v.ends = uni(r, 0.0008, 0.0028);
    // stabilizer wire rattle: tiny delayed contacts ringing a thin steel wire + housing
    const wf = jit(r, peb ? 1700 : 2400, 0.08);
    v.rattle = {
      n: (up ? 2 : 3) + Math.floor(r() * 3),
      amp: peb ? 0.07 : 0.12,
      modes: [
        { f: wf, tau: 0.004, a: 1 },
        { f: wf * 2.76, tau: 0.0025, a: 0.6 },
        { f: wf * 5.4, tau: 0.0012, a: 0.3 },
        { f: wf * 0.31, tau: 0.008, a: 0.5 },
      ],
    };
  }
  return v;
}

function renderKey(sr: number, v: KeyVoice, r: Rnd): Float32Array {
  const n = Math.floor(v.dur * sr);
  const exc = new Float32Array(n);
  const out = new Float32Array(n);
  // main bottom-out / top-out contact at t=0 (onset within the first ms)
  contact(exc, sr, 0, v.width, 1);
  if (v.ends !== undefined) contact(exc, sr, v.ends, v.width * 1.2, uni(r, 0.5, 0.8));
  contact(exc, sr, v.bounce[0], v.width * 0.8, v.bounce[1]);
  // roughness: random "area" ≈ roughAmp relative to the main pulse
  noiseBurst(exc, sr, 0, v.roughTau, v.roughAmp / (sr * Math.sqrt(v.roughTau * sr)), r);
  resonate(exc, out, sr, v.modes);

  // directly radiated contact click (high-passed noise burst)
  if (v.clickAmp > 0) {
    const cl = new Float32Array(Math.min(n, Math.ceil(v.clickTau * 10 * sr)));
    for (let i = 0; i < cl.length; i++) cl[i] = (r() * 2 - 1) * Math.exp(-i / (v.clickTau * sr));
    highpass(cl, sr, v.clickHp);
    for (let i = 0; i < cl.length; i++) out[i] += v.clickAmp * cl[i];
  }

  if (v.rattle) {
    const ex2 = new Float32Array(n);
    let t = uni(r, 0.006, 0.012);
    for (let k = 0; k < v.rattle.n && t < v.dur * 0.6; k++) {
      contact(ex2, sr, t, 0.12e-3, v.rattle.amp * uni(r, 0.4, 1) * Math.pow(0.7, k));
      t += uni(r, 0.006, 0.02);
    }
    resonate(ex2, out, sr, v.rattle.modes);
  }

  lowpass(out, sr, v.lp);
  fadeOut(out, sr, Math.min(0.02, v.dur * 0.25));
  return out;
}

/** Target short-term RMS per role (absolute, matched across presets). */
const KEY_TARGET = 0.16;
const KEY_ROLE: Record<KeySwitchPreset, { up: number; space: number; spaceUp: number }> = {
  pebble: { up: 0.55, space: 1.1, spaceUp: 0.55 },
  clack: { up: 0.7, space: 1.0, spaceUp: 0.7 },
};

export function buildKeyboardSounds(ctx: BaseAudioContext, preset: KeySwitchPreset): KeyboardSounds {
  const sr = ctx.sampleRate;
  const r = mulberry32(preset === 'pebble' ? 0x9e3779b1 : 0x85ebca6b);
  const role = KEY_ROLE[preset];
  const make = (count: number, up: boolean, space: boolean, gain: number) =>
    Array.from({ length: count }, () => {
      const v = keySpec(preset, up, space, r);
      return finish(ctx, renderKey(sr, v, r), KEY_TARGET * gain * jit(r, 1, 0.06));
    });
  return {
    down: make(12, false, false, 1),
    up: make(10, true, false, role.up),
    spaceDown: make(6, false, true, role.space),
    spaceUp: make(5, true, true, role.spaceUp),
  };
}

// ───────────────────────────── squishy ─────────────────────────────

/** Damped sine with exponential pitch glide; attack shaped by a fast raised-cosine. */
function glideTone(
  out: Float32Array,
  sr: number,
  f0: number,
  fEndRatio: number,
  glideTau: number,
  attack: number,
  tau: number,
  amp: number,
  phase0 = 0,
  wobble?: { hz: number; depth: number; tau: number },
): void {
  let ph = phase0;
  const na = Math.max(1, attack * sr);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const f = f0 * (fEndRatio + (1 - fEndRatio) * Math.exp(-t / glideTau));
    ph += (TWO_PI * f) / sr;
    let env = Math.exp(-t / tau);
    if (i < na) env *= Math.sin((Math.PI / 2) * (i / na));
    if (wobble) env *= 1 + wobble.depth * Math.sin(TWO_PI * wobble.hz * t) * Math.exp(-t / wobble.tau);
    if (env < 1e-6 && i > na) break;
    out[i] += amp * env * Math.sin(ph);
  }
}

/** Minnaert-style bubble: damped sine whose pitch rises as it closes (van den Doel 2005). */
function bubble(out: Float32Array, sr: number, t0: number, f0: number, tau: number, amp: number, rise: number): void {
  const i0 = Math.floor(t0 * sr);
  const n = Math.min(out.length, i0 + Math.ceil(tau * 7 * sr));
  let ph = 0;
  for (let i = i0; i < n; i++) {
    const t = (i - i0) / sr;
    const f = f0 * (1 + rise * (t / tau));
    ph += (TWO_PI * f) / sr;
    const a = Math.min(1, (i - i0) / (0.0003 * sr)); // 0.3 ms anti-click attack
    out[i] += amp * a * Math.exp(-t / tau) * Math.sin(ph);
  }
}

/** Band-limited noise layer with attack/decay envelope. */
function noiseLayer(
  out: Float32Array,
  sr: number,
  hp: number,
  lp: number,
  attack: number,
  tau: number,
  amp: number,
  r: Rnd,
): void {
  const x = new Float32Array(out.length);
  for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1;
  highpass(x, sr, hp);
  lowpass(x, sr, lp);
  lowpass(x, sr, lp * 1.5);
  const na = Math.max(1, attack * sr);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t / tau) * (i < na ? Math.sin((Math.PI / 2) * (i / na)) : 1);
    out[i] += amp * env * x[i];
  }
}

function renderPress(sr: number, hard: boolean, r: Rnd): Float32Array {
  const dur = hard ? 0.28 : 0.2;
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  // body compression thump: low sine sagging in pitch as the blob flattens
  const f0 = hard ? uni(r, 120, 145) : uni(r, 150, 185);
  glideTone(out, sr, f0, jit(r, 0.72, 0.08), jit(r, 0.05, 0.3), uni(r, 0.0015, 0.003), hard ? 0.05 : 0.038, 1, uni(r, 0, 0.8));
  // rubbery 2nd/3rd partials (TPR nonlinearity), quickly damped
  glideTone(out, sr, f0 * jit(r, 2.05, 0.04), 0.75, 0.04, 0.002, 0.022, hard ? 0.5 : 0.4, uni(r, 0, 1));
  glideTone(out, sr, f0 * jit(r, 3.3, 0.05), 0.8, 0.03, 0.002, 0.012, 0.22, uni(r, 0, 1));
  // air squeezed out of the contact patch: soft band noise
  noiseLayer(out, sr, 300, hard ? 1400 : 1100, 0.004, hard ? 0.05 : 0.035, hard ? 0.9 : 0.7, r);
  // wet/sticky surface: a few rising bubble chirps (glossy skin unsticking)
  const nb = hard ? 5 + Math.floor(r() * 4) : 3 + Math.floor(r() * 3);
  for (let k = 0; k < nb; k++) {
    const t0 = 0.002 + -Math.log(1 - r() * 0.95) * (hard ? 0.035 : 0.025);
    if (t0 > dur * 0.6) continue;
    bubble(out, sr, t0, uni(r, 380, 1300), uni(r, 0.004, 0.009), uni(r, 0.12, 0.3) * (hard ? 1.2 : 1), uni(r, 0.15, 0.4));
  }
  // micro-crackle of the sticky film (very quiet)
  const cr = new Float32Array(n);
  const ncr = hard ? 18 : 10;
  for (let k = 0; k < ncr; k++) {
    const i = Math.floor(uni(r, 0.003, hard ? 0.09 : 0.06) * sr);
    if (i < n) cr[i] += (r() < 0.5 ? -1 : 1) * uni(r, 0.3, 1);
  }
  const crOut = new Float32Array(n);
  resonate(cr, crOut, sr, [{ f: jit(r, 2600, 0.15), tau: 0.0012, a: 0.05 / sr }]);
  for (let i = 0; i < n; i++) out[i] += crOut[i];
  lowpass(out, sr, 4500);
  fadeOut(out, sr, 0.03);
  return out;
}

function renderRelease(sr: number, r: Rnd): Float32Array {
  const dur = 0.25;
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  // rebound "boing/탱": rubber blob snapping back, pitch falling as it relaxes, with a jiggle
  const f0 = uni(r, 300, 420);
  const wob = { hz: uni(r, 12, 18), depth: uni(r, 0.2, 0.35), tau: 0.08 };
  const drop = uni(r, 0.52, 0.68); // how far the pitch falls as the rubber relaxes
  const gt = uni(r, 0.025, 0.045);
  glideTone(out, sr, f0, drop, gt, 0.0008, jit(r, 0.05, 0.2), 1, uni(r, 0, 1), wob);
  glideTone(out, sr, f0 * jit(r, 2.0, 0.03), drop, gt, 0.0008, 0.022, uni(r, 0.2, 0.35), uni(r, 0, 6), wob);
  glideTone(out, sr, f0 * jit(r, 0.5, 0.05), 0.8, 0.05, 0.003, 0.04, 0.3, uni(r, 0, 6)); // low body
  // suction pop as the skin leaves the finger
  const pop = new Float32Array(n);
  noiseBurst(pop, sr, 0, 0.0012, 0.25, r);
  const popOut = new Float32Array(n);
  resonate(pop, popOut, sr, [
    { f: jit(r, 1100, 0.15), tau: 0.0025, a: 0.35 / sr },
    { f: jit(r, 1900, 0.15), tau: 0.0015, a: 0.2 / sr },
  ]);
  for (let i = 0; i < n; i++) out[i] += popOut[i];
  lowpass(out, sr, 5000);
  fadeOut(out, sr, 0.035);
  return out;
}

/**
 * Build a seamless loop: render `len + xf` samples with `gen`, then equal-power
 * crossfade the tail [len, len+xf) into the head. out[len-1] → out[0] continues
 * the original signal exactly (gen[len-1] → gen[len]), so the seam is continuous.
 */
function seamless(sr: number, seconds: number, gen: (n: number) => Float32Array): Float32Array {
  const len = Math.floor(seconds * sr);
  const xf = Math.floor(0.12 * sr);
  const a = gen(len + xf);
  const out = a.slice(0, len);
  for (let i = 0; i < xf; i++) {
    const k = (i + 0.5) / xf;
    out[i] = a[i] * Math.sin((Math.PI / 2) * k) + a[len + i] * Math.cos((Math.PI / 2) * k);
  }
  return out;
}

/** Rubber-on-finger rub with intermittent stick-slip squeaks. */
function genFriction(sr: number, r: Rnd): (n: number) => Float32Array {
  return (n) => {
    const out = new Float32Array(n);
    // soft rub bed
    const bed = new Float32Array(n);
    for (let i = 0; i < n; i++) bed[i] = r() * 2 - 1;
    highpass(bed, sr, 250);
    lowpass(bed, sr, 2200);
    lowpass(bed, sr, 3000);
    const pres = smoothNoise(n, sr, 0.09, r); // finger pressure fluctuation
    for (let i = 0; i < n; i++) out[i] += 0.5 * bed[i] * (0.7 + 0.3 * pres[i]);
    // stick-slip: relaxation oscillator, slip pulses only when "stuck" gate is open
    const gate = smoothNoise(n, sr, 0.13, r);
    const fmod = smoothNoise(n, sr, 0.07, r);
    const exc = new Float32Array(n);
    let ph = r();
    for (let i = 0; i < n; i++) {
      const g = Math.max(0, gate[i] - 0.15) / 0.85; // squeak ≈ 35% of the time
      const f = 330 * (1 + 0.3 * fmod[i]) * (1 + 0.04 * (r() - 0.5));
      ph += f / sr;
      if (ph >= 1) {
        ph -= 1;
        if (g > 0) exc[i] += g * g * uni(r, 0.6, 1);
      }
    }
    const sq = new Float32Array(n);
    resonate(exc, sq, sr, [
      { f: 950, tau: 0.004, a: 0.4 / sr },
      { f: 1700, tau: 0.003, a: 0.3 / sr },
      { f: 520, tau: 0.005, a: 0.25 / sr },
    ]);
    for (let i = 0; i < n; i++) out[i] += sq[i];
    return out;
  };
}

/** Rubber stretching creak: irregular tick train ringing low-mid modes, over a soft tension bed. */
function genStretch(sr: number, r: Rnd): (n: number) => Float32Array {
  return (n) => {
    const out = new Float32Array(n);
    const bed = new Float32Array(n);
    for (let i = 0; i < n; i++) bed[i] = r() * 2 - 1;
    highpass(bed, sr, 120);
    lowpass(bed, sr, 600);
    lowpass(bed, sr, 900);
    const sw = smoothNoise(n, sr, 0.2, r);
    for (let i = 0; i < n; i++) out[i] += 0.35 * bed[i] * (0.75 + 0.25 * sw[i]);
    const rate = smoothNoise(n, sr, 0.15, r);
    const dens = smoothNoise(n, sr, 0.11, r);
    const exc = new Float32Array(n);
    let next = 0;
    for (let i = 0; i < n; i++) {
      if (i >= next) {
        const hz = 55 * (1 + 0.5 * rate[i]); // 27–83 ticks/s
        next = i + Math.max(1, Math.floor((sr / hz) * uni(r, 0.6, 1.4)));
        const d = 0.55 + 0.45 * dens[i];
        if (r() < 0.25 + 0.7 * d) exc[i] += d * uni(r, 0.4, 1);
      }
    }
    const cr = new Float32Array(n);
    resonate(exc, cr, sr, [
      { f: 270, tau: 0.008, a: 0.5 / sr },
      { f: 540, tau: 0.005, a: 0.35 / sr },
      { f: 1150, tau: 0.0025, a: 0.2 / sr },
    ]);
    for (let i = 0; i < n; i++) out[i] += cr[i];
    return out;
  };
}

function finishLoop(ctx: BaseAudioContext, x: Float32Array, peakDb: number): AudioBuffer {
  // DC-block the whole loop, then remove any residual offset so the seam stays flat
  let mean = 0;
  for (let i = 0; i < x.length; i++) mean += x[i];
  mean /= x.length;
  const g = Math.pow(10, peakDb / 20) / (peakOf(x.map((v) => v - mean)) || 1);
  const b = ctx.createBuffer(1, x.length, ctx.sampleRate);
  const ch = b.getChannelData(0);
  for (let i = 0; i < x.length; i++) ch[i] = (x[i] - mean) * g;
  return b;
}

const SQ_TARGET = 0.16;

export function buildSquishySounds(ctx: BaseAudioContext): SquishySounds {
  const sr = ctx.sampleRate;
  const r = mulberry32(0x5eed1e55);
  const n = (k: number, f: () => Float32Array, g: number) =>
    Array.from({ length: k }, () => finish(ctx, f(), SQ_TARGET * g * jit(r, 1, 0.06)));
  // Friction/stretch are generated with lowpass state that starts at 0; highpass inside
  // the generators keeps them zero-mean so the crossfade seam is level.
  return {
    press: n(8, () => renderPress(sr, false, r), 0.75),
    pressHard: n(6, () => renderPress(sr, true, r), 1.0),
    release: n(8, () => renderRelease(sr, r), 1.0),
    friction: finishLoop(ctx, seamless(sr, 1.6, genFriction(sr, r)), -6),
    stretch: finishLoop(ctx, seamless(sr, 1.8, genStretch(sr, r)), -6),
  };
}
