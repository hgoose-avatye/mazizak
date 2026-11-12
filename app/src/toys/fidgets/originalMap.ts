/**
 * DEV ONLY — stand-in sounds taken from the owner's installed reference app, chosen by the owner:
 *   W01 청사과 → wak/butter · W02 초콜릿 → wak/cake · L02 망고 → crunch/rainbow-sharbet · C01 비누 → crunch/soda · C02 슈가비즈 → crunch/clover (클로버 비즈)
 *   S01 TPR 젤리볼 → crunch/guma · S02 갓 구운 빵(슬로우 라이징 폼) → 뿌왁 앱의 모닝빵(bread) squish_bread_mallang_1/2.wav
 * The files are read through the loopback-only dev route (vite.config.ts, MANZIZAK_ORIGINAL_APP_DIR). They are NOT part of the repository
 * or of any build: VITE_ORIGINAL_SOUNDS is "0" outside the dev server, so this whole module is dead code in production (scripts/check-dist.mjs checks).
 * Wax balls (W01/W02) also get the app's shared "completed" set (wak/common/completed_short_N / completed_long_N), which the app plays once
 * every piece of wax is broken and the pieces are kneaded into the core (loadOriginalMix).
 * Their redistribution rights are unverified — replace with licensed or own recordings before release.
 */
import type { FidgetEvent } from "./soundBank";

export const ORIGINAL_SOUNDS = import.meta.env.VITE_ORIGINAL_SOUNDS === "1";
export const ORIGINAL_FOLDER: Record<string, string> = {
  W01: "wak/butter",
  W02: "wak/cake",
  L02: "crunch/rainbow-sharbet",
  C01: "crunch/soda",
  C02: "crunch/clover",
  S02: "wakppu:bread",
  S01: "crunch/guma",
};
/** original phase → MANZIZAK events (short = tap, long = knead/hold, init = first break) */
const PHASES: Record<string, Partial<Record<FidgetEvent, "init" | "short" | "long">>> = {
  W01: { tap: "short", hold: "long", crack: "long" },
  W02: { init: "init", tap: "short", hold: "long", crack: "long", crunch: "short" },
  L02: { tap: "short", hold: "long", stretch: "long", fold: "short" },
  C01: { tap: "short", crunch: "short", hold: "long" },
  C02: { tap: "short", crunch: "short", hold: "long" },
  S02: { tap: "long", hold: "long" }, // the bread squish answers every click in full (tap = short voice, not cut when the finger lifts)
  S01: { tap: "short", hold: "long" },
};

/** wax balls: the installed app's "completed" (wax mixed into the core) sounds — short = a touch, long = kneading */
const MIX_TOYS = new Set(["W01", "W02"]);
export async function loadOriginalMix(ctx: BaseAudioContext, id: string): Promise<Partial<Record<"tap" | "hold", { buffer: AudioBuffer; label: string }[]>> | null> {
  if (!ORIGINAL_SOUNDS || !MIX_TOYS.has(id)) return null;
  const files = (await originalIndex())["wak/common"] ?? [];
  const out: Partial<Record<"tap" | "hold", { buffer: AudioBuffer; label: string }[]>> = {};
  for (const [ev, re] of [["tap", /^completed_short/], ["hold", /^completed_long/]] as const) {
    const list = files.filter((f) => re.test(f));
    if (list.length) out[ev] = await Promise.all(list.map(async (f) => ({ buffer: await loadPeak(ctx, `/__original-wak/wak/common/${f}`), label: `ORIGINAL-APP wak/common/${f}` })));
  }
  return out;
}

let index: Promise<Record<string, string[]>> | undefined;
const originalIndex = () =>
  (index ??= fetch("/__original-wak/index.json").then((r) => {
    if (!r.ok) throw new Error("original sounds route unavailable");
    return r.json() as Promise<Record<string, string[]>>;
  }));
const cache = new Map<string, Promise<AudioBuffer>>();
/** decode one original clip, peak-normalised to −10 dBFS (at most +18 dB) so the quiet files are audible */
function loadPeak(ctx: BaseAudioContext, url: string) {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      const b = await ctx.decodeAudioData(await r.arrayBuffer());
      const d = b.getChannelData(0);
      let pk = 1e-9;
      for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
      const out = ctx.createBuffer(1, b.length, b.sampleRate),
        y = out.getChannelData(0),
        k = Math.min(8, 0.316 / pk);
      for (let i = 0; i < d.length; i++) y[i] = d[i] * k;
      return out;
    });
    cache.set(url, p);
  }
  return p;
}
/** decoded original clips per event, peak-normalised to −10 dBFS so the quiet crunch files are audible */
export async function loadOriginalEvents(ctx: BaseAudioContext, id: string): Promise<Partial<Record<FidgetEvent, { buffer: AudioBuffer; label: string }[]>> | null> {
  const folder = ORIGINAL_FOLDER[id];
  if (!ORIGINAL_SOUNDS || !folder) return null;
  // 뿌왁 app: squish_<name>_mallang_N.wav (the two bread squishes are the whole "long" phase)
  const wakppu = folder.startsWith("wakppu:");
  const files = wakppu ? [1, 2].map((n) => `squish_${folder.slice(7)}_mallang_${n}.wav`) : ((await originalIndex())[folder] ?? []);
  const pick = (re: RegExp) => files.filter((f) => re.test(f));
  const phase: Record<string, string[]> = wakppu ? { init: [], short: [], long: files } : { init: pick(/init/i), short: pick(/short/i), long: pick(/long/i) };
  const load = (f: string) => loadPeak(ctx, wakppu ? `/__original-wakppu/${f}` : `/__original-wak/${folder}/${f}`);
  const out: Partial<Record<FidgetEvent, { buffer: AudioBuffer; label: string }[]>> = {};
  for (const [ev, ph] of Object.entries(PHASES[id] ?? {}) as [FidgetEvent, string][]) {
    const list = phase[ph] ?? [];
    if (!list.length) continue;
    out[ev] = await Promise.all(list.map(async (f) => ({ buffer: await load(f), label: `ORIGINAL-APP ${wakppu ? "wakppu/" : folder + "/"}${f}` })));
  }
  return out;
}
