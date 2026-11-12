/**
 * DEV ONLY — stand-in sounds taken from the owner's installed reference app, chosen by the owner:
 *   W01 청사과 → wak/butter · W02 초콜릿 → wak/cake · L02 망고 → crunch/rainbow-sharbet · C01 비누 → crunch/soda · C02 슈가비즈 → crunch/watermelon
 * The files are read through the loopback-only dev route (vite.config.ts, MANZIZAK_ORIGINAL_APP_DIR). They are NOT part of the repository
 * or of any build: VITE_ORIGINAL_SOUNDS is "0" outside the dev server, so this whole module is dead code in production (scripts/check-dist.mjs checks).
 * Their redistribution rights are unverified — replace with licensed or own recordings before release.
 */
import type { FidgetEvent } from "./soundBank";

export const ORIGINAL_SOUNDS = import.meta.env.VITE_ORIGINAL_SOUNDS === "1";
export const ORIGINAL_FOLDER: Record<string, string> = {
  W01: "wak/butter",
  W02: "wak/cake",
  L02: "crunch/rainbow-sharbet",
  C01: "crunch/soda",
  C02: "crunch/watermelon",
};
/** original phase → MANZIZAK events (short = tap, long = knead/hold, init = first break) */
const PHASES: Record<string, Partial<Record<FidgetEvent, "init" | "short" | "long">>> = {
  W01: { tap: "short", hold: "long", crack: "long" },
  W02: { init: "init", tap: "short", hold: "long", crack: "long" },
  L02: { tap: "short", hold: "long", stretch: "long", fold: "short" },
  C01: { tap: "short", crunch: "short", hold: "long" },
  C02: { tap: "short", crunch: "short", hold: "long" },
};

let index: Promise<Record<string, string[]>> | undefined;
const cache = new Map<string, Promise<AudioBuffer>>();
/** decoded original clips per event, peak-normalised to −10 dBFS so the quiet crunch files are audible */
export async function loadOriginalEvents(ctx: BaseAudioContext, id: string): Promise<Partial<Record<FidgetEvent, { buffer: AudioBuffer; label: string }[]>> | null> {
  const folder = ORIGINAL_FOLDER[id];
  if (!ORIGINAL_SOUNDS || !folder) return null;
  index ??= fetch("/__original-wak/index.json").then((r) => {
    if (!r.ok) throw new Error("original sounds route unavailable");
    return r.json() as Promise<Record<string, string[]>>;
  });
  const files = (await index)[folder] ?? [];
  const pick = (re: RegExp) => files.filter((f) => re.test(f));
  const phase: Record<string, string[]> = { init: pick(/init/i), short: pick(/short/i), long: pick(/long/i) };
  const load = (f: string) => {
    let p = cache.get(f);
    if (!p) {
      p = fetch(`/__original-wak/${folder}/${f}`).then(async (r) => {
        if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
        const b = await ctx.decodeAudioData(await r.arrayBuffer());
        const d = b.getChannelData(0);
        let pk = 1e-9;
        for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
        const out = ctx.createBuffer(1, b.length, b.sampleRate), y = out.getChannelData(0), k = Math.min(8, 0.316 / pk);
        for (let i = 0; i < d.length; i++) y[i] = d[i] * k;
        return out;
      });
      cache.set(f, p);
    }
    return p;
  };
  const out: Partial<Record<FidgetEvent, { buffer: AudioBuffer; label: string }[]>> = {};
  for (const [ev, ph] of Object.entries(PHASES[id] ?? {}) as [FidgetEvent, string][]) {
    const list = phase[ph] ?? [];
    if (!list.length) continue;
    out[ev] = await Promise.all(list.map(async (f) => ({ buffer: await load(f), label: `ORIGINAL-APP ${folder}/${f}` })));
  }
  return out;
}
