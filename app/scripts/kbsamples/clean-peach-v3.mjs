// LOCAL DEVELOPMENT ONLY. Peach V3 (Outemu Silent Peach V3, ThockHub K09 clips): remove the hiss the old build carried.
// The old build (build-local-presets.py) used every 237 ms file whole and amplified it ×10 (+20 dB): up to 48 ms of hiss before
// the click and 100–200 ms of hiss after the (quiet, silent-switch) strike had faded.
//
// Here, per clip (objective facts only — nobody has listened):
//   floor   = the recording's hiss (median 2 ms RMS before the onset / in the last 40 ms, the lower of the two)
//   exclude = strike less than MIN_SNR_DB over that hiss (the hiss is inside the strike itself: not repaired, left out)
//   trim    = start 3 ms before the first frame within 10 dB of the peak; end when the decay reaches floor +6 dB, then a 10 ms raised-cosine fade
//   expand  = after the peak only, 2 ms frames within 10 dB of the hiss are turned down (≤ 2:1, smoothed); attack untouched
//   level   = strike loudness (max 20 ms RMS) equalised within the pool, at the old preset's median loudness; peak ≤ 0.85
//
// Input : $MANZIZAK_REFERENCE_AUDIO_DIR/thockhub/K09/{0..13}.ogg (default /private/tmp/manzizak-six-research/reference-only)
// Output: $MANZIZAK_LOCAL_AUDIO_DIR/silent-peach-v3.{wav,json} (default /private/tmp/manzizak-local-presets); the previous
//         sprite is kept once as silent-peach-v3.orig.{wav,json} for A/B listening (keyboard-ab.html)
// Usage : FFMPEG=/path/to/ffmpeg node scripts/kbsamples/clean-peach-v3.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SR = 48000;
const REFS = process.env.MANZIZAK_REFERENCE_AUDIO_DIR ?? '/private/tmp/manzizak-six-research/reference-only';
const OUT = process.env.MANZIZAK_LOCAL_AUDIO_DIR ?? '/private/tmp/manzizak-local-presets';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const MIN_SNR_DB = 25;
const OLD_GAIN = 10; // build-local-presets.py: ×10, peak capped at 0.85
const ms = (v) => Math.round((v * SR) / 1000);
const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));
const rms = (x, a, b) => { let e = 0; for (let i = a; i < b; i++) e += x[i] * x[i]; return Math.sqrt(e / Math.max(1, b - a)); };
const median = (v) => [...v].sort((p, q) => p - q)[v.length >> 1];
const loudness = (x) => { let m = 0; for (let i = 0; i + ms(20) <= x.length; i += ms(2)) m = Math.max(m, rms(x, i, i + ms(20))); return m || rms(x, 0, x.length); };

function decode(file) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${file}: ${r.stderr}`);
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length));
}

const H = ms(2);
const clips = [], excluded = [], oldLoud = [];
for (let n = 0; n < 14; n++) {
  const src = `thockhub/K09/${n}.ogg`, x = decode(path.join(REFS, src));
  // the old build's version of this clip, for the loudness reference
  { const o = x.map((v) => v * OLD_GAIN); const pk = o.reduce((m, v) => Math.max(m, Math.abs(v)), 0); const k = pk > 0.85 ? 0.85 / pk : 1; oldLoud.push(loudness(o.map((v) => v * k))); }
  const fr = []; for (let i = 0; i + H <= x.length; i += H) fr.push(rms(x, i, i + H));
  const pk = Math.max(...fr), pi = fr.indexOf(pk), on = fr.findIndex((v) => v > pk * 0.1);
  const pre = fr.slice(0, Math.max(0, on - 2)), post = fr.slice(-20);
  const floor = Math.min(pre.length > 2 ? median(pre) : Infinity, median(post));
  const snr = db(pk / floor);
  const leadMs = Math.max(0, fr.findIndex((v) => v > pk * 0.316) * 2 - 3);
  if (snr < MIN_SNR_DB) { excluded.push({ src, snrDb: Math.round(snr * 10) / 10, reason: `strike only ${snr.toFixed(1)} dB over the hiss (< ${MIN_SNR_DB})` }); continue; }
  let endF = fr.findIndex((v, k) => k > pi && v < floor * 2);
  if (endF < 0) endF = fr.length;
  // start: 3 ms before the first frame within 10 dB of the peak — in three clips (1, 5, 7) a flat, transient-free 34–44 ms stretch
  // only ~5 dB over the hiss precedes the click; it reads as hiss, so it is left out
  const on10 = fr.findIndex((v) => v > pk * 0.316);
  const a = Math.max(0, on10 * H - ms(3)), b = Math.min(x.length, (endF + 2) * H + ms(10));
  const y = x.slice(a, b);
  // expander after the peak: frames within 10 dB of the hiss, gain = level / (floor + 10 dB), ≥ −20 dB, release 0.7 per frame
  const knee = floor * Math.pow(10, 10 / 20), pkS = (pi * H) - a, g = [];
  for (let i = 0; i < y.length; i += H) { const l = rms(y, i, Math.min(y.length, i + H)); g.push(i < pkS || l >= knee ? 1 : Math.max(0.1, l / knee)); }
  for (let k = 1; k < g.length; k++) g[k] = Math.max(g[k], g[k - 1] * 0.7);
  for (let i = 0; i < y.length; i++) { const f = i / H, k = Math.min(g.length - 1, Math.floor(f)), k2 = Math.min(g.length - 1, k + 1), t = f - k; y[i] *= g[k] * (1 - t) + g[k2] * t; }
  // fades: 0.5 ms in, 10 ms raised-cosine out
  const fi = ms(0.5), fo = Math.min(ms(10), y.length >> 1);
  for (let i = 0; i < y.length; i++) { let w = 1; if (i < fi) w *= i / fi; if (i >= y.length - fo) w *= 0.5 + 0.5 * Math.cos((Math.PI * (i - (y.length - fo))) / fo); y[i] *= w; }
  clips.push({ src, y, snrDb: snr, leadMs, floorDb: db(floor), lenMs: (y.length / SR) * 1000, origLenMs: (x.length / SR) * 1000 });
}
// level: each clip's strike loudness → the old preset's median strike loudness; peak ≤ 0.85
const target = median(oldLoud);
for (const c of clips) {
  let k = target / loudness(c.y);
  const pk = c.y.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  if (pk * k > 0.85) k = 0.85 / pk;
  c.gainDb = db(k);
  for (let i = 0; i < c.y.length; i++) c.y[i] *= k;
  c.loudDb = db(loudness(c.y));
}

// keep the previous sprite once, for A/B
for (const ext of ['wav', 'json']) {
  const cur = path.join(OUT, `silent-peach-v3.${ext}`), orig = path.join(OUT, `silent-peach-v3.orig.${ext}`);
  if (!fs.existsSync(orig) && fs.existsSync(cur)) fs.copyFileSync(cur, orig);
}
const GAP = 480;
const total = clips.reduce((n, c) => n + c.y.length + GAP, 0);
const sprite = new Float32Array(total);
let pos = 0;
const down = clips.map((c) => {
  sprite.set(c.y, pos);
  const e = { offset: Math.round((pos / SR) * 1e6) / 1e6, duration: Math.round((c.y.length / SR) * 1e6) / 1e6, gain: 1, src: c.src, sourceDetail: c.src,
    qc: { snrDb: Math.round(c.snrDb * 10) / 10, hissDbfs: Math.round(c.floorDb * 10) / 10, leadSilenceRemovedMs: c.leadMs, lenMs: Math.round(c.lenMs), origLenMs: Math.round(c.origLenMs), gainDb: Math.round(c.gainDb * 10) / 10, strikeLoudnessDbfs: Math.round(c.loudDb * 10) / 10 } };
  pos += c.y.length + GAP;
  return e;
});
const wav = Buffer.alloc(44 + sprite.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + sprite.length * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(sprite.length * 2, 40);
for (let i = 0; i < sprite.length; i++) wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sprite[i] * 32767))), 44 + i * 2);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'silent-peach-v3.wav'), wav);
fs.writeFileSync(path.join(OUT, 'silent-peach-v3.json'), JSON.stringify({
  version: 1, preset: 'silent-peach-v3', file: 'silent-peach-v3.wav', sampleRate: SR, upMode: 'none',
  entries: { down, up: [], spaceDown: [], spaceUp: [] },
  usage: 'LOCAL_DEVELOPMENT_ONLY_NOT_FOR_PUBLIC_DISTRIBUTION', rights: 'unverified',
  source: { referenceManifest: 'docs/research/keyboard-six-2026-11-11/download-manifest.json', modelId: 'K09' },
  processing: { script: 'scripts/kbsamples/clean-peach-v3.mjs', minSnrDb: MIN_SNR_DB, targetStrikeLoudnessDbfs: Math.round(db(target) * 10) / 10, excluded,
    note: 'Hiss reduction by trimming (lead silence, tail at hiss +6 dB, 10 ms fade) and a gentle post-peak expander; attack untouched; clips with the hiss inside the strike are excluded. Not listened to.' },
}, null, 2) + '\n');
console.log(`silent-peach-v3: ${clips.length} clips kept, ${excluded.length} excluded (${excluded.map((e) => e.src.split('/').pop() + ' ' + e.snrDb + ' dB').join(', ')}); length ${Math.round(Math.min(...clips.map((c) => c.lenMs)))}–${Math.round(Math.max(...clips.map((c) => c.lenMs)))} ms (was 150–237); strike loudness ${Math.min(...clips.map((c) => c.loudDb)).toFixed(1)}…${Math.max(...clips.map((c) => c.loudDb)).toFixed(1)} dBFS (target ${db(target).toFixed(1)})`);
