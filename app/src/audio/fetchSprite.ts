/**
 * Shared fetch + decode for the sound sprites (keyboard presets, squishy, fidget chunks).
 *
 * The URLs come from the generated manifest (sfxManifest.ts), so the map (JSON) and the audio (FLAC) are requested at the same time
 * instead of one after the other. Both names carry a content hash: the browser may keep them forever.
 *
 * Errors: a network/HTTP failure is a plain Error (callers drop the cached promise so the user can retry); a file the browser cannot
 * decode is an SfxDecodeError — retrying would fail the same way, so callers keep that failure and show an error instead.
 */
export class SfxDecodeError extends Error {
  override name = 'SfxDecodeError';
}

export async function fetchSprite<M>(ctx: BaseAudioContext, jsonUrl: string, audioUrl: string): Promise<{ map: M; buffer: AudioBuffer }> {
  const [mapRes, audioRes] = await Promise.all([fetch(jsonUrl), fetch(audioUrl)]);
  if (!mapRes.ok) throw new Error(`${jsonUrl}: HTTP ${mapRes.status}`);
  if (!audioRes.ok) throw new Error(`${audioUrl}: HTTP ${audioRes.status}`);
  const [map, bytes] = await Promise.all([mapRes.json() as Promise<M>, audioRes.arrayBuffer()]);
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(bytes); // resampled to the context rate: sprites are addressed in seconds
  } catch (e) {
    throw new SfxDecodeError(`${audioUrl}: cannot decode (${e instanceof Error ? e.message : String(e)})`);
  }
  return { map, buffer };
}

/** cache helper: keep a decode failure (no endless retries), forget a network failure (retry on the next request) */
export function forgetUnlessDecodeError(cache: Map<string, Promise<unknown>>, key: string, p: Promise<unknown>): void {
  p.catch((e) => {
    if (!(e instanceof SfxDecodeError)) cache.delete(key);
  });
}
