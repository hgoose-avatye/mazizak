import type { AudioEngine } from "../../core/audio";
import { loadSquishySamples } from "../../audio/squishySamples";
import {
  LOCAL_FIDGETS,
  referenceSounds,
  referenceManifest,
} from "./references";
import type { FidgetSpec } from "./catalog";
const waxCache = new WeakMap<
  BaseAudioContext,
  Promise<Record<string, AudioBuffer[]>>
>();
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
async function loadWax(ctx: BaseAudioContext) {
  let p = waxCache.get(ctx);
  if (p) return p;
  p = (async () =>
    Object.fromEntries(
      await Promise.all(
        ["apple_crack", "apple_knead", "choco_crack", "choco_knead"].map(
          async (role) => {
            const list: AudioBuffer[] = [];
            for (const i of [1, 2]) {
              const res = await fetch(`./sfx/wax/${role}_${i}.mp3`);
              if (!res.ok) throw Error(`${role}: HTTP ${res.status}`);
              const b = await ctx.decodeAudioData(await res.arrayBuffer()),
                x = b.getChannelData(0);
              let peak = 0;
              for (const v of x) peak = Math.max(peak, Math.abs(v));
              const on = x.findIndex((v) => Math.abs(v) > peak * 0.22),
                start = Math.max(0, on / b.sampleRate - 0.008);
              list.push(
                cut(ctx, b, start, role.includes("crack") ? 0.28 : 0.42),
              );
              if (b.duration > 1)
                list.push(
                  cut(
                    ctx,
                    b,
                    Math.min(b.duration - 0.5, start + 0.7),
                    role.includes("crack") ? 0.22 : 0.35,
                  ),
                );
            }
            return [role, list];
          },
        ),
      ),
    ))();
  waxCache.set(ctx, p);
  p.catch(() => waxCache.delete(ctx));
  return p;
}
export const preloadFidgetAudio = (audio: AudioEngine) =>
  Promise.all([loadSquishySamples(audio.ctx), loadWax(audio.ctx)]);
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
export class FidgetAudio {
  state = "loading";
  source = "";
  supportedRoles: string[] = [];
  private enabled = false;
  private busyUntil = 0;
  private stopVoice: (() => void) | null = null;
  private durations: Record<string, number> = {};
  private lastRequest: Record<string, number> = {};
  constructor(
    private audio: AudioEngine,
    readonly spec: FidgetSpec,
  ) {
    void this.prepare();
  }
  private async prepare() {
    try {
      const sq = await loadSquishySamples(this.audio.ctx),
        wet = sq.compressGel ?? sq.compress;
      const local = LOCAL_FIDGETS
        ? await referenceSounds(this.audio.ctx, this.spec.id)
        : {};
      const hasVideoReference =
        LOCAL_FIDGETS &&
        this.spec.id === "L01" &&
        !!(await referenceManifest()).toys.L01?.referenceVideo;
      const banks: Record<string, AudioBuffer[]> = {};
      if (this.spec.shape === "foam") {
        banks.compress = [sq.touch[sq.touch.length - 1]];
        this.source =
          "CC0 PU foam contact; exact slow-rise compression recording missing";
      } else if (this.spec.shape === "cream") {
        banks.compress = wet;
        banks.fold = wet;
        this.source =
          "CC0 gel contact approximation; cream-specific recording missing";
      } else if (this.spec.family === "wax") {
        const wax = await loadWax(this.audio.ctx),
          choco = this.spec.shape === "chocolate";
        banks.crack = local.crack ?? wax[choco ? "choco_crack" : "apple_crack"];
        banks.knead = local.knead ?? wax[choco ? "choco_knead" : "apple_knead"];
        this.source = LOCAL_FIDGETS
          ? "installed-app wax/gel reference, local only"
          : "CC BY apple77771 wax/gel";
      } else if (this.spec.family === "particles") {
        const wax = await loadWax(this.audio.ctx);
        banks.crunch =
          local.crunch ??
          wax[this.spec.shape === "soap" ? "choco_crack" : "apple_crack"];
        this.source = LOCAL_FIDGETS
          ? "installed-app crunch reference, local only"
          : "CC BY derived crunch reference";
      } else {
        banks.compress = local.compress ?? local.press ?? wet;
        if (this.spec.family === "viscous") {
          banks.stretch = local.stretch ?? banks.compress;
          banks.fold = local.fold ?? banks.compress;
        }
        this.source = hasVideoReference
          ? "user video 7WDcH26JU5Q 20–29s; local-only soundtrack cues, acoustic purity unverified"
          : LOCAL_FIDGETS
            ? "installed-app skin/gel reference, local only"
            : "CC0 gel contact approximation";
      }
      for (const [role, raw] of Object.entries(banks)) {
        const targetDb =
          this.spec.shape === "foam"
            ? -34
            : this.spec.shape === "mochi"
              ? -30
              : this.spec.shape === "cream"
                ? -29
                : role === "crack"
                  ? -26
                  : -27;
        const unique = new Map<string, AudioBuffer>();
        for (const b of raw)
          for (const cue of gestureCues(this.audio.ctx, b)) {
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
            const out = this.audio.ctx.createBuffer(
                1,
                x.length,
                cue.sampleRate,
              ),
              y = out.getChannelData(0);
            for (let i = 0; i < x.length; i++) y[i] = x[i] * gain;
            unique.set(x.length + ":" + signature, out);
          }
        const cues = [...unique.values()];
        if (!cues.length) continue;
        this.audio.register(`fg:${this.spec.id}:${role}`, cues);
        this.durations[role] = Math.max(...cues.map((b) => b.duration));
        this.supportedRoles.push(role);
      }
      this.state = "recorded/derived";
    } catch (e) {
      this.state = "failed";
      console.warn(`Fidget audio ${this.spec.id}`, e);
    }
  }
  enter() {
    this.enabled = true;
  }
  play(role: string, strength = 0.5) {
    const now = performance.now();
    if (
      !this.enabled ||
      this.state !== "recorded/derived" ||
      !this.supportedRoles.includes(role) ||
      now < this.busyUntil ||
      now - (this.lastRequest[role] ?? -1000) < 100
    )
      return false;
    this.lastRequest[role] = now;
    const log = this.audio.play(
      `fg:${this.spec.id}:${role}`,
      {
        rate: 1,
        detuneCents: 0,
        gainJitterDb: 0.3,
        gainDb: -5 + Math.min(5, Math.max(0, strength) * 5),
      },
      `fidget:${role}`,
    );
    if (log?.stop) {
      this.stopVoice = () => log.stop?.(0.04);
      this.busyUntil = now + this.durations[role] * 1000 + 25;
    }
    return !!log;
  }
  releaseGesture() {
    if (this.stopVoice) {
      this.stopVoice();
      this.stopVoice = null;
      this.busyUntil = performance.now() + 100;
    }
  }
  stop() {
    this.releaseGesture();
  }
  leave() {
    this.enabled = false;
    this.stop();
  }
}
