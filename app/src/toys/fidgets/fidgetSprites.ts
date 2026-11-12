/**
 * Loader for the pre-extracted fidget clip sprites (public/sfx/fidgets/{wax,crunch}.{wav,json}, built by
 * scripts/fidgets/build-clips.mjs). Same idea as audio/keyboardSamples.ts: one WAV + one JSON map, decoded once,
 * sliced into AudioBuffers (entry gain applied) and cached per AudioContext. Failures are not cached (retry possible).
 */
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

const cache = new WeakMap<BaseAudioContext, Map<string, Promise<LoadedSprite>>>();
export function loadSprite(ctx: BaseAudioContext, name: "wax" | "crunch" | "squish", base = "./sfx/fidgets/"): Promise<LoadedSprite> {
  let per = cache.get(ctx);
  if (!per) cache.set(ctx, (per = new Map()));
  const hit = per.get(name);
  if (hit) return hit;
  const p = (async () => {
    const mapRes = await fetch(`${base}${name}.json`);
    if (!mapRes.ok) throw new Error(`fidget sprite: ${name}.json HTTP ${mapRes.status}`);
    const json = (await mapRes.json()) as SpriteJson;
    const wavRes = await fetch(`${base}${json.file}`);
    if (!wavRes.ok) throw new Error(`fidget sprite: ${json.file} HTTP ${wavRes.status}`);
    const sprite = await ctx.decodeAudioData(await wavRes.arrayBuffer());
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
  })();
  per.set(name, p);
  p.catch(() => per!.delete(name));
  return p;
}
