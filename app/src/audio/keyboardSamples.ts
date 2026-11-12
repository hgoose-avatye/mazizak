/**
 * Recording-based keyboard sounds (per-preset licenses: public/sfx/keyboard/CREDITS.md).
 *
 * Each preset ships as ONE 16-bit mono WAV sprite + a JSON map. We fetch both, decode once,
 * slice every entry into its own AudioBuffer (channel data copied, map gain applied) and cache
 * the result per (context, preset, baseUrl).
 *
 *   pebble — Rainy 75 (gasket-mount, lubed linear switches): low, round "thock"
 *   clack  — Gateron Blue clicky switches (recorded bank B of branch sound/recorded-ab): bright, crisp click + clear return
 *   topre — kbsim (MIT repository license; original recording provenance unverified): five rows + dedicated special keys
 *   creamy-thocky — "My Sound Pack" (Chevy, CC BY 4.0): whole clips used as key-down only (map `upMode: "none"`)
 */
import type { KeyboardSounds } from "./sfx";
import type { KeyPresetId } from "./keyPresets";
import {
  isLocalKeyPreset,
  isRetiredKeyPreset,
  LOCAL_KEY_PRESETS_ENABLED,
} from "./localKeyPresets";

export const EXTRA_KEY_ROLES = [
  "enterDown",
  "enterUp",
  "backspaceDown",
  "backspaceUp",
] as const;
export type KeyboardSampleSounds = KeyboardSounds &
  Partial<Record<(typeof EXTRA_KEY_ROLES)[number], AudioBuffer[]>> & {
    rowDown?: AudioBuffer[];
  };

export const KEYBOARD_SAMPLE_CREDITS =
  "Keyboard sounds cut from CC0 (public-domain) Freesound recordings: " +
  '"Typing on a rainy 75" by Techrul (freesound.org/s/815614) [pebble]; ' +
  '"Keyboard slow typing with Gateron Blue switches + low echo" by forfii (freesound.org/s/755222) [clack]; ' +
  '"My Sound Pack" by Chevy (mechvibes.com/sound-packs/my-sound-pack-5), CC BY 4.0 [creamy-thocky]; ' +
  "Topre, Turquoise Tealios and Buckling Spring from tplai/kbsim (github.com/tplai/kbsim), Copyright (c) Thomas Lai, MIT; original recording provenance unverified.";

interface SpriteEntry {
  /** seconds into the sprite */
  offset: number;
  /** seconds */
  duration: number;
  /** linear gain to apply */
  gain: number;
  start?: number;
  length?: number;
  src?: string;
  srcStart?: number;
  srcEnd?: number;
}
interface SpriteMap {
  version: number;
  file: string;
  sampleRate: number;
  /** "none": the preset deliberately has no release sound (up/spaceUp stay empty instead of reusing key-down sounds) */
  upMode?: "none";
  rowDown?: boolean;
  entries: Record<keyof KeyboardSounds, SpriteEntry[]> &
    Partial<Record<(typeof EXTRA_KEY_ROLES)[number], SpriteEntry[]>>;
}

const ROLES: (keyof KeyboardSounds)[] = ["down", "up", "spaceDown", "spaceUp"];
const cache = new WeakMap<
  BaseAudioContext,
  Map<string, Promise<KeyboardSampleSounds>>
>();

export function loadKeyboardSamples(
  ctx: BaseAudioContext,
  preset: KeyPresetId,
  baseUrl = "./sfx/keyboard/",
): Promise<KeyboardSampleSounds> {
  if (isRetiredKeyPreset(preset))
    return Promise.reject(
      new Error("Reserved keyboard slot has no active audio"),
    );
  if (isLocalKeyPreset(preset)) {
    if (!LOCAL_KEY_PRESETS_ENABLED)
      return Promise.reject(new Error("Local-only preset is disabled"));
    baseUrl = "/__local-keyboard/";
  }
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  let perCtx = cache.get(ctx);
  if (!perCtx) cache.set(ctx, (perCtx = new Map()));
  const key = `${base}${preset}`;
  const hit = perCtx.get(key);
  if (hit) return hit;
  const p = load(ctx, preset, base);
  perCtx.set(key, p);
  p.catch(() => perCtx!.delete(key)); // allow a retry after a network error
  return p;
}

async function load(
  ctx: BaseAudioContext,
  preset: KeyPresetId,
  base: string,
): Promise<KeyboardSampleSounds> {
  const mapRes = await fetch(`${base}${preset}.json`);
  if (!mapRes.ok)
    throw new Error(`keyboard samples: ${preset}.json HTTP ${mapRes.status}`);
  const map = (await mapRes.json()) as SpriteMap;
  const wavRes = await fetch(`${base}${map.file}`);
  if (!wavRes.ok)
    throw new Error(`keyboard samples: ${map.file} HTTP ${wavRes.status}`);
  const sprite = await ctx.decodeAudioData(await wavRes.arrayBuffer());
  // decodeAudioData resamples to ctx.sampleRate, so address the sprite in seconds.
  const sr = sprite.sampleRate;
  const src = sprite.getChannelData(0);
  const slice = (e: SpriteEntry): AudioBuffer => {
    const i0 = Math.max(0, Math.round(e.offset * sr));
    const n = Math.max(
      1,
      Math.min(src.length - i0, Math.round(e.duration * sr)),
    );
    const buf = ctx.createBuffer(1, n, sr);
    const out = buf.getChannelData(0);
    const g = e.gain ?? 1;
    for (let i = 0; i < n; i++) out[i] = src[i0 + i] * g;
    return buf;
  };
  const sounds = {} as KeyboardSampleSounds;
  for (const r of ROLES) sounds[r] = (map.entries[r] ?? []).map(slice);
  if (!sounds.down.length)
    throw new Error(`keyboard samples: ${preset} has no "down" entries`);
  // graceful fallbacks so callers never get an empty pool
  if (!sounds.spaceDown.length) sounds.spaceDown = sounds.down;
  if (map.upMode !== "none") {
    if (!sounds.up.length) sounds.up = sounds.down;
    if (!sounds.spaceUp.length) sounds.spaceUp = sounds.up;
  }
  for (const r of EXTRA_KEY_ROLES)
    if (map.entries[r]?.length) sounds[r] = map.entries[r]!.map(slice);
  if (map.rowDown) {
    if (sounds.down.length !== 5)
      throw new Error(`keyboard samples: ${preset} needs five row sounds`);
    sounds.rowDown = sounds.down;
  }
  return sounds;
}
