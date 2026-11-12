// Objective quality audit of the shipped wax / crunch sprite clips (read-only). Prints one row per clip with flags.
// Flags only mean "objectively suspicious" (waveform facts). They do NOT replace listening.
//   BOOST   needed > 18 dB of amplification to reach −1 dBFS (noisy, low-level source passage)
//   CUTOFF  a fixed-length window ends while still loud (abrupt end), tail within 16 dB of its peak
//   SPARSE  more than 55 % of the clip is quieter than peak −40 dB (mostly silence/noise)
//   SPECTRUM centroid outside 0.45–2.2× of its pool median (different kind of sound than its siblings)
//   LENGTH  duration outside 0.5–2× of the pool median (singles only)
//   SOFTHEAD impact clip whose first 30 ms hold < 45 % of its energy (not a clean strike)
//   CLIPPED source passage reached −0.5 dBFS or more
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/sfx/fidgets');
const SR = 48000;
const db = (v) => 20 * Math.log10(Math.max(v, 1e-9));
const med = (a) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
export function auditSprite(kind) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, `${kind}.json`), 'utf8'));
  const b = fs.readFileSync(path.join(dir, `${kind}.wav`));
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const rows = [];
  for (const [name, p] of Object.entries(m.pools)) {
    const medC = med(p.entries.map((e) => e.centroidHz)), medD = med(p.entries.map((e) => e.duration));
    p.entries.forEach((e, i) => {
      const x = new Float32Array(e.length);
      for (let k = 0; k < e.length; k++) x[k] = (v.getInt16(44 + (e.start + k) * 2, true) / 32768) * e.gain;
      let pk = 0; for (const s of x) pk = Math.max(pk, Math.abs(s));
      const rms = (a, z) => { let s = 0; const n = Math.max(1, z - a); for (let k = a; k < z; k++) s += x[k] * x[k]; return Math.sqrt(s / n); };
      const f = [];
      const hop = Math.round(0.005 * SR); let quiet = 0, frames = 0;
      for (let k = 0; k + hop <= x.length; k += hop) { frames++; if (rms(k, k + hop) < pk * 0.01) quiet++; }
      const tail = db(rms(Math.max(0, x.length - Math.round(0.06 * SR)), Math.max(1, x.length - Math.round(0.012 * SR))) / pk);
      const head = (() => { const n = Math.round(0.03 * SR); let h = 0, t = 0; for (let k = 0; k < x.length; k++) { t += x[k] * x[k]; if (k < n) h += x[k] * x[k]; } return h / Math.max(t, 1e-12); })();
      if (e.boostDb > 18) f.push(`BOOST+${e.boostDb}`);
      const win = e.duration > 0.3; // fixed-length passages (hold / burst)
      if (win && tail > -16) f.push(`CUTOFF${tail.toFixed(0)}`);
      if (frames && quiet / frames > 0.55) f.push('SPARSE');
      if (e.centroidHz < 0.45 * medC || e.centroidHz > 2.2 * medC) f.push('SPECTRUM');
      if (!win && (e.duration < 0.5 * medD || e.duration > 2 * medD)) f.push('LENGTH');
      if (!win && head < 0.45 && e.duration > 0.12) f.push('SOFTHEAD');
      if (e.peakDbSource > -0.5) f.push('CLIPPED');
      rows.push({ kind, pool: name, i, src: e.src, srcStart: e.srcStart, dur: e.duration, centroid: e.centroidHz, boost: e.boostDb, tail: +tail.toFixed(1), head: +head.toFixed(2), flags: f });
    });
  }
  return rows;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = [...auditSprite('wax'), ...auditSprite('crunch')];
  for (const r of rows) console.log(`${r.kind}/${r.pool}#${r.i}`.padEnd(22), r.src.slice(-14).padEnd(14), `@${r.srcStart.toFixed(2)}`.padEnd(8), `${r.dur.toFixed(2)}s`.padEnd(7), `${r.centroid}Hz`.padEnd(8), `tail ${r.tail}`.padEnd(10), `head ${r.head}`.padEnd(10), r.flags.join(' ') || 'ok');
  const bad = rows.filter((r) => r.flags.length);
  console.log(`\n${rows.length} clips, ${bad.length} flagged`);
}
