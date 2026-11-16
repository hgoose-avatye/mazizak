/**
 * Loader for the fidget clip sprites. Source: audio-src/sfx/fidgets/{squish,wax,crunch,picks}.{wav,json} (scripts/fidgets/build-clips.mjs,
 * build-picks.py). Shipped: per-toy chunks made by scripts/audio/pack-sfx.mjs — the pools used by exactly the same toys, as lossless FLAC
 * (public/sfx/fidgets/<source>.<toys>.<hash>.{flac,json}, listed in sfxManifest.ts). A toy loads only its own chunks; a chunk two toys share
 * is fetched once. Each chunk is decoded once, sliced into AudioBuffers (entry gain applied) and cached per AudioContext. Network failures
 * are not cached (retry possible); a file the browser cannot decode is (no endless retries).
 */
import { SFX_FIDGET_CHUNKS, SFX_FIDGET_TOYS } from "../../audio/sfxManifest";
import { fetchSprite, forgetUnlessDecodeError } from "../../audio/fetchSprite";

export interface SpriteEntry {
  start: number;
  length: number;
  offset: number;
  duration: number;
  gain: number;
  src: string;
  srcStart: number;
  srcEnd: number;
}
export interface SpritePoolMeta {
  event: string;
  loudnessClass: string;
  material: string;
  note: string;
  recordings: number;
  variants: number;
  entries: SpriteEntry[];
}
export interface SpriteSource {
  title: string;
  author: string;
  url: string;
  license: string;
  licenseUrl: string;
  retrieved: string;
  usage: string;
  materialMatch: string;
  originalFile: string;
}
export interface SpriteJson {
  version: number;
  file: string;
  sampleRate: number;
  totalSamples: number;
  counts: { sourceFiles: number; extractedClips: number; derivedVariants: number };
  sources: Record<string, SpriteSource>;
  pools: Record<string, SpritePoolMeta>;
}
export interface LoadedSprite {
  json: SpriteJson;
  pools: Record<string, AudioBuffer[]>;
}

export type SpriteName = "wax" | "crunch" | "squish" | "picks";
const cache = new WeakMap<BaseAudioContext, Map<string, Promise<LoadedSprite>>>();
/** one shipped chunk (cached per context; concurrent callers share one request) */
export function loadChunk(ctx: BaseAudioContext, name: string): Promise<LoadedSprite> {
  let per = cache.get(ctx);
  if (!per) cache.set(ctx, (per = new Map()));
  const hit = per.get(name);
  if (hit) return hit;
  const files = SFX_FIDGET_CHUNKS[name];
  const p = files
    ? (async () => {
        const { map: json, buffer: sprite } = await fetchSprite<SpriteJson>(ctx, `./${files.json}`, `./${files.audio}`);
        const sr = sprite.sampleRate; // decodeAudioData resamples to the context rate: address the sprite in seconds
        const src = sprite.getChannelData(0);
        const pools: Record<string, AudioBuffer[]> = {};
        for (const [pool, meta] of Object.entries(json.pools)) {
          pools[pool] = meta.entries.map((e) => {
            const i0 = Math.max(0, Math.round(e.offset * sr));
            const n = Math.max(1, Math.min(src.length - i0, Math.round(e.duration * sr)));
            const buf = ctx.createBuffer(1, n, sr);
            const out = buf.getChannelData(0);
            for (let i = 0; i < n; i++) out[i] = src[i0 + i] * e.gain;
            return buf;
          });
          if (!pools[pool].length) throw new Error(`fidget sprite: pool ${pool} is empty`);
        }
        return { json, pools };
      })()
    : Promise.reject(new Error(`fidget sprite: no chunk ${name}`));
  per.set(name, p);
  forgetUnlessDecodeError(per, name, p);
  return p;
}
/** the chunks a toy plays from */
export const chunksOf = (toyId: string): string[] => SFX_FIDGET_TOYS[toyId] ?? [];
/** Everything a toy needs, by source sprite (pools of its chunks merged), fetched in parallel. */
export async function loadToySprites(ctx: BaseAudioContext, toyId: string): Promise<Partial<Record<SpriteName, LoadedSprite>>> {
  const names = chunksOf(toyId);
  const loaded = await Promise.all(names.map((n) => loadChunk(ctx, n)));
  const out: Partial<Record<SpriteName, LoadedSprite>> = {};
  names.forEach((n, i) => {
    const source = n.split(".")[0] as SpriteName;
    const l = loaded[i];
    const m = (out[source] ??= { json: { ...l.json, pools: {}, sources: {} }, pools: {} });
    Object.assign(m.json.pools, l.json.pools);
    Object.assign(m.json.sources, l.json.sources);
    Object.assign(m.pools, l.pools);
  });
  return out;
}
