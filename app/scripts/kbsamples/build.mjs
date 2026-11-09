// Build keyboard sample sprites from CC0 recordings (see public/sfx/keyboard/CREDITS.md).
// Inputs: bench-out/audio-src/keyboard/*.f32 (mono Float32 @48k, produced by decode.mjs from the
// downloaded Freesound previews). Outputs: public/sfx/keyboard/{pebble,clack}.wav + .json
//
// Usage: node scripts/kbsamples/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, SR, db, env, onsets } from './lib.mjs';
import { hp2, centroidPow } from './features.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_DIR = path.join(ROOT, 'bench-out/audio-src/keyboard');
const OUT_DIR = path.join(ROOT, 'public/sfx/keyboard');
const ms = (v) => Math.round((v * SR) / 1000);

const SOURCES = {
  rainy75: { file: 'fs_815614_15899953-hq.f32', id: 'freesound:815614' },
  // WhiteFox clips (Yeti Nano on the desk) carry a strong ~80 Hz desk/mic-stand resonance after every
  // stroke; an extra 110 Hz high-pass removes that recording artefact (below phone-speaker range anyway).
  wf4: { file: 'fs_546045_12206738-hq.f32', id: 'freesound:546045', extraHp: 110 },
  wf10: { file: 'fs_546167_12206738-hq.f32', id: 'freesound:546167', extraHp: 110 },
};

// ───────────── analysis per source ─────────────
const cache = {};
function src(key) {
  if (cache[key]) return cache[key];
  const raw = load(path.join(SRC_DIR, SOURCES[key].file));
  // Cleanup identical for every source: 2nd-order high-pass @75 Hz removes desk/mic-stand rumble
  // (strong 40–80 Hz thump in all recordings) and DC. Nothing else is filtered.
  let y = hp2(hp2(raw, 20), 75);
  if (SOURCES[key].extraHp) y = hp2(y, SOURCES[key].extraHp);
  const e = env(y, 48); // 1 ms RMS frames
  const ev = onsets(y, { jumpDb: 10, minAbove: 15, minGapMs: 25 }).map((o) => {
    const f0 = Math.round(o.t * 1000);
    let pf = f0, pv = 0;
    for (let f = f0; f < f0 + 15 && f < e.length; f++) if (e[f] > pv) { pv = e[f]; pf = f; }
    return { t: o.t, f: pf, pk: db(pv), cent: centroidPow(y, pf * 48 - 48, 1440) };
  });
  ev.forEach((o, k) => { o.prev = k ? (o.f - ev[k - 1].f) : 1e9; o.next = k + 1 < ev.length ? ev[k + 1].f - o.f : 1e9; o.k = k; });
  return (cache[key] = { key, y, e, ev });
}

/** sample-accurate start: earliest sample within 2 ms before the main peak that exceeds 15% of it, minus 0.5 ms */
function refineStart(y, frame) {
  let pi = frame * 48, pv = 0;
  // window reaches 15 ms past the detected onset: MP3 pre-echo (flat noise up to ~10 ms before a
  // transient in these lossy previews) often triggers the detector before the real hit.
  for (let i = frame * 48 - ms(4); i < frame * 48 + ms(15); i++) if (Math.abs(y[i]) > pv) { pv = Math.abs(y[i]); pi = i; }
  let s = pi;
  for (let i = pi - ms(2); i < pi; i++) if (Math.abs(y[i]) > 0.15 * pv) { s = i; break; }
  return Math.max(0, s - ms(0.5));
}

function floorDb(S, frame) {
  const a = Math.max(0, frame - 1500), b = Math.min(S.e.length, frame + 1500);
  const v = Array.from(S.e.subarray(a, b)).sort((p, q) => p - q);
  return db(v[Math.floor(v.length * 0.1)]);
}

/** cut + gentle gate + fades. endLimit = absolute sample index the slice must not reach */
function cut(S, ev, { maxMs, endLimit }) {
  const s0 = refineStart(S.y, ev.f);
  let s1 = Math.min(s0 + ms(maxMs), endLimit ?? 1e12);
  const fl = floorDb(S, ev.f);
  // trim tail where the 1 ms envelope has fallen to within 6 dB of the local noise floor
  let lastLoud = s0;
  for (let i = s0; i < s1 - 48; i += 48) {
    let sum = 0; for (let j = i; j < i + 48; j++) sum += S.y[j] ** 2;
    if (db(Math.sqrt(sum / 48)) > fl + 6) lastLoud = i + 48;
  }
  s1 = Math.min(s1, lastLoud + ms(6));
  const out = Float32Array.from(S.y.subarray(s0, s1));
  // gentle downward expander (noise gate): frames < floor+12 dB get up to −12 dB, smoothed
  const fr = 48, n = Math.ceil(out.length / fr), g = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let sum = 0, c = 0; for (let j = k * fr; j < Math.min(out.length, (k + 1) * fr); j++) { sum += out[j] ** 2; c++; }
    const d = db(Math.sqrt(sum / c)) - fl; // dB above floor
    g[k] = Math.pow(10, (-12 * Math.min(1, Math.max(0, (12 - d) / 12))) / 20);
  }
  for (let k = 1; k < n; k++) if (g[k] < g[k - 1]) g[k] = g[k - 1] * 0.85 + g[k] * 0.15; // opens instantly, closes over ~6 ms
  for (let i = 0; i < out.length; i++) {
    const kf = i / fr - 0.5, k0 = Math.max(0, Math.floor(kf)), k1 = Math.min(n - 1, k0 + 1), a = Math.min(1, Math.max(0, kf - k0));
    out[i] *= g[k0] * (1 - a) + g[k1] * a;
  }
  // fades: 0.25 ms raised-cosine in, 8 ms raised-cosine out
  const fi = ms(0.25), fo = Math.min(ms(8), Math.floor(out.length / 3));
  for (let i = 0; i < fi; i++) out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fi);
  for (let i = 0; i < fo; i++) out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fo);
  // DC remove
  let m = 0; for (const v of out) m += v; m /= out.length; for (let i = 0; i < out.length; i++) out[i] -= m;
  return { data: out, src: SOURCES[S.key].id, srcStart: +(s0 / SR).toFixed(4), srcEnd: +(s1 / SR).toFixed(4), floorDb: +fl.toFixed(1), evPk: ev.pk };
}

/** ms until the 2 ms RMS envelope last exceeds slice peak − 30 dB */
function effLenMs(x, floorDb = -200) {
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  const thr = Math.max(pk * 0.0316, Math.pow(10, (floorDb + 10) / 20)); // −30 dB re peak, but ≥ 10 dB above noise floor
  let last = 0;
  for (let i = 0; i + 96 <= x.length; i += 48) { let s = 0; for (let j = i; j < i + 96; j++) s += x[j] ** 2; if (Math.sqrt(s / 96) > thr) last = i + 96; }
  return (last / SR) * 1000;
}
/** shorten to maxMs with an 8 ms raised-cosine fade (no-op if already shorter) */
function trimTo(x, maxMs) {
  if (x.length <= ms(maxMs)) return x;
  const y = x.slice(0, ms(maxMs)), fo = ms(8);
  for (let i = 0; i < fo; i++) y[y.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fo);
  return y;
}
const strongestAfter =(S, ev, lo, hi, minCent) =>
  S.ev.filter((o) => o.f - ev.f >= lo && o.f - ev.f <= hi && o.cent >= minCent).sort((a, b) => b.pk - a.pk)[0];
const nextStrongStart = (S, ev, minPk) => { const n = S.ev.find((o) => o.f > ev.f + 15 && o.pk >= minPk); return n ? n.f * 48 - ms(3) : undefined; };

// ───────────── CLACK: WhiteFox (Hako Violet tactile), isolated keys at the end of two clips ─────────────
function buildClack() {
  const roles = { down: [], up: [], spaceDown: [], spaceUp: [] };
  const pairs = [];
  for (const [key, from, to] of [['wf4', 94, 126.5], ['wf10', 108, 145]]) {
    const S = src(key);
    for (const ev of S.ev) {
      if (ev.t < from || ev.t > to || ev.prev < 250 || ev.pk < -24 || ev.cent < 500) continue;
      const up = strongestAfter(S, ev, 45, 260, 600);
      if (!up || up.pk < ev.pk - 30) continue;
      // anything else loud between press and release? -> skip (not a clean pair)
      const between = S.ev.filter((o) => o.f > ev.f + 15 && o.f < up.f && o.pk > up.pk - 3 && o.cent > 600);
      if (between.length) continue;
      if (up.next < 150) continue;
      const d = cut(S, ev, { maxMs: 220, endLimit: up.f * 48 - ms(4) });
      const u = cut(S, up, { maxMs: 140, endLimit: nextStrongStart(S, up, -40) });
      d.t = ev.t; u.t = up.t; d.pairUpDb = +(up.pk - ev.pk).toFixed(1);
      d.eff = effLenMs(d.data, d.floorDb); d.cent = centroidPow(d.data, 0, Math.min(2048, d.data.length));
      pairs.push({ d, u, pk: ev.pk });
    }
  }
  // No confirmed spacebar hits in these clips. Spacebar proxy = "best-matching heavier strokes":
  // loud + longest natural ring + lowest spectral centroid (z-score sum), with their own releases.
  const z = (k) => { const v = pairs.map((p) => p[k] ?? p.d[k]); const m = v.reduce((a, b) => a + b) / v.length; const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1; return (p) => ((p[k] ?? p.d[k]) - m) / sd; };
  const zp = z('pk'), ze = z('eff'), zc = z('cent');
  pairs.forEach((p) => (p.score = zp(p) + ze(p) - zc(p)));
  pairs.sort((a, b) => b.score - a.score);
  for (const p of pairs.slice(0, 4)) { roles.spaceDown.push(p.d); roles.spaceUp.push(p.u); }
  for (const p of pairs.slice(4).sort((a, b) => b.pk - a.pk)) {
    p.d.data = trimTo(p.d.data, 160); p.d.srcEnd = +(p.d.srcStart + p.d.data.length / SR).toFixed(4); roles.down.push(p.d); roles.up.push(p.u);
  }
  return roles;
}

// ───────────── PEBBLE: Rainy 75 (lubed linear, gasket, foam) continuous typing ─────────────
function buildPebble() {
  const S = src('rainy75');
  const roles = { down: [], up: [], spaceDown: [], spaceUp: [] };
  const downs = S.ev.filter((o) => o.pk >= -24 && o.prev >= 60 && o.next >= 75 && o.cent >= 150);
  const lfRatio = (o) => { // share of energy < 400 Hz in the first 40 ms ("thock" body)
    const i0 = refineStart(S.y, o.f), n = ms(40); let lo = 0, tot = 0, s1 = 0, a = Math.exp(-2 * Math.PI * 400 / SR);
    for (let i = i0; i < i0 + n; i++) { s1 = a * s1 + (1 - a) * S.y[i]; lo += s1 * s1; tot += S.y[i] ** 2; }
    return lo / tot;
  };
  for (const o of downs) o.lf = lfRatio(o);
  // heaviest strokes = spacebar class (proxy, see CREDITS): loud + most low-frequency body + room for a long tail
  const heavy = downs.filter((o) => o.next >= 100 && o.pk >= -22).sort((a, b) => b.lf * 2 + b.pk / 20 - (a.lf * 2 + a.pk / 20)).slice(0, 4);
  const used = new Set(heavy.map((o) => o.k));
  const normal = downs.filter((o) => !used.has(o.k)).sort((a, b) => b.pk - a.pk).slice(0, 12);
  for (const o of heavy) { const d = cut(S, o, { maxMs: 200, endLimit: nextStrongStart(S, o, -45) }); d.t = o.t; roles.spaceDown.push(d); }
  for (const o of normal) { const d = cut(S, o, { maxMs: 130, endLimit: nextStrongStart(S, o, -45) }); d.t = o.t; roles.down.push(d); }
  // Upstrokes (proxy): a weaker, isolated, non-rumble transient 50–220 ms after a strong press,
  // 8–25 dB below that press, with ≥ 50 ms of quiet before and ≥ 60 ms after.
  const strong = S.ev.filter((o) => o.pk >= -26);
  const ups = [];
  for (const p of strong) {
    const c = S.ev.find((o) => o.f - p.f >= 40 && o.f - p.f <= 250 && o.pk <= p.pk - 6 && o.pk >= p.pk - 28 && o.prev >= 35 && o.next >= 50 && o.cent >= 600);
    if (c && !ups.some((u) => u.k === c.k) && !used.has(c.k) && !normal.some((n) => n.k === c.k)) ups.push({ ...c, rel: c.pk - p.pk });
  }
  ups.sort((a, b) => b.pk - a.pk);
  for (const o of ups.slice(0, 3)) { const u = cut(S, o, { maxMs: 140, endLimit: nextStrongStart(S, o, -45) }); u.t = o.t; roles.spaceUp.push(u); }
  for (const o of ups.slice(3, 13)) { const u = cut(S, o, { maxMs: 100, endLimit: nextStrongStart(S, o, -45) }); u.t = o.t; roles.up.push(u); }
  return roles;
}

// ───────────── loudness + sprite ─────────────
const PEAK_CEIL = Math.pow(10, -1 / 20); // -1 dBFS
function loud(x) { // RMS over first 60 ms after a 150 Hz high-pass ("small speaker" weighting)
  const y = hp2(x, 150); const n = Math.min(y.length, ms(60)); let s = 0; for (let i = 0; i < n; i++) s += y[i] ** 2; return Math.sqrt(s / n);
}
const peakOf = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };

function finalize(roles, limits) {
  // QA gate: the slice's own peak must be its onset (≥10 % of peak within 1.5 ms of sample 0);
  // otherwise a later, stronger hit (another key) is inside the slice → drop the candidate.
  const okOnset = (x) => { const pk = peakOf(x); return x.findIndex((v) => Math.abs(v) >= 0.1 * pk) <= ms(1.5); };
  for (const r of Object.keys(roles)) {
    const bad = roles[r].filter((s) => !okOnset(s.data));
    if (bad.length) console.log(`  dropped ${bad.length} ${r} slice(s) failing the onset gate:`, bad.map((s) => s.srcStart).join(', '));
    roles[r] = roles[r].filter((s) => okOnset(s.data)).slice(0, limits[r]);
  }
  // role levels from the source (natural ratios), each slice matched to its role median
  const L = {}; for (const r of Object.keys(roles)) { roles[r].forEach((s) => (s.L = loud(s.data))); L[r] = median(roles[r].map((s) => s.L)); }
  // keep natural up/down ratio but guarantee up ≤ down − 4 dB (top-out is softer than bottom-out)
  const sd = Math.max(L.spaceDown / L.down, 1.12); // spacebar ≥ ~1 dB heavier than a normal press
  // releases keep their natural level relative to their own presses, capped ≥ 6 dB below the press
  const ratio = { down: 1, spaceDown: sd, up: Math.min(L.up / L.down, 0.5), spaceUp: sd * Math.min(L.spaceUp / L.spaceDown, 0.5) };
  for (const r of Object.keys(roles)) for (const s of roles[r]) {
    s.pk = peakOf(s.data);
    s.norm = PEAK_CEIL / s.pk;                     // sprite stores each slice peak-normalised to −1 dBFS
    s.want = ratio[r] / s.L;                       // linear gain wanted relative to an arbitrary reference
  }
  return roles;
}

function writeSprite(name, roles, scale, meta) {
  const GAP = ms(10);
  const parts = [], entries = {};
  let off = 0;
  for (const r of ['down', 'up', 'spaceDown', 'spaceUp']) {
    entries[r] = roles[r].map((s) => {
      const d = s.data.map((v) => v * s.norm);
      parts.push(d, new Float32Array(GAP));
      const e = {
        start: off, length: d.length,
        offset: +(off / SR).toFixed(6), duration: +(d.length / SR).toFixed(6),
        gain: +((s.want * scale) / s.norm).toFixed(4),
        src: s.src, srcStart: s.srcStart, srcEnd: s.srcEnd,
      };
      off += d.length + GAP;
      return e;
    });
  }
  const pcm = new Int16Array(off);
  let p = 0; for (const a of parts) { for (const v of a) pcm[p++] = Math.max(-32767, Math.min(32767, Math.round(v * 32767))); }
  const wav = Buffer.alloc(44 + pcm.length * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(SR, 24);
  wav.writeUInt32LE(SR * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length * 2, 40);
  Buffer.from(pcm.buffer).copy(wav, 44);
  fs.writeFileSync(path.join(OUT_DIR, `${name}.wav`), wav);
  const json = { version: 1, preset: name, file: `${name}.wav`, sampleRate: SR, channels: 1, bitDepth: 16, totalSamples: off, ...meta, entries };
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(json, null, 1) + '\n');
  return json;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const limits = { down: 10, up: 8, spaceDown: 4, spaceUp: 3 };
const presets = { pebble: finalize(buildPebble(), limits), clack: finalize(buildClack(), limits) };
// one global scale for both presets: largest final gain hits 1.0 (so playback peak ≤ −1 dBFS),
// and downs of both presets land on the same small-speaker loudness.
let maxG = 0; for (const p of Object.values(presets)) for (const r of Object.values(p)) for (const s of r) maxG = Math.max(maxG, s.want / s.norm);
const scale = 1 / maxG;
const SRC_INFO = {
  'freesound:815614': { title: 'Typing on a rainy 75', author: 'Techrul', url: 'https://freesound.org/people/Techrul/sounds/815614/', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', retrieved: '2026-11-09', file: 'https://cdn.freesound.org/previews/815/815614_15899953-hq.mp3' },
  'freesound:546045': { title: 'Keyboard Typing 4 (WhiteFox, Mechanical)', author: 'grcekh', url: 'https://freesound.org/people/grcekh/sounds/546045/', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', retrieved: '2026-11-09', file: 'https://cdn.freesound.org/previews/546/546045_12206738-hq.mp3' },
  'freesound:546167': { title: 'Keyboard Typing 10 (WhiteFox, Mechanical)', author: 'grcekh', url: 'https://freesound.org/people/grcekh/sounds/546167/', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', retrieved: '2026-11-09', file: 'https://cdn.freesound.org/previews/546/546167_12206738-hq.mp3' },
};
const META = {
  pebble: { source: 'Rainy 75 (gasket, lubed linear) — freesound:815614 by Techrul, CC0', notes: 'down = strongest well-separated presses; up/spaceUp = weaker transients 50–220 ms after a press (inferred top-outs); spaceDown = heaviest low-body presses (spacebar proxy, not confirmed by ear). See CREDITS.md.' },
  clack: { source: 'WhiteFox, Hako Violet tactile — freesound:546045 + 546167 by grcekh, CC0', notes: 'isolated press/release pairs from the "individual keys" tail; spaceDown/spaceUp = spacebar PROXY: the heaviest pairs (loud + longest ring + lowest centroid) with their own releases; not confirmed spacebar hits. See CREDITS.md.' },
};
for (const [name, roles] of Object.entries(presets)) {
  const used = [...new Set(Object.values(roles).flat().map((s) => s.src))];
  const j = writeSprite(name, roles, scale, { ...META[name], sources: Object.fromEntries(used.map((id) => [id, SRC_INFO[id]])), srcTimesAre: 'seconds into the decoded Freesound HQ preview (same timeline as the original upload)' });
  console.log(name, Object.fromEntries(Object.entries(j.entries).map(([r, a]) => [r, `${a.length} × ${(a.reduce((s, e) => s + e.duration, 0) / a.length * 1000).toFixed(0)}ms`])), 'samples', j.totalSamples);
  for (const [r, a] of Object.entries(roles)) for (const s of a) console.log('  ', r.padEnd(9), s.src, s.srcStart.toFixed(3), '-', s.srcEnd.toFixed(3), 'evPk', s.evPk.toFixed(1), 'floor', s.floorDb, s.pairUpDb !== undefined ? 'upRel ' + s.pairUpDb : '');
}
