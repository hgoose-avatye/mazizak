// Shared helpers for fidget audio scripts. Decoding uses an ffmpeg binary: $FFMPEG, else `ffmpeg` on PATH.
import { spawnSync } from 'node:child_process';
import { SR, db, env, onsets, hp } from '../kbsamples/lib.mjs';
export { SR, db, env, onsets, hp };
export const FFMPEG = process.env.FFMPEG || 'ffmpeg';
/** decode any audio file to mono Float32 @ 48 kHz */
export function decode(file) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${file}: ${r.stderr}`);
  const b = r.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}
export const peakOf = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
export const rmsOf = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length));
