// LOCAL DEVELOPMENT ONLY. Builds the three owner-chosen YouTube keyboard presets (몽돌 / 찌개 / 도자기) from audio files that YOU downloaded.
// The recordings' rights are unverified: output goes to the git-ignored local preset folder, is served only by the loopback dev server
// (MANZIZAK_LOCAL_AUDIO_DIR) and is never part of a build (check-dist).
//
//   Input  : $MANZIZAK_YT_AUDIO_DIR (default /private/tmp/manzizak-yt-audio) containing  mongdol.<ext>  jjigae.<ext>  dojagi.<ext>   (any ffmpeg-readable audio)
//   Output : $MANZIZAK_LOCAL_AUDIO_DIR (default /private/tmp/manzizak-local-presets)/<id>.{wav,json}
//   Usage  : FFMPEG=/path/to/ffmpeg node scripts/kbsamples/build-youtube-presets.mjs [--only=mongdol-pl87w]
// Keystrokes are detected from the waveform (strong, isolated transients) — nobody has listened to the result.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SR, db, env, onsets } from '../kbsamples/lib.mjs';

const IN = process.env.MANZIZAK_YT_AUDIO_DIR ?? '/private/tmp/manzizak-yt-audio';
const OUT = process.env.MANZIZAK_LOCAL_AUDIO_DIR ?? '/private/tmp/manzizak-local-presets';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const ms = (v) => Math.round((v * SR) / 1000);
/** window = [start, end] seconds of the downloaded file to use (a 1–2 h video: only a typing passage is needed) */
const PRESETS = [
  // dense typing (몽돌: an 8 s Short typed fast; 찌개: "FAST ASMR"): a clean strike stands ≥18 dB over the surrounding typing and decays ≥20 dB
  { id: 'mongdol-pl87w', file: 'mongdol', video: 'https://www.youtube.com/shorts/BgO3pE7VnI8', window: [0, 9], count: 14, isolation: 0.1, gate: { maxLeadDb: -18, decayDb: -20, maxSecondDb: -10 } },
  { id: 'jjigae-topre', file: 'jjigae', video: 'https://www.youtube.com/watch?v=TTfTCiwA38c', window: [30, 590], count: 16, gate: { maxLeadDb: -18, decayDb: -20, maxSecondDb: -10, minDecayMs: 8 } },
  // ceramic keycaps on a POM plate: a sharp clack that decays within ~10 ms is the real sound, not a glitch
  { id: 'dojagi-space65', file: 'dojagi', video: 'https://www.youtube.com/watch?v=Ry1DJ2xzg6Q&t=10s', window: [10, 130], count: 16, gate: { minDecayMs: 6, minLenMs: 40 } },
];
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

function decode(file, [a, b]) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(a), '-t', String(b - a), '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${file}: ${r.stderr}`);
  const buf = r.stdout;
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
}
const peakOf = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

fs.mkdirSync(OUT, { recursive: true });
let built = 0;
for (const P of PRESETS) {
  if (only && only !== P.id) continue;
  const f = fs.existsSync(IN) ? fs.readdirSync(IN).find((n) => n.startsWith(P.file + '.')) : undefined;
  if (!f) { console.log(`${P.id}: no ${P.file}.* in ${IN} — skipped`); continue; }
  const x = decode(path.join(IN, f), P.window);
  const strikes = onsets(x, { jumpDb: 10, minAbove: 14, minGapMs: 60 });
  // isolated keystrokes: nothing loud in the `isolation` before, room for the decay after
  const iso = P.isolation ?? 0.14;
  const cand = strikes
    .map((s, k) => ({ ...s, prev: k ? s.t - strikes[k - 1].t : 9, next: k + 1 < strikes.length ? strikes[k + 1].t - s.t : 9 }))
    .filter((s) => s.prev >= iso && s.next >= 0.08);
  const GATE = { minLenMs: 60, minDecayMs: 18, decayDb: -30, maxSecondDb: -12, maxLeadDb: -28, maxBoostDb: 20, ...(P.gate ?? {}) };
  const cut = (s) => {
    let pi = s.i, pv = 0;
    for (let i = Math.max(0, s.i - ms(4)); i < Math.min(x.length, s.i + ms(15)); i++) if (Math.abs(x[i]) > pv) { pv = Math.abs(x[i]); pi = i; }
    let a = pi; for (let i = Math.max(0, pi - ms(3)); i < pi; i++) if (Math.abs(x[i]) > 0.15 * pv) { a = i; break; }
    a = Math.max(0, a - ms(0.5));
    const cap = Math.min(x.length, a + ms(220), a + ms(s.next * 1000 - 8));
    // end: last 2 ms RMS frame above peak −40 dB
    const seg = x.subarray(a, cap), pk = peakOf(seg), thr = pk * 0.01, h = ms(2);
    let end = seg.length;
    for (let i = seg.length - h; i >= 0; i -= h) { let e = 0; for (let j = i; j < i + h; j++) e += seg[j] * seg[j]; if (Math.sqrt(e / h) > thr) { end = Math.min(seg.length, i + h + ms(4)); break; } }
    const raw = seg.subarray(0, Math.max(ms(40), end));
    // objective quality facts (nobody has listened): see GATE below
    const rms = (q) => { let e = 0; for (const v of q) e += v * v; return Math.sqrt(e / Math.max(1, q.length)); };
    const fr = []; for (let i = 0; i + h <= raw.length; i += h) fr.push(rms(raw.subarray(i, i + h)));
    const fpk = Math.max(...fr), fpi = fr.indexOf(fpk);
    const d30 = fr.findIndex((v, i) => i > fpi && v < fpk * Math.pow(10, GATE.decayDb / 20)); // decay to GATE.decayDb
    let second = -99; for (let i = fpi + 8; i < fr.length; i++) if (fr[i] > fr[i - 1] * 2.5) second = Math.max(second, db(fr[i] / fpk));
    const lead = db(rms(x.subarray(Math.max(0, a - ms(40)), Math.max(1, a - ms(2)))) / Math.max(fpk, 1e-9)); // background just before the strike
    return { s, a, raw, endDb: db(Math.min(...fr.slice(fpi)) / Math.max(fpk, 1e-9)), peakDb: db(pk), clippedSource: pk > 0.97, lenMs: (raw.length / SR) * 1000, decayMs: d30 > 0 ? (d30 - fpi) * 2 : null, second, lead, truncated: cap >= x.length - ms(5) };
  };
  const why = (c) =>
    c.clippedSource ? 'CLIPPED' : c.truncated ? 'TRUNCATED' : c.lenMs < GATE.minLenMs ? 'SHORT' : c.decayMs === null ? 'NO-DECAY' : c.decayMs < GATE.minDecayMs ? 'SPIKE' :
    c.second > GATE.maxSecondDb ? '2ND-HIT' : c.lead > GATE.maxLeadDb ? 'NOISY-LEAD' : -3 - c.peakDb > GATE.maxBoostDb ? 'BOOST' : null;
  const all = cand.map(cut), rej = {};
  if (process.env.KB_DEBUG) { const q = (k) => { const v = all.map(k).filter((n) => n !== null).sort((p, q) => p - q); return [0.1, 0.25, 0.5, 0.75, 0.9].map((f) => Math.round(v[Math.floor(f * (v.length - 1))] ?? NaN)); }; console.log(P.id, 'lead', q((c) => c.lead), 'decay', q((c) => c.decayMs), 'second', q((c) => c.second), 'len', q((c) => c.lenMs), 'peak', q((c) => c.peakDb), 'endLevel', q((c) => c.endDb)); }
  const passed = all.filter((c) => { const r = why(c); if (r) rej[r] = (rej[r] ?? 0) + 1; return !r; });
  // typical keystrokes, not the loudest outliers: rank by distance to the median peak of the passing strikes
  const medPk = [...passed].map((c) => c.peakDb).sort((p, q) => p - q)[passed.length >> 1] ?? 0;
  passed.sort((p, q) => Math.abs(p.peakDb - medPk) - Math.abs(q.peakDb - medPk));
  const picked = [];
  for (const c of passed) { if (picked.length >= P.count) break; if (!picked.some((o) => Math.abs(o.s.t - c.s.t) < 0.5)) picked.push(c); }
  picked.sort((p, q) => p.s.t - q.s.t);
  console.log(`${P.id}: ${cand.length} isolated strikes, ${passed.length} pass the gates (rejected ${JSON.stringify(rej)}), ${picked.length} used`);
  const clips = picked.map((c) => {
    const y = Float32Array.from(c.raw);
    const fo = Math.min(y.length >> 1, ms(8)), fi = ms(0.5);
    for (let i = 0; i < y.length; i++) { let w = 1; if (i < fi) w *= i / fi; if (i >= y.length - fo) w *= 0.5 + 0.5 * Math.cos((Math.PI * (i - (y.length - fo))) / fo); y[i] *= w; }
    const k = Math.pow(10, -3 / 20) / Math.max(peakOf(y), 1e-9);
    for (let i = 0; i < y.length; i++) y[i] *= k;
    return { y, tSrc: P.window[0] + c.a / SR, peakDb: c.peakDb, boostDb: db(k), qc: { lenMs: Math.round(c.lenMs), decayMs: c.decayMs, secondDb: Math.round(c.second * 10) / 10, leadDb: Math.round(c.lead * 10) / 10 } };
  });
  if (clips.length < 4) { console.log(`${P.id}: only ${clips.length} clean keystrokes found — skipped`); continue; }
  const GAP = ms(10);
  const total = clips.reduce((n, c) => n + c.y.length + GAP, 0);
  const sprite = new Float32Array(total);
  let pos = 0;
  const down = clips.map((c) => { sprite.set(c.y, pos); const e = { offset: Math.round((pos / SR) * 1e6) / 1e6, duration: Math.round((c.y.length / SR) * 1e6) / 1e6, gain: 1, src: `youtube:${P.video}@${c.tSrc.toFixed(2)}s`, sourceDetail: `peak ${c.peakDb.toFixed(1)} dB, boost +${c.boostDb.toFixed(1)} dB`, qc: c.qc }; pos += c.y.length + GAP; return e; });
  const wav = Buffer.alloc(44 + sprite.length * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + sprite.length * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(sprite.length * 2, 40);
  for (let i = 0; i < sprite.length; i++) wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sprite[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(path.join(OUT, `${P.id}.wav`), wav);
  fs.writeFileSync(path.join(OUT, `${P.id}.json`), JSON.stringify({ version: 1, preset: P.id, file: `${P.id}.wav`, sampleRate: SR, upMode: 'none', entries: { down, up: [], spaceDown: [], spaceUp: [] }, usage: 'LOCAL_DEVELOPMENT_ONLY_NOT_FOR_PUBLIC_DISTRIBUTION', rights: 'unverified', source: { video: P.video, file: f, windowSeconds: P.window }, processing: { gates: GATE, rejected: rej, note: 'Typical isolated keystrokes (closest to the median peak) that pass the objective gates, picked automatically from the waveform and not listened to. Key-down only; no release sound claimed; the key identity (which key was struck) is unknown.' } }, null, 2) + '\n');
  console.log(`${P.id}: ${clips.length} keystrokes from ${f} [${P.window[0]}–${P.window[1]} s] → ${path.join(OUT, P.id + '.wav')}`);
  built++;
}
if (!built) console.log('nothing built — put mongdol.* / jjigae.* / dojagi.* (your downloads) into ' + IN);
