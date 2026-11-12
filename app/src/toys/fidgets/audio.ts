import type { AudioEngine } from "../../core/audio";
import { loadSquishySamples, type SquishySoundsV2 } from "../../audio/squishySamples";
import {
  LOCAL_FIDGETS,
  referenceSounds,
  referenceManifest,
} from "./references";
import type { FidgetSpec } from "./catalog";
import { loadSprite, type LoadedSprite } from "./fidgetSprites";
/** dev only: installed-app reference sounds override the licensed pools. Off in production builds, and off when MANZIZAK_LOCAL_FIDGET_AUDIO=0 (meshes stay local, sounds are the shippable ones). */
const LOCAL_AUDIO = LOCAL_FIDGETS && import.meta.env.VITE_LOCAL_FIDGET_AUDIO !== "0";
import {
  CLASS_LEVEL_DB,
  ClipPicker,
  EVENTS,
  FALLBACK,
  FIDGET_SOUND,
  SPRITE_TRIM_DB,
  VoiceGate,
  between,
  strengthDb,
  type FidgetEvent,
  type PoolRef,
} from "./soundBank";

function cut(
  ctx: BaseAudioContext,
  b: AudioBuffer,
  start: number,
  duration: number,
) {
  const a = Math.max(0, Math.round(start * b.sampleRate)),
    n = Math.max(
      1,
      Math.min(b.length - a, Math.round(duration * b.sampleRate)),
    );
  const out = ctx.createBuffer(1, n, b.sampleRate),
    x = out.getChannelData(0),
    src = b.getChannelData(0);
  for (let i = 0; i < n; i++)
    x[i] =
      src[a + i] *
      Math.max(0, Math.min(1, i / 48, (n - i - 1) / (b.sampleRate * 0.015)));
  return out;
}
export const preloadFidgetAudio = (audio: AudioEngine) =>
  Promise.all([
    loadSquishySamples(audio.ctx),
    loadSprite(audio.ctx, "wax"),
    loadSprite(audio.ctx, "crunch"),
  ]);
/** Segment at quiet envelope gaps, rather than looping a short impact recording. */
function gestureCues(ctx: BaseAudioContext, buffer: AudioBuffer) {
  const x = buffer.getChannelData(0),
    hop = Math.max(1, Math.round(buffer.sampleRate * 0.005)),
    rms: number[] = [];
  for (let i = 0; i < x.length; i += hop) {
    let e = 0;
    for (let j = i; j < Math.min(x.length, i + hop); j++) e += x[j] * x[j];
    rms.push(Math.sqrt(e / Math.min(hop, x.length - i)));
  }
  const threshold = Math.max(0.0015, Math.max(...rms) * 0.1),
    regions: [number, number][] = [];
  let begin = -1,
    last = -1;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i] > threshold) {
      if (begin < 0) begin = i;
      last = i;
    }
    if (begin >= 0 && (i - last >= 7 || i === rms.length - 1)) {
      regions.push([
        Math.max(0, (begin * hop) / buffer.sampleRate - 0.005),
        Math.min(
          buffer.duration,
          ((last + 1) * hop) / buffer.sampleRate + 0.03,
        ),
      ]);
      begin = -1;
    }
  }
  if (!regions.length) return [buffer];
  return regions
    .filter(([a, b]) => b - a >= 0.025)
    .slice(0, 20)
    .map(([a, b]) => cut(ctx, buffer, a, b - a));
}
const SHAPE_TARGET_DB: Record<string, number> = { foam: -34, mochi: -30, cream: -29 };
/** squishy clips keep their previous RMS normalisation (shape target, never boosted, peak ≤ 0.7) */
function normaliseRaw(ctx: BaseAudioContext, raw: AudioBuffer[], targetDb: number) {
  const unique = new Map<string, AudioBuffer>();
  for (const b of raw)
    for (const cue of gestureCues(ctx, b)) {
      const x = cue.getChannelData(0);
      let peak = 0,
        energy = 0,
        signature = 2166136261;
      for (let i = 0; i < x.length; i++) {
        peak = Math.max(peak, Math.abs(x[i]));
        energy += x[i] * x[i];
        signature = Math.imul(
          signature ^ (Math.round(x[i] * 32767) & 65535),
          16777619,
        );
      }
      const rms = Math.sqrt(energy / x.length),
        gain = Math.min(
          1,
          Math.pow(10, targetDb / 20) / Math.max(rms, 0.00001),
          0.7 / Math.max(peak, 0.00001),
        );
      const out = ctx.createBuffer(1, x.length, cue.sampleRate),
        y = out.getChannelData(0);
      for (let i = 0; i < x.length; i++) y[i] = x[i] * gain;
      unique.set(x.length + ":" + signature, out);
    }
  return [...unique.values()];
}

export interface ResolvedClip {
  buffer: AudioBuffer;
  /** where the clip comes from, e.g. "wax:apple_crack_1 @1.24s" or "squishy/compressGel[1,4) cue 0" */
  label: string;
  /** sprite clips only: source id and start time (seconds) inside the source file — the key used by scripts/fidgets/exclusions.json */
  src?: string;
  srcStart?: number;
  /** short objective facts for the listening lab */
  info?: string;
}
export interface ResolvedEvent {
  ref: PoolRef | null;
  main: ResolvedClip[];
  alt?: ResolvedClip[];
  altMin?: number;
  baseDb: number;
  rate: [number, number];
  origin: string;
}
export interface ResolvedToy {
  events: Partial<Record<FidgetEvent, ResolvedEvent>>;
  source: string;
}
/** Resolve every event of a toy to its decoded clips (single source of truth for the player and the listening lab). */
export async function resolveToy(ctx: BaseAudioContext, spec: FidgetSpec): Promise<ResolvedToy> {
  const map = FIDGET_SOUND[spec.id];
  if (!map) throw Error(`no sound map for ${spec.id}`);
  const needs = (s: PoolRef["source"]) => EVENTS.some((e) => map[e]?.source === s);
  const sq: SquishySoundsV2 | null = needs("squishy") ? await loadSquishySamples(ctx) : null;
  const sprites: Partial<Record<"wax" | "crunch", LoadedSprite>> = {};
  if (needs("wax")) sprites.wax = await loadSprite(ctx, "wax");
  if (needs("crunch")) sprites.crunch = await loadSprite(ctx, "crunch");
  const local = LOCAL_AUDIO ? await referenceSounds(ctx, spec.id) : {};
  const hasVideoReference = LOCAL_AUDIO && spec.id === "L01" && !!(await referenceManifest()).toys.L01?.referenceVideo;
  // dev-only local reference override (old role names → events); never present in production builds
  // (same coverage as before the event model: foam and cream never used the local sounds)
  const sh = spec.shape;
  const localFor: Partial<Record<FidgetEvent, AudioBuffer[]>> =
    sh === "foam" || sh === "cream"
      ? {}
      : spec.family === "wax"
        ? { crack: local.crack, hold: local.knead }
        : spec.family === "particles"
          ? { crunch: local.crunch }
          : { hold: local.compress ?? local.press, ...(spec.family === "viscous" ? { stretch: local.stretch, fold: local.fold } : {}) };
  const shapeDb = SHAPE_TARGET_DB[spec.shape] ?? -27;
  const events: ResolvedToy["events"] = {};
  for (const event of EVENTS) {
    const ref = map[event];
    const poolsOf = (r: PoolRef, name: string): ResolvedClip[] => {
      if (r.source === "squishy") {
        const raw = name === "touch" ? sq!.touch : name === "compress" ? sq!.compress : name === "compressGel" ? (sq!.compressGel ?? sq!.compress) : sq!.recover;
        const sel = r.slice ? raw.slice(r.slice[0], r.slice[1]) : raw;
        const target = shapeDb + (event === "tap" ? -2 : event === "release" ? -6 : 0);
        return normaliseRaw(ctx, sel, target).map((buffer, i) => ({ buffer, label: `squishy/${name}${r.slice ? `[${r.slice[0]},${r.slice[1]})` : ""} cue ${i}` }));
      }
      const sprite = sprites[r.source]!;
      const p = sprite.pools[name];
      if (!p) return []; // pool dropped by the clip audit: the event simply has no sound
      const entries = sprite.json.pools[name].entries;
      return p.map((buffer, i) => ({ buffer, label: `${entries[i].src} @${entries[i].srcStart.toFixed(2)}s`, src: entries[i].src, srcStart: entries[i].srcStart, info: `${(entries[i].duration * 1000).toFixed(0)} ms · ${(entries[i] as unknown as { centroidHz: number }).centroidHz} Hz · boost +${(entries[i] as unknown as { boostDb: number }).boostDb} dB` }));
    };
    const override = LOCAL_AUDIO ? localFor[event] : undefined;
    if (!ref && !override?.length) continue;
    let origin = ref ? `${ref.source}/${ref.pool}[${ref.kind}]` : "";
    let main: ResolvedClip[];
    let rate: [number, number] = ref?.rate ?? [0.98, 1.02];
    if (override?.length) {
      main = normaliseRaw(ctx, override, shapeDb).map((buffer, i) => ({ buffer, label: `local-reference cue ${i}` }));
      origin = "local-reference";
      rate = [0.98, 1.02];
    } else main = poolsOf(ref!, ref!.pool);
    let promoted = false;
    if (!main.length && ref?.alt && !override?.length) {
      // the single-hit pool was dropped by the clip audit: the dense pool answers every event of this kind
      main = poolsOf(ref, ref.alt.pool);
      promoted = true;
    }
    if (!main.length) continue;
    const e: ResolvedEvent = {
      ref: override?.length ? null : ref,
      main,
      baseDb: (ref && ref.source !== "squishy" && !override?.length ? SPRITE_TRIM_DB[event] : CLASS_LEVEL_DB[event]) + (ref?.trimDb ?? 0),
      rate,
      origin,
    };
    if (ref?.alt && !override?.length && !promoted) {
      const alt = poolsOf(ref, ref.alt.pool);
      if (alt.length) {
        e.alt = alt;
        e.altMin = ref.alt.minStrength;
      }
    }
    events[event] = e;
  }
  const kinds = new Set(EVENTS.map((e) => events[e]?.origin).filter(Boolean) as string[]);
  const source = LOCAL_AUDIO
    ? hasVideoReference
      ? "local reference (incl. user video 7WDcH26JU5Q 20–29s soundtrack cues, rights unverified); local only"
      : `local reference overrides + licensed pools: ${[...kinds].join(", ")}`
    : `licensed pools: ${[...kinds].join(", ")}`;
  return { events, source };
}

interface PlayableSet {
  ref: PoolRef | null;
  /** registered engine names of the main pool and (optionally) the alt pool */
  main: string[];
  alt?: string[];
  durations: Record<string, number>;
  baseDb: number;
  rate: [number, number];
  altMin?: number;
  origin: string;
}
export class FidgetAudio {
  state = "loading";
  source = "";
  /** events that have a sound for this toy (after fallbacks are applied by play()) */
  supportedRoles: string[] = [];
  private enabled = false;
  private sets: Partial<Record<FidgetEvent, PlayableSet>> = {};
  private gate = new VoiceGate();
  private picker = new ClipPicker(() => this.rng());
  private firstCrackDone = false;
  private seed = 1;
  /** small deterministic LCG: same event sequence → same clip/rate sequence (testable) */
  private rng = () => {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  };
  constructor(
    private audio: AudioEngine,
    readonly spec: FidgetSpec,
    private now: () => number = () => performance.now(),
  ) {
    void this.prepare();
  }
  private register(event: FidgetEvent, tag: string, bufs: AudioBuffer[]) {
    const names = bufs.map((b, i) => {
      const name = `fg:${this.spec.id}:${event}:${tag}:${i}`;
      this.audio.register(name, [b]);
      return [name, b.duration] as const;
    });
    return names;
  }
  private async prepare() {
    try {
      const r = await resolveToy(this.audio.ctx, this.spec);
      this.source = r.source;
      for (const event of EVENTS) {
        const e = r.events[event];
        if (!e) continue;
        const set: PlayableSet = { ref: e.ref, main: [], durations: {}, baseDb: e.baseDb, rate: e.rate, origin: e.origin };
        for (const [name, d] of this.register(event, "m", e.main.map((c) => c.buffer))) {
          set.main.push(name);
          set.durations[name] = d;
        }
        if (e.alt) {
          set.alt = [];
          set.altMin = e.altMin;
          for (const [name, d] of this.register(event, "a", e.alt.map((c) => c.buffer))) {
            set.alt.push(name);
            set.durations[name] = d;
          }
        }
        this.sets[event] = set;
        this.supportedRoles.push(event);
      }
      this.state = "recorded/derived";
    } catch (e) {
      this.state = "failed";
      console.warn(`Fidget audio ${this.spec.id}`, e);
    }
  }
  /** is there a sound (own pool or fallback) for this event? */
  has(event: FidgetEvent) {
    const fb = FALLBACK[event];
    return !!this.sets[event] || (!!fb && !!this.sets[fb]);
  }
  /** events with their own pool (no fallback) */
  hasOwn(event: FidgetEvent) {
    return !!this.sets[event];
  }
  enter() {
    this.enabled = true;
  }
  /** restore per-object state (first crack) — call on toy reset */
  reset() {
    this.firstCrackDone = false;
    this.picker.reset();
    this.gate.clear();
  }
  /** `delaySec` only places the sound later in an offline render (tests); the app always plays immediately */
  play(event: FidgetEvent, strength = 0.5, delaySec = 0) {
    if (!this.enabled || this.state !== "recorded/derived") return false;
    let ev: FidgetEvent = event;
    // the first crack after a reset is the "init" sound when the toy has one
    if (ev === "crack" && !this.firstCrackDone && this.sets.init) ev = "init";
    if (!this.sets[ev]) {
      const fb = FALLBACK[ev];
      if (!fb || !this.sets[fb]) return false;
      ev = fb;
    }
    const set = this.sets[ev]!,
      now = this.now(),
      d = this.gate.decide(ev, now);
    if (!d.ok) return false;
    const useAlt = !!set.alt && strength >= (set.altMin ?? 1);
    const names = useAlt ? set.alt! : set.main;
    const name = names[this.picker.pick(`${ev}:${useAlt ? "a" : "m"}`, names.length)];
    const rate = between(this.rng, set.rate);
    const log = this.audio.play(
      name,
      {
        rate,
        detuneCents: 0,
        gainJitterDb: 0.4,
        gainDb: set.baseDb + strengthDb(strength) + d.attenuationDb,
        ...(delaySec > 0 ? { delaySec } : {}),
      },
      `fidget:${ev}`,
    );
    if (!log) return false;
    this.gate.commit(ev, now, (set.durations[name] / rate) * 1000 + 25, log.stop);
    if (ev === "init" || event === "crack") this.firstCrackDone = true;
    return true;
  }
  releaseGesture() {
    this.gate.releaseSustained(0.04);
  }
  stop() {
    this.gate.clear(0.04);
  }
  leave() {
    this.enabled = false;
    this.stop();
  }
}
