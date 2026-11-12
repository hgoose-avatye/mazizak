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
  S01: {
    init: NONE,
    tap: sq("compressGel", "recording", "shortest CC0 gel squelch as a short elastic press", { slice: [0, 1], rate: jitter(0.06) }),
    hold: sq("compressGel", "recording", WET, { slice: [1, 4] }),
    release: NONE, stretch: NONE, fold: NONE, crack: NONE, crunch: NONE,
  },
  S02: {
    // unchanged policy from the earlier foam work: the PU-foam contact clip, no synthetic "recover" (no real slow-rise recording exists)
    init: NONE,
    tap: sq("touch", "recording", "CC0 soft pillow-hit contact", { slice: [3, 4], rate: jitter(0.06) }),
    hold: sq("touch", "recording", "CC0 PU acoustic-foam contact (#680000)", { slice: [4, 5], rate: jitter(0.05) }),
    release: NONE, stretch: NONE, fold: NONE, crack: NONE, crunch: NONE,
  },
  S03: {
    init: NONE,
    tap: sq("compressGel", "recording", "shortest CC0 gel squelch, slowed slightly for a softer, localised press", { slice: [0, 1], rate: [0.9, 0.96] }),
    hold: sq("compressGel", "recording", WET, { slice: [2, 5], rate: [0.92, 0.97] }),
    release: NONE, stretch: NONE, fold: NONE, crack: NONE, crunch: NONE,
  },
  L01: {
    init: NONE,
    tap: NONE, // sticky contact: the first press already plays the sustained sound
    hold: sq("compressGel", "recording", WET, { slice: [0, 3], rate: [0.94, 0.99] }),
    release: NONE,
    stretch: sq("stretchWindows", "proxy", "CC0 rubber-glove stretching in fixed windows (not slime)"),
    fold: sq("compressGel", "recording", WET, { slice: [3, 5], rate: [0.86, 0.9] }),
    crack: NONE, crunch: NONE,
  },
  L02: {
    init: NONE,
    tap: NONE,
    hold: sq("compressGel", "recording", WET, { slice: [0, 4] }),
    release: NONE,
    stretch: sq("stretchWindows", "proxy", "CC0 rubber-glove stretching in fixed windows (not slime)", { trimDb: -3 }),
    fold: sq("compressGel", "recording", WET, { slice: [3, 5], rate: [0.9, 0.95] }),
    crack: NONE, crunch: NONE,
  },
  L03: {
    init: NONE,
    tap: NONE,
    hold: sq("compressGel", "recording", WET, { slice: [1, 4], rate: [0.9, 0.95] }),
    release: NONE,
    stretch: NONE, // no stretch recording for cream: falls back to hold
    fold: sq("compressGel", "recording", WET, { slice: [3, 5], rate: [0.88, 0.93] }),
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

/** used when a toy has no pool for an event but a neighbouring one makes sense (`null` = stay silent) */
export const FALLBACK: Record<FidgetEvent, FidgetEvent | null> = { init: null, tap: "hold", hold: null, release: null, stretch: "hold", fold: "hold", crack: null, crunch: null };

/** relative loudness of the event classes (dB, peak-ish). Clips are NOT forced to one level: impacts stay louder than touches. */
export const CLASS_LEVEL_DB: Record<FidgetEvent, number> = { init: 0, crack: 0, crunch: -2, tap: -4, hold: -4, stretch: -4, fold: -4, release: -8 };
/** absolute trim for the peak-normalised (−1 dBFS) wax/crunch sprite clips, per event class */
export const SPRITE_TRIM_DB: Record<FidgetEvent, number> = { init: -8, crack: -9, crunch: -11, tap: -13, hold: -14, stretch: -14, fold: -14, release: -18 };

/** sustained events replace each other instead of stacking */
export const SUSTAINED: ReadonlySet<FidgetEvent> = new Set<FidgetEvent>(["hold", "stretch", "fold"]);
export const MIN_INTERVAL_MS: Record<FidgetEvent, number> = { init: 0, tap: 60, hold: 110, release: 80, stretch: 110, fold: 160, crack: 55, crunch: 60 };
export const MAX_SHORT_VOICES = 3;
export const OVERLAP_DB = -1.5;

/** strength 0..1 → dB: soft touches are quieter, but never silent */
export const strengthDb = (strength: number) => -6 + 6 * Math.min(1, Math.max(0, strength));

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
