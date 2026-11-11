import type { AudioEngine, ContinuousSound } from "../../core/audio";
import { loadSquishySamples } from "../../audio/squishySamples";
import { LOCAL_FIDGETS, referenceSounds } from "./references";
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
export class FidgetAudio {
  state = "loading";
  source = "CC0 / CC BY recorded foley";
  private rub: ContinuousSound | null = null;
  private stretch: ContinuousSound | null = null;
  private enabled = false;
  private last: Record<string, number> = {};
  private stops: (() => void)[] = [];
  constructor(
    private audio: AudioEngine,
    readonly spec: FidgetSpec,
  ) {
    void this.prepare();
  }
  private async prepare() {
    try {
      const sq = await loadSquishySamples(this.audio.ctx),
        wet = sq.compressGel ?? sq.compress,
        foam = this.spec.sound === "foam",
        cream = this.spec.sound === "cream";
      const register = (r: string, b: AudioBuffer[]) =>
        this.audio.register(`fg:${this.spec.id}:${r}`, b);
      register(
        "press",
        this.spec.family === "wax"
          ? sq.touch
          : foam
            ? sq.compress
            : cream
              ? sq.touch
              : wet,
      );
      register("compress", foam || cream ? sq.compress : wet);
      register("release", foam ? sq.recover : sq.touch);
      register(
        "fold",
        this.spec.sound === "cheese"
          ? [...sq.compress, ...wet]
          : cream
            ? sq.touch
            : wet,
      );
      register(
        "bubble",
        wet.map((b) =>
          cut(this.audio.ctx, b, 0.02, Math.min(0.07, b.duration - 0.02)),
        ),
      );
      this.rub = this.audio.createLoop(sq.rub);
      this.stretch = this.audio.createLoop(sq.stretch);
      if (this.spec.family === "wax" || this.spec.family === "particles") {
        const w = await loadWax(this.audio.ctx),
          choco = this.spec.sound === "chocolate";
        register("crack", w[choco ? "choco_crack" : "apple_crack"]);
        register("knead", w[choco ? "choco_knead" : "apple_knead"]);
        register(
          "crunch",
          w[this.spec.sound === "soap" ? "choco_crack" : "apple_crack"].map(
            (b) =>
              cut(
                this.audio.ctx,
                b,
                0,
                this.spec.sound === "soap" ? 0.11 : 0.035,
              ),
          ),
        );
      }
      if (LOCAL_FIDGETS) {
        const local = await referenceSounds(this.audio.ctx, this.spec.id);
        for (const [role, buffers] of Object.entries(local)) {
          register(
            role,
            role === "crunch"
              ? buffers.map((b) =>
                  cut(this.audio.ctx, b, 0, Math.min(0.36, b.duration)),
                )
              : buffers,
          );
        }
        const wetLocal = local.knead ?? local.compress ?? local.press;
        register(
          "bubble",
          wetLocal.map((b) =>
            cut(this.audio.ctx, b, 0, Math.min(0.09, b.duration)),
          ),
        );
        this.rub = this.audio.createLoop(wetLocal[0]);
        this.stretch = this.audio.createLoop((local.stretch ?? wetLocal)[0]);
        this.source = "installed app / local development only";
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
  play(role: string, strength = 1) {
    if (!this.enabled || this.state !== "recorded/derived") return;
    const now = performance.now();
    if (
      now - (this.last[role] ?? -1000) <
      (role === "crunch"
        ? 75
        : role === "crack"
          ? 110
          : role === "bubble"
            ? 140
            : 70)
    )
      return;
    this.last[role] = now;
    const t = this.spec.sound,
      rate =
        role === "crunch"
          ? t === "soap"
            ? 1.45
            : 2.4
          : role === "bubble"
            ? 1.6
            : t === "foam"
              ? 0.78
              : t === "mochi"
                ? 0.82
                : t === "cream"
                  ? 1.22
                  : t === "cheese"
                    ? 0.8
                    : t === "mango"
                      ? 0.95
                      : 1.1;
    const log = this.audio.play(
      `fg:${this.spec.id}:${role}`,
      {
        rate: LOCAL_FIDGETS ? (role === "bubble" ? 1.12 : 1) : rate,
        lowpassHz: LOCAL_FIDGETS
          ? t === "foam"
            ? 6000
            : 14000
          : t === "foam"
            ? 1800
            : t === "cream"
              ? 2200
              : t === "mochi"
                ? 2600
                : role === "crunch"
                  ? 6500
                  : 7000,
        gainDb:
          (role === "release" ? -9 : role === "crunch" ? -6 : -2) +
          Math.min(3, strength * 3),
        gainJitterDb: 1.3,
        detuneCents: 18,
      },
      `fidget:${role}`,
    );
    if (log?.stop) {
      this.stops.push(() => log.stop?.(0.04));
      if (this.stops.length > 24) this.stops.shift();
    }
  }
  continuous(stretch: number, rub: number) {
    if (this.enabled) {
      this.stretch?.set(
        Math.min(LOCAL_FIDGETS ? 0.22 : 0.5, stretch),
        this.spec.sound === "cream" ? 0.05 : 0.4,
      );
      this.rub?.set(
        Math.min(LOCAL_FIDGETS ? 0.17 : 0.3, rub),
        this.spec.sound === "beads" ? 0.75 : 0.2,
      );
    }
  }
  stop() {
    this.rub?.set(0, 0);
    this.stretch?.set(0, 0);
    for (const stop of this.stops) stop();
    this.stops = [];
  }
  leave() {
    this.enabled = false;
    this.stop();
  }
}
