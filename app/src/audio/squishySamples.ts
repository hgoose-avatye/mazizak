/**
 * Recorded squishy (slow-rising foam) sample set.
 *
 * One 16-bit mono WAV sprite (public/sfx/squishy/squishy.wav, 32 kHz) + JSON slice map
 * (squishy.json) built by scripts/squishy/build.mjs from CC0 Freesound recordings.
 * Each slice carries its provenance (src, srcStart, srcEnd) in the JSON.
 *
 * Categories:
 *  - touch      5 one-shots  (hand on couch fabric, pillow hit, stick on PU foam — contact onsets)
 *  - compress   6 one-shots  (couch cushion being sat/pressed, plastic cushion squeeze)
 *  - compressGel 5 one-shots (optional; skin gel squelched between hands)
 *  - rub        1 seamless loop (dry sponge rubbed on sponge)
 *  - stretch    1 seamless loop (rubber glove stretched/twisted)
 *  - recover    2 one-shots  DERIVED: real cushion/foam air recordings slowed, low-passed and reversed.
 *               Not a recording of foam actually rising back — see docs/RECORDING_SPEC_squishy.md.
 */

export interface SquishySoundsV2 {
  touch: AudioBuffer[];
  compress: AudioBuffer[];
  rub: AudioBuffer;
  stretch: AudioBuffer;
  recover: AudioBuffer[];
  /** Optional gel-squelch compress variants (present when the sprite contains them). */
  compressGel?: AudioBuffer[];
}

interface SliceInfo {
  name: string;
  cat: string;
  start: number; // seconds in sprite
  end: number;
  loop: boolean;
  src: string;
  srcStart: number;
  srcEnd: number;
  recorded: boolean;
}
interface SpriteMap {
  sampleRate: number;
  file: string;
  categoryGain: Record<string, number>;
  slices: SliceInfo[];
}

export const SQUISHY_SAMPLE_CREDITS =
  'Squishy sounds edited from CC0 1.0 (public domain) recordings on Freesound.org: ' +
  '"Sitting on a couch" by mk-la (#746443); "found cushion 2.wav" by apinasaundi (#405654); ' +
  '"squishing gel between hands" by breadparticles (#575333); "Dry Sponge Rubbing" by qubodup (#50579); ' +
  '"stretching rubber glove" by mistakenforathing (#827006); "Fabric touched by hand" by Sadiquecat (#716374); ' +
  '"Soft Impact - Pillow Hit" by KoimeMatsuchiya (#872227); "Rubbing Spiky Sound Insulation Foam" by imnotdubMass (#680000). ' +
  'The "recover" sounds are derived (slowed, filtered, reversed) from #405654 and #680000. See public/sfx/squishy/CREDITS.md.';

/** All categories are cut from real recordings (no synthesis). Note: `recover` is re-edited
 *  (slowed/reversed) recorded material rather than a direct recording of foam recovering. */
/** false: `recover` is re-edited (slowed/reversed) real material, not a direct recording of foam rising. */
export const SQUISHY_SAMPLES_ARE_RECORDED = false;

const cache = new WeakMap<BaseAudioContext, Map<string, Promise<SquishySoundsV2>>>();

export function loadSquishySamples(ctx: BaseAudioContext, baseUrl = './sfx/squishy/'): Promise<SquishySoundsV2> {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  let perCtx = cache.get(ctx);
  if (!perCtx) cache.set(ctx, (perCtx = new Map()));
  const hit = perCtx.get(base);
  if (hit) return hit;
  const p = load(ctx, base);
  perCtx.set(base, p);
  p.catch(() => perCtx!.delete(base)); // allow retry after a failed load
  return p;
}

async function load(ctx: BaseAudioContext, base: string): Promise<SquishySoundsV2> {
  const mapRes = await fetch(base + 'squishy.json');
  if (!mapRes.ok) throw new Error(`squishy.json: HTTP ${mapRes.status}`);
  const map = (await mapRes.json()) as SpriteMap;
  const wavRes = await fetch(base + map.file);
  if (!wavRes.ok) throw new Error(`${map.file}: HTTP ${wavRes.status}`);
  const sprite = await ctx.decodeAudioData(await wavRes.arrayBuffer()); // resampled to ctx rate
  const src = sprite.getChannelData(0);
  const sr = sprite.sampleRate;

  const cut = (s: SliceInfo): AudioBuffer => {
    const a = Math.round(s.start * sr);
    const n = Math.max(1, Math.min(src.length - a, Math.round((s.end - s.start) * sr)));
    const buf = ctx.createBuffer(1, n, sr);
    const out = buf.getChannelData(0);
    const g = map.categoryGain[s.cat] ?? 1;
    for (let i = 0; i < n; i++) out[i] = src[a + i] * g;
    return buf;
  };
  const byCat = (cat: string) => map.slices.filter((s) => s.cat === cat).map(cut);
  const one = (cat: string) => {
    const s = map.slices.find((v) => v.cat === cat);
    if (!s) throw new Error(`squishy sprite has no "${cat}" slice`);
    return cut(s);
  };

  const sounds: SquishySoundsV2 = {
    touch: byCat('touch'),
    compress: byCat('compress'),
    rub: one('rub'),
    stretch: one('stretch'),
    recover: byCat('recover'),
  };
  const gel = byCat('compressGel');
  if (gel.length) sounds.compressGel = gel;
  return sounds;
}
