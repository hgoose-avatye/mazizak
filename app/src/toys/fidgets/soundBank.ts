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
  source: "wax" | "crunch" | "squish";
  /** sprite pool name in public/sfx/fidgets/<source>.json, e.g. "apple.crack" */
  pool: string;
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

const sqz = (pool: string, kind: PoolKind, note: string, o: Partial<PoolRef> = {}): PoolRef => ({ source: "squish", pool, kind, rate: jitter(0.03), note, ...o });
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

export const FIDGET_SOUND: Record<string, ToySound> = {
  // Each toy has its own recordings (Freesound CC0, see public/sfx/fidgets/CREDITS.md); nothing is shared between S01/S02/S03 or with the crunch/wax toys.
  S01: { init: NONE, tap: sqz("tpr.tap", "recording", "stress-ball / squeeze-toy squeezes"), hold: sqz("tpr.hold", "recording", "sustained stress-ball squeezing"), release: NONE, stretch: NONE, fold: NONE, crack: NONE, crunch: NONE },
  S02: { init: NONE, tap: NONE, hold: sqz("foam.hold", "recording", "memory-foam / sponge slow presses", { rate: jitter(0.025) }), release: NONE, stretch: NONE, fold: NONE, crack: NONE, crunch: NONE },
  S03: { init: NONE, tap: sqz("mochi.tap", "proxy", "short soft-dough presses (dough stands in for mochi)"), hold: sqz("mochi.hold", "proxy", "dough kneading / rolling (stands in for mochi)"), release: NONE, stretch: NONE, fold: NONE, crack: NONE, crunch: NONE },
  L01: { init: NONE, tap: NONE, hold: sqz("slime.hold", "recording", "slime squishing"), release: NONE, stretch: sqz("slime.stretch", "recording", "slime stretching passages"), fold: sqz("slime.fold", "recording", "slime slaps / folds"), crack: NONE, crunch: NONE },
  L02: { init: NONE, tap: NONE, hold: sqz("gel.hold", "proxy", "wet jelly / goo squishing (stands in for clear mango slime)"), release: NONE, stretch: sqz("slime.stretch", "recording", "slime stretching passages", { trimDb: -1 }), fold: sqz("slime.fold", "recording", "slime slaps / folds"), crack: NONE, crunch: NONE },
  L03: { init: NONE, tap: NONE, hold: sqz("cream.hold", "proxy", "shaving-foam squashing (stands in for whipped cream)"), release: NONE, stretch: NONE, fold: sqz("cream.fold", "proxy", "shaving-foam folding (stands in for whipped cream)"), crack: NONE, crunch: NONE },
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
  { what: "the shared CC0 gel sprite (squishy.wav) for every fidget", why: "S01–S03 and L01–L03 sounded alike and the clips were boosted up to +21 dB from 128 kbps sources; replaced by per-toy recordings in squish.wav" },
  { what: "rubber-glove stretch loop as slime stretch", why: "latex, not slime; replaced by slime stretching recordings" },
  { what: "styrofoam-only C01, plastic/sugar-only C02", why: "replaced by dry floral foam + styrofoam (C01) and glass beads, sprinkles, pop rocks, rock candy (C02)" },
  { what: "pools failing the waveform gates (foam.tap, gel.fold, choco... as listed in the sprite JSON `dropped`)", why: "fewer than the minimum number of independent clips passed" },
  { what: "candidate clips failing the waveform gates", why: "amplification > 18 dB, clipped source passage, mostly silence, abrupt window end, spectral or length outlier within the pool (see `audit` in the sprite JSON)" },
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
