/**
 * Fidget ASMR event model: which recorded pool answers which gesture event, how clips are picked without
 * obvious repetition, and how overlapping voices are controlled. Pure logic (no Web Audio), unit-tested.
 *
 *   init     first contact / first crack after a reset
 *   tap      short press at contact
 *   hold     sustained compression / kneading
 *   release  finger lifted after a real press
 *   stretch  two-finger stretch
 *   fold     fold gesture
 *   crack    shell crack / break (a "burst" pool is used for dense, continuous breaking)
 *   crunch   inner particles being crushed
 *
 * `null` in FIDGET_SOUND means "this toy deliberately has no such sound"; a missing key is a bug (tests enforce it).
 */
export const EVENTS = ["init", "tap", "hold", "release", "stretch", "fold", "crack", "crunch"] as const;
export type FidgetEvent = (typeof EVENTS)[number];

/** recording = clips cut from a real recording of (roughly) this material; derived = processed from other material; proxy = a different material used as a stand-in */
export type PoolKind = "recording" | "derived" | "proxy";

export interface PoolRef {
  source: "squishy" | "wax" | "crunch";
  /** squishy: touch | compress | compressGel | recover | stretchWindows ; wax/crunch: sprite pool name, e.g. "apple.crack" */
  pool: string;
  /** use only clips [from, to) of the pool, so two events never play the very same clips */
  slice?: [number, number];
  /** a second pool that replaces `pool` when the event strength reaches `minStrength` (dense, continuous breaking) */
  alt?: { pool: string; minStrength: number };
  kind: PoolKind;
  /** playback-rate jitter range (speed and pitch together); kept small */
  rate: [number, number];
  /** extra trim in dB on top of the event class level */
  trimDb?: number;
  note: string;
}
export type ToySound = Record<FidgetEvent, PoolRef | null>;

const NONE = null;
const jitter = (d: number): [number, number] => [1 - d, 1 + d];

const sq = (pool: string, kind: PoolKind, note: string, o: Partial<PoolRef> = {}): PoolRef => ({ source: "squishy", pool, kind, rate: jitter(0.03), note, ...o });
const wax = (pool: string, note: string, o: Partial<PoolRef> = {}): PoolRef => ({ source: "wax", pool, kind: "recording", rate: jitter(0.03), note, ...o });
const crunch = (pool: string, note: string, o: Partial<PoolRef> = {}): PoolRef => ({ source: "crunch", pool, kind: "proxy", rate: jitter(0.04), note, ...o });

const waxToy = (k: "apple" | "choco"): ToySound => ({
  init: wax(`${k}.init`, "strongest isolated first-break hits"),
  tap: NONE,
  hold: wax(`${k}.knead`, "knead recordings (crackle runs)", { rate: jitter(0.025) }),
  release: NONE,
  stretch: NONE,
  fold: NONE,
  crack: wax(`${k}.crack`, "single crack hits", { alt: { pool: `${k}.burst`, minStrength: 0.7 } }),
  crunch: NONE,
});
const WET = "CC0 gel squelch recordings (not the exact toy)";

export const FIDGET_SOUND: Record<string, ToySound> = {
  // Quality pass: events that would loop one or two clips, or that rest on a mismatched material, were removed (see EXCLUDED).
  // Toys then keep the sustained gel sound they had before the event model.
  S01: { init: NONE, tap: NONE, hold: sq("compressGel", "recording", WET, { slice: [1, 4] }), release: NONE, stretch: NONE, fold: NONE, crack: NONE, crunch: NONE },
  S02: {
    // the only real PU-foam contact clip (#680000); single clip = legacy exception, kept because it is the previous behaviour
    init: NONE, tap: NONE,
    hold: sq("touch", "recording", "CC0 PU acoustic-foam contact (#680000)", { slice: [4, 5], rate: jitter(0.05) }),
    release: NONE, stretch: NONE, fold: NONE, crack: NONE, crunch: NONE,
  },
  S03: { init: NONE, tap: NONE, hold: sq("compressGel", "recording", WET, { slice: [2, 5], rate: [0.92, 0.97] }), release: NONE, stretch: NONE, fold: NONE, crack: NONE, crunch: NONE },
  L01: { init: NONE, tap: NONE, hold: sq("compressGel", "recording", WET, { slice: [0, 3], rate: [0.94, 0.99] }), release: NONE, stretch: NONE, fold: NONE, crack: NONE, crunch: NONE },
  L02: { init: NONE, tap: NONE, hold: sq("compressGel", "recording", WET, { slice: [0, 4] }), release: NONE, stretch: NONE, fold: NONE, crack: NONE, crunch: NONE },
  L03: {
    init: NONE, tap: NONE,
    hold: sq("compressGel", "recording", WET, { slice: [1, 4], rate: [0.9, 0.95] }),
    release: NONE, stretch: NONE,
    fold: sq("compressGel", "recording", WET, { slice: [2, 5], rate: [0.88, 0.93] }),
    crack: NONE, crunch: NONE,
  },
  W01: waxToy("apple"),
  W02: waxToy("choco"),
  C01: {
    init: NONE, tap: NONE,
    hold: crunch("soap.hold", "styrofoam crinkle windows as sustained soap-chip compression (similar material only)"),
    release: NONE, stretch: NONE, fold: NONE, crack: NONE,
    crunch: crunch("soap.crunch", "short styrofoam crushing hits as soap-chip crushing (similar material only)"),
  },
  C02: {
    init: NONE, tap: NONE,
    hold: crunch("beads.hold", "sugar-granule friction windows as sustained bead compression (similar material only)"),
    release: NONE, stretch: NONE, fold: NONE, crack: NONE,
    crunch: crunch("beads.crunch", "short plastic-bead collisions (similar material only)", { rate: jitter(0.05) }),
  },
};

/** What was taken out in the quality pass and why (objective facts; nobody has listened). */
export const EXCLUDED: { what: string; why: string }[] = [
  { what: "squishy stretch loop windows (rubber glove) for L01/L02 stretch", why: "the source needed +21 dB of gain from a 128 kbps recording, is latex rather than slime, and the three windows were fixed 0.8 s cuts" },
  { what: "pillow-hit touch clip as S02 tap", why: "a pillow thump on a foam ball (material mismatch), single clip" },
  { what: "single-gel-clip taps for S01/S03", why: "one clip repeated on every touch is an audible loop; the sustained gel sound plays at contact instead (previous behaviour)" },
  { what: "2-clip fold pools for L01/L02", why: "fewer than 3 independent clips; fold falls back to the sustained gel sound" },
  { what: "squishy cushion (couch-sitting) compress and derived reversed recover pools", why: "body-contact thump / reversed derived audio, not matching any toy; no fidget event uses them" },
  { what: "wax/crunch candidate clips failing the waveform gates", why: "amplification > 18 dB, clipped source passage, mostly silence, abrupt window end, spectral or length outlier within the pool (see scripts/fidgets/build-clips.mjs, `audit` in the sprite JSON)" },
  { what: "pool choco.init (W02 first-break hits)", why: "only 2 clips passed the gates and they sound unlike each other (spectral centroid ≈ 2.3 kHz vs 7.8 kHz); W02's first crack uses its crack pool" },
  { what: "sugar-granule windows in C02 hold", why: "the source is so quiet that every clip needed > 18 dB of gain" },
];

/** used when a toy has no pool for an event but a neighbouring one makes sense (`null` = stay silent) */
export const FALLBACK: Record<FidgetEvent, FidgetEvent | null> = { init: null, tap: "hold", hold: null, release: null, stretch: "hold", fold: "hold", crack: null, crunch: null };

/** relative loudness of the event classes in dB, anchored to the loudness the squishy/wax toys had before the event model. Clips are NOT forced to one level: impacts stay louder than touches. */
export const CLASS_LEVEL_DB: Record<FidgetEvent, number> = { init: 1, crack: 1, crunch: 0, tap: -1, hold: 0, stretch: 0, fold: 0, release: -4 };
/** absolute trim for the peak-normalised (−1 dBFS) wax/crunch sprite clips, per event class (calibrated so that average peaks match the old runtime-sliced wax at strength 1: ≈ −16 dBFS) */
export const SPRITE_TRIM_DB: Record<FidgetEvent, number> = { init: -10, crack: -11, crunch: -11, tap: -13, hold: -12, stretch: -12, fold: -12, release: -18 };

/** sustained events replace each other instead of stacking */
export const SUSTAINED: ReadonlySet<FidgetEvent> = new Set<FidgetEvent>(["hold", "stretch", "fold"]);
export const MIN_INTERVAL_MS: Record<FidgetEvent, number> = { init: 0, tap: 60, hold: 110, release: 80, stretch: 110, fold: 160, crack: 55, crunch: 60 };
export const MAX_SHORT_VOICES = 3;
export const OVERLAP_DB = -1.5;

/** strength 0..1 → dB (−5…0, as before the event model): soft touches are quieter, but never silent */
export const strengthDb = (strength: number) => -5 + 5 * Math.min(1, Math.max(0, strength));

/** avoid repeating a clip within the last min(2, n-1) picks; fully deterministic given `rng` */
export class ClipPicker {
  private recent = new Map<string, number[]>();
  constructor(private rng: () => number = Math.random) {}
  pick(key: string, n: number): number {
    if (n <= 1) return 0;
    const avoid = Math.min(2, n - 1);
    const hist = this.recent.get(key) ?? [];
    let i = Math.floor(this.rng() * n) % n;
    for (let guard = 0; hist.includes(i) && guard < n + 2; guard++) i = (i + 1) % n;
    hist.push(i);
    while (hist.length > avoid) hist.shift();
    this.recent.set(key, hist);
    return i;
  }
  reset() {
    this.recent.clear();
  }
}

export interface ActiveVoice {
  event: FidgetEvent;
  start: number;
  end: number;
  stop?: (fadeSec?: number) => void;
}
export interface GateDecision {
  ok: boolean;
  reason?: string;
  /** dB to subtract because other voices are still sounding */
  attenuationDb: number;
}
/** Per-toy voice policy: minimum intervals, at most MAX_SHORT_VOICES short voices, one sustained voice at a time. */
export class VoiceGate {
  voices: ActiveVoice[] = [];
  private lastAt: Partial<Record<FidgetEvent, number>> = {};
  decide(event: FidgetEvent, now: number): GateDecision {
    this.voices = this.voices.filter((v) => v.end > now);
    const last = this.lastAt[event];
    if (last !== undefined && now - last < MIN_INTERVAL_MS[event]) return { ok: false, reason: "interval", attenuationDb: 0 };
    if (SUSTAINED.has(event)) {
      // let the running sustained sound finish its body instead of re-triggering over it
      if (this.voices.some((v) => SUSTAINED.has(v.event) && v.end - now > 120)) return { ok: false, reason: "sustained-busy", attenuationDb: 0 };
    } else if (this.voices.filter((v) => !SUSTAINED.has(v.event)).length >= MAX_SHORT_VOICES) {
      return { ok: false, reason: "voice-cap", attenuationDb: 0 };
    }
    return { ok: true, attenuationDb: OVERLAP_DB * Math.min(3, this.voices.length) };
  }
  commit(event: FidgetEvent, now: number, durationMs: number, stop?: (fadeSec?: number) => void) {
    this.lastAt[event] = now;
    this.voices.push({ event, start: now, end: now + durationMs, stop });
  }
  /** fade out sustained voices (finger lifted, toy left) */
  releaseSustained(fadeSec = 0.04) {
    for (const v of this.voices) if (SUSTAINED.has(v.event)) v.stop?.(fadeSec);
    this.voices = this.voices.filter((v) => !SUSTAINED.has(v.event));
  }
  clear(fadeSec = 0.04) {
    for (const v of this.voices) v.stop?.(fadeSec);
    this.voices = [];
    this.lastAt = {};
  }
}

/** random value in [a,b] */
export const between = (rng: () => number, [a, b]: [number, number]) => a + (b - a) * rng();
