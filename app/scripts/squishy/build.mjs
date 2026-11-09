// Builds public/sfx/squishy/squishy.wav + squishy.json from CC0 Freesound recordings.
// Inputs: bench-out/audio-src/squishy/f32/*.f32 (mono float32 @44.1 kHz, made by decode.mjs from the
// Freesound HQ preview MP3s). Pipeline per source: DC/rumble high-pass -> gentle STFT spectral noise
// reduction (max 14 dB) -> slice (onset-trimmed) -> fades -> per-category loudness match with a
// -1.5 dBFS peak ceiling -> resample to 32 kHz -> 16-bit mono sprite.
// usage: node scripts/squishy/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(APP, 'bench-out/audio-src/squishy/f32');
const OUT = path.join(APP, 'public/sfx/squishy');
const SR = 44100;
const OUT_SR = 32000;
const RETRIEVED = '2026-11-09';

// ───────────── sources (all Freesound, CC0 1.0, HQ preview MP3) ─────────────
const SOURCES = {
  cushionSit: { id: 746443, file: '746443_15147285-hq', title: 'Sitting on a couch', author: 'mk-la' },
  cushionSq: { id: 405654, file: '405654_2469791-hq', title: 'found cushion 2.wav', author: 'apinasaundi' },
  gel: { id: 575333, file: '575333_9246516-hq', title: 'squishing gel between hands', author: 'breadparticles' },
  sponge: { id: 50579, file: '50579_71257-hq', title: 'Dry Sponge Rubbing', author: 'qubodup' },
  glove: { id: 827006, file: '827006_13510038-hq', title: 'stretching rubber glove', author: 'mistakenforathing' },
  fabric: { id: 716374, file: '716374_5287430-hq', title: 'Fabric touched by hand', author: 'Sadiquecat' },
  pillow: { id: 872227, file: '872227_19256798-hq', title: 'Soft Impact - Pillow Hit', author: 'KoimeMatsuchiya' },
  pufoam: { id: 680000, file: '680000_12524018-hq', title: 'Rubbing Spiky Sound Insulation Foam', author: 'imnotdubMass' },
};
const userOf = (s) => s.author.replace(/ /g, '%20');
for (const s of Object.values(SOURCES)) s.url = `https://freesound.org/people/${userOf(s)}/sounds/${s.id}/`;

// ───────────── DSP helpers ─────────────
const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));
const undb = (d) => Math.pow(10, d / 20);

function highpass(x, fc) {
  // 2nd-order Butterworth HP (RBJ), run forward then backward (zero phase, 4th order)
  const w = (2 * Math.PI * fc) / SR, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2;
  const b0 = (1 + c) / 2, b1 = -(1 + c), b2 = b0, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  const run = (v) => {
    const y = new Float32Array(v.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < v.length; i++) {
      const o = (b0 * v[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = v[i]; y2 = y1; y1 = o; y[i] = o;
    }
    return y;
  };
  return run(run(x.slice().reverse()).reverse());
}
function lowpass1(x, fc, passes = 2) {
  let y = x.slice();
  const a = Math.exp((-2 * Math.PI * fc) / SR);
  for (let p = 0; p < passes; p++) { let s = 0; for (let i = 0; i < y.length; i++) { s = (1 - a) * y[i] + a * s; y[i] = s; } }
  return y;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, h = len >> 1;
    for (let i = 0; i < n; i += len) for (let k = 0; k < h; k++) {
      const c = Math.cos(a * k), s = Math.sin(a * k);
      const vr = re[i + k + h] * c - im[i + k + h] * s, vi = re[i + k + h] * s + im[i + k + h] * c;
      re[i + k + h] = re[i + k] - vr; im[i + k + h] = im[i + k] - vi; re[i + k] += vr; im[i + k] += vi;
    }
  }
}
const ifft = (re, im) => { for (let i = 0; i < im.length; i++) im[i] = -im[i]; fft(re, im); for (let i = 0; i < re.length; i++) { re[i] /= re.length; im[i] = -im[i] / re.length; } };

/** Gentle spectral noise reduction. Noise PSD = mean of the quietest 10 % of frames.
 *  Wiener-style gain, over-subtraction 1.5, floor -14 dB, temporal smoothing against musical noise. */
function denoise(x, { floorDb = -14, over = 1.5 } = {}) {
  const N = 2048, H = 512, nb = N / 2 + 1;
  const win = Float64Array.from({ length: N }, (_, i) => Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)));
  const nF = Math.ceil((x.length + N) / H);
  const pad = new Float32Array(nF * H + N); pad.set(x, N / 2);
  const frames = [];
  for (let f = 0; f < nF; f++) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (pad[f * H + i] || 0) * win[i];
    fft(re, im);
    let e = 0; const p = new Float64Array(nb);
    for (let k = 0; k < nb; k++) { p[k] = re[k] * re[k] + im[k] * im[k]; e += p[k]; }
    frames.push({ re, im, p, e });
  }
  const sorted = frames.map((f, i) => [f.e, i]).filter((v) => v[0] > 0).sort((a, b) => a[0] - b[0]);
  const quiet = sorted.slice(0, Math.max(4, Math.floor(sorted.length * 0.1)));
  const noise = new Float64Array(nb);
  for (const [, i] of quiet) for (let k = 0; k < nb; k++) noise[k] += frames[i].p[k] / quiet.length;
  const gmin = undb(floorDb);
  const out = new Float32Array(pad.length);
  let gPrev = new Float64Array(nb).fill(1);
  for (let f = 0; f < nF; f++) {
    const { re, im, p } = frames[f];
    const g = new Float64Array(nb);
    for (let k = 0; k < nb; k++) {
      const raw = Math.max(gmin, Math.sqrt(Math.max(0, 1 - (over * noise[k]) / (p[k] + 1e-20))));
      g[k] = Math.max(raw, 0.5 * gPrev[k]); // release smoothing (no sudden gating)
    }
    for (let k = 0; k < nb; k++) {
      re[k] *= g[k]; im[k] *= g[k];
      if (k > 0 && k < N / 2) { re[N - k] *= g[k]; im[N - k] *= g[k]; }
    }
    gPrev = g;
    ifft(re, im);
    for (let i = 0; i < N; i++) out[f * H + i] += re[i] * win[i];
  }
  // sqrt-hann analysis*synthesis at 75 % overlap sums to 2
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = out[i + N / 2] / 2;
  return { y };
}

function envDb(x, blk) {
  const out = [];
  for (let s = 0; s + blk <= x.length; s += blk) { let e = 0; for (let i = 0; i < blk; i++) e += x[s + i] ** 2; out.push(10 * Math.log10(e / blk + 1e-20)); }
  return out;
}
const rmsDb = (x) => 10 * Math.log10(x.reduce((s, v) => s + v * v, 0) / x.length + 1e-20);
const peakDb = (x) => db(x.reduce((m, v) => Math.max(m, Math.abs(v)), 0));
/** RMS over the active part (10 ms blocks within 30 dB of the loudest block) */
function activeRmsDb(x) {
  const e = envDb(x, 441); if (!e.length) return rmsDb(x);
  const mx = Math.max(...e); const act = e.filter((v) => v > mx - 30);
  return 10 * Math.log10(act.reduce((s, v) => s + 10 ** (v / 10), 0) / act.length);
}

/** First sample index where the 1 ms-block RMS gets within `relDb` of the slice's loudest block. */
function onsetIndex(x, relDb) {
  const blk = 44; const e = envDb(x, blk); const mx = Math.max(...e);
  const i = e.findIndex((v) => v >= mx + relDb);
  return Math.max(0, i * blk - 22);
}
function fadeIn(x, n, shape = 'cos') { n = Math.min(n, x.length); for (let i = 0; i < n; i++) x[i] *= shape === 'cos' ? 0.5 - 0.5 * Math.cos((Math.PI * i) / n) : i / n; }
function fadeOut(x, n) { n = Math.min(n, x.length); for (let i = 0; i < n; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n); }
function removeDc(x) { const m = x.reduce((s, v) => s + v, 0) / x.length; for (let i = 0; i < x.length; i++) x[i] -= m; }

/** Linear-interp time-scaling by `factor` (>1 = slower and lower, like tape). Band-limit first. */
function slowDown(x, factor) {
  const n = Math.floor(x.length * factor); const y = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / factor, k = Math.floor(t), f = t - k; y[i] = (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f; }
  return y;
}
/** Windowed-sinc resampler 44.1k -> OUT_SR, cutoff 0.92 * Nyquist(out). */
function resample(x, from, to) {
  const ratio = from / to, n = Math.floor(x.length / ratio), y = new Float32Array(n);
  const fc = (0.92 * 0.5 * to) / from, Z = 24;
  for (let i = 0; i < n; i++) {
    const t = i * ratio, k0 = Math.floor(t); let s = 0, ws = 0;
    for (let k = k0 - Z; k <= k0 + Z; k++) {
      const d = t - k; const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / (Z + 1));
      const h = d === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d);
      s += (x[k] || 0) * h * w; ws += h * w;
    }
    y[i] = s / ws;
  }
  return y;
}

/** Find the steadiest window of length `len` s within [a,b] (min std-dev of 50 ms RMS dB, penalise quiet). */
function steadiest(x, a, b, len) {
  const blk = 2205, e = envDb(x, blk), w = Math.round(len * 20), best = { s: 0, score: Infinity };
  for (let s = Math.round(a * 20); s + w <= Math.round(b * 20); s++) {
    const seg = e.slice(s, s + w); const m = seg.reduce((p, v) => p + v, 0) / w;
    const sd = Math.sqrt(seg.reduce((p, v) => p + (v - m) ** 2, 0) / w);
    const score = sd - 0.15 * m; if (score < best.score) Object.assign(best, { s, score, sd, m });
  }
  return { start: best.s / 20, sd: best.sd };
}
/** Seamless loop: take len+xf seconds, equal-power crossfade the overflow tail onto the head. */
function makeLoop(x, startS, len, xf) {
  const s = Math.round(startS * SR), L = Math.round(len * SR), X = Math.round(xf * SR);
  const seg = x.subarray(s, s + L + X); const y = Float32Array.from(seg.subarray(0, L));
  for (let i = 0; i < X; i++) { const t = i / X; y[i] = seg[i] * Math.sin((t * Math.PI) / 2) + seg[L + i] * Math.cos((t * Math.PI) / 2); }
  return y;
}

// ───────────── load + clean sources ─────────────
const clean = {};
const srcStats = {};
for (const [key, s] of Object.entries(SOURCES)) {
  const raw = new Float32Array(fs.readFileSync(path.join(SRC, s.file + '.f32')).buffer.slice(0));
  const hp = highpass(raw, 45);
  const { y } = denoise(hp);
  clean[key] = y;
  const q10 = (v) => { const e = envDb(v, 882).sort((a, b) => a - b); return +e[Math.floor(e.length * 0.1)].toFixed(1); };
  srcStats[key] = { noiseFloorBeforeDb: q10(hp), noiseFloorAfterDb: q10(y), peakDb: +peakDb(raw).toFixed(1) };
}

// ───────────── slicing plan ─────────────
// Times are in the ORIGINAL source (seconds). Onsets are refined automatically.
const slices = [];
function oneShot(cat, name, src, t0, t1, { onsetRel = -24, fadeOutS = 0.06, maxLen } = {}) {
  const x = clean[src].subarray(Math.round(t0 * SR), Math.round(t1 * SR));
  const on = onsetIndex(x, onsetRel);
  let y = Float32Array.from(x.subarray(on, maxLen ? on + Math.round(maxLen * SR) : undefined));
  removeDc(y); fadeIn(y, 44, 'lin'); fadeOut(y, Math.round(fadeOutS * SR));
  slices.push({ cat, name, src, srcStart: t0 + on / SR, srcEnd: t0 + (on + y.length) / SR, y });
}

// touch — finger/hand landing on soft fabric/foam: short contact transients (≤ 0.16 s)
oneShot('touch', 'touch_fabric_a', 'fabric', 0.55, 1.1, { onsetRel: -20, maxLen: 0.14, fadeOutS: 0.08 });
oneShot('touch', 'touch_fabric_b', 'fabric', 5.45, 6.1, { onsetRel: -20, maxLen: 0.14, fadeOutS: 0.08 });
oneShot('touch', 'touch_fabric_c', 'fabric', 9.9, 10.5, { onsetRel: -20, maxLen: 0.13, fadeOutS: 0.08 });
oneShot('touch', 'touch_pillow', 'pillow', 0.0, 0.4, { onsetRel: -24, maxLen: 0.16, fadeOutS: 0.1 });
oneShot('touch', 'touch_foam', 'pufoam', 9.85, 10.3, { onsetRel: -20, maxLen: 0.14, fadeOutS: 0.08 });

// compress — cushion/foam being squeezed: air pushed out + fabric/foam crush (0.4–0.75 s)
oneShot('compress', 'compress_cushion_a', 'cushionSit', 1.25, 2.0, { fadeOutS: 0.2 });
oneShot('compress', 'compress_cushion_b', 'cushionSit', 4.9, 5.6, { fadeOutS: 0.2 });
oneShot('compress', 'compress_cushion_c', 'cushionSit', 7.0, 7.7, { fadeOutS: 0.2 });
oneShot('compress', 'compress_cushion_d', 'cushionSit', 8.38, 9.1, { fadeOutS: 0.2 });
oneShot('compress', 'compress_cushion_e', 'cushionSit', 10.2, 10.85, { fadeOutS: 0.2 });
oneShot('compress', 'compress_plastic_cushion', 'cushionSq', 0.1, 0.85, { fadeOutS: 0.2 });

// compressGel — hand squelch of gel (optional field)
oneShot('compressGel', 'gel_a', 'gel', 0.25, 0.62, { fadeOutS: 0.1 });
oneShot('compressGel', 'gel_b', 'gel', 1.12, 1.74, { fadeOutS: 0.15 });
oneShot('compressGel', 'gel_c', 'gel', 2.08, 2.7, { fadeOutS: 0.15 });
oneShot('compressGel', 'gel_d', 'gel', 3.36, 3.88, { fadeOutS: 0.12 });
oneShot('compressGel', 'gel_e', 'gel', 4.34, 4.94, { fadeOutS: 0.15 });

// rub — dry sponge on sponge, steadiest 2.4 s of the dense middle section, 0.25 s equal-power seam
{
  const len = 2.4, xf = 0.25; const { start, sd } = steadiest(clean.sponge, 9, 14.5 - xf, len + xf);
  const y = makeLoop(clean.sponge, start, len, xf); removeDc(y);
  slices.push({ cat: 'rub', name: 'rub_sponge_loop', src: 'sponge', srcStart: start, srcEnd: start + len + xf, y, loop: true, envSdDb: sd });
}
// stretch — rubber glove being stretched/twisted, steadiest 2.4 s in the busy section
{
  const len = 2.4, xf = 0.25; const { start, sd } = steadiest(clean.glove, 5.8, 11 - xf, len + xf);
  const y = makeLoop(clean.glove, start, len, xf); removeDc(y);
  slices.push({ cat: 'stretch', name: 'stretch_glove_loop', src: 'glove', srcStart: start, srcEnd: start + len + xf, y, loop: true, envSdDb: sd });
}

// recover — DERIVED: real foam/cushion air recordings slowed (tape-style), low-passed, reversed
// (exhale -> intake), long fades. Not a recording of a foam actually recovering.
function recover(name, src, t0, t1, factor, lp) {
  const x = Float32Array.from(clean[src].subarray(Math.round(t0 * SR), Math.round(t1 * SR)));
  let y = slowDown(x, factor);
  y = lowpass1(y, lp); y.reverse(); removeDc(y);
  fadeIn(y, Math.round(y.length * 0.45)); fadeOut(y, Math.round(y.length * 0.4));
  slices.push({ cat: 'recover', name, src, srcStart: t0, srcEnd: t1, y, derived: `slowed x${factor}, low-pass ${lp} Hz, reversed, 45%/40% fades` });
}
recover('recover_cushion_air', 'cushionSq', 0.15, 0.85, 2.6, 4000);
recover('recover_foam_air', 'pufoam', 9.85, 10.3, 4.0, 3500);

// ───────────── resample + loudness match (measured on the 32 kHz result so the ceiling holds) ─────────────
const TARGET = { compress: -20, compressGel: -21, rub: -25, stretch: -27, touch: -27, recover: -36 }; // active RMS dBFS
const CEIL = -1.5;
for (const s of slices) {
  s.r = resample(s.y, SR, OUT_SR);
  if (!s.loop) fadeIn(s.r, Math.round(0.0005 * OUT_SR), 'lin');
  const a = activeRmsDb(s.r), p = peakDb(s.r);
  const g = Math.min(TARGET[s.cat] - a, CEIL - p);
  for (let i = 0; i < s.r.length; i++) s.r[i] *= undb(g);
  s.gainDb = g;
}

// ───────────── sprite ─────────────
const GAP = Math.round(0.05 * OUT_SR);
const parts = []; let pos = GAP; const map = { sampleRate: OUT_SR, file: 'squishy.wav', categoryGain: {}, slices: [] };
for (const c of Object.keys(TARGET)) map.categoryGain[c] = 1;
for (const s of slices) {
  const r = s.r;
  parts.push({ at: pos, r });
  map.slices.push({
    name: s.name, cat: s.cat, start: pos / OUT_SR, end: (pos + r.length) / OUT_SR, startSample: pos, length: r.length,
    loop: !!s.loop, src: `freesound:${SOURCES[s.src].id}`, srcUrl: SOURCES[s.src].url,
    srcStart: +s.srcStart.toFixed(4), srcEnd: +s.srcEnd.toFixed(4),
    processing: s.derived ?? (s.loop ? 'hp45, spectral NR (max 14 dB), equal-power loop crossfade 0.25 s' : 'hp45, spectral NR (max 14 dB), onset trim, 1 ms fade-in, cosine fade-out'),
    recorded: !s.derived, gainDb: +s.gainDb.toFixed(2),
    activeRmsDb: +activeRmsDb(r).toFixed(2), peakDb: +peakDb(r).toFixed(2),
  });
  pos += r.length + GAP;
}
const total = pos;
const pcm = new Int16Array(total);
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
for (const { at, r } of parts) for (let i = 0; i < r.length; i++) {
  const v = r[i] * 32767 + (rnd() - rnd()); pcm[at + i] = Math.max(-32768, Math.min(32767, Math.round(v)));
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.byteLength, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(OUT_SR, 24);
hdr.writeUInt32LE(OUT_SR * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.byteLength, 40);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'squishy.wav'), Buffer.concat([hdr, Buffer.from(pcm.buffer)]));
map.sources = Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [`freesound:${s.id}`, {
  title: s.title, author: s.author, url: s.url, license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  retrieved: RETRIEVED, retrievedFile: `https://cdn.freesound.org/previews/${String(s.id).slice(0, -3) || '0'}/${s.file}.mp3`, ...srcStats[k],
}]));
fs.writeFileSync(path.join(OUT, 'squishy.json'), JSON.stringify(map, null, 1));

for (const s of map.slices) console.log(s.cat.padEnd(12), s.name.padEnd(26), ((s.end - s.start)).toFixed(3) + 's', 'rms', s.activeRmsDb, 'pk', s.peakDb, 'g', s.gainDb);
for (const [k, v] of Object.entries(srcStats)) console.log('source', k, JSON.stringify(v));
console.log('sprite', (total / OUT_SR).toFixed(2) + 's', fs.statSync(path.join(OUT, 'squishy.wav')).size, 'bytes');
