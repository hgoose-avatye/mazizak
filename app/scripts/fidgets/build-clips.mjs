// Pre-extract short clips from the licensed source recordings of the fidget toys.
//
//   wax    : apple77771 wakppuball-simulator recordings (CC BY 4.0)   public/sfx/wax/*.mp3          → public/sfx/fidgets/wax.{wav,json}
//   crunch : Freesound CC0 recordings (see SOURCES below)             scripts/fidgets/source/crunch/ → public/sfx/fidgets/crunch.{wav,json}
//
// Usage: FFMPEG=/path/to/ffmpeg node scripts/fidgets/build-clips.mjs     (re-runnable; output is deterministic)
//
// Clips are picked automatically from the waveform (strike detection on a 1 ms envelope). Nobody has listened to them:
// the JSON records the objective facts (source, times, peak, centroid) and `materialMatch`, never "verified timbre".
// Raw recordings and derived variants are counted separately: this script only EXTRACTS (variants = 0). Runtime
// speed/pitch jitter is applied by the player and is not counted as a recording.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, SR, db, env, onsets, peakOf, rmsOf } from './lib.mjs';
import { centroid } from '../kbsamples/lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/sfx/fidgets');
const ms = (v) => Math.round((v * SR) / 1000);
const GAP = ms(10);
const PEAK = Math.pow(10, -1 / 20);

const WAX_LICENSE = { license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', author: 'apple77771', url: 'https://github.com/apple77771/wakppuball-simulator', retrieved: '2026-11-11', usage: 'fidget W01/W02 wax crack + knead' };
const FS_MANIFEST = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'freesound-sources.json'), 'utf8')).sources;
const CACHE = path.join(ROOT, 'bench-out/fidget-src');
/** a Freesound CC0 preview, downloaded into the git-ignored cache when missing and verified against the manifest sha256 */
function fsSource(id, usage, materialMatch) {
  const m = FS_MANIFEST[`freesound:${id}`];
  if (!m) throw new Error(`freesound:${id} not in freesound-sources.json`);
  const file = path.join(CACHE, `fs_${id}.mp3`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(CACHE, { recursive: true });
    const r = spawnSync('curl', ['-s', '-m', '120', '-A', 'Mozilla/5.0', '-o', file, m.preview]);
    if (r.status !== 0) throw new Error(`download failed: ${m.preview}`);
  }
  const sha = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (sha !== m.sha256) throw new Error(`freesound:${id}: sha256 mismatch (${sha})`);
  return { id: `freesound:${id}`, file, title: m.title, author: m.author, url: m.page, license: m.license, licenseUrl: m.licenseUrl, retrieved: m.retrieved, usage, materialMatch };
}
const WAX_SOURCES = ['apple_crack_1', 'apple_crack_2', 'apple_knead_1', 'apple_knead_2', 'choco_crack_1', 'choco_crack_2', 'choco_knead_1', 'choco_knead_2'].map((n) => ({ id: `wax:${n}`, file: path.join(ROOT, `public/sfx/wax/${n}.mp3`), title: n, ...WAX_LICENSE, materialMatch: 'recording of the simulated wax ball (maintainer\u2019s claim)' }));
const ANALYSED = {};
const SIMILAR = 'similar material only (not a recording of the toy)';
function an(id, usage, match = SIMILAR) { return (ANALYSED[id] ??= analyse(fsSource(id, usage, match))); }

// ───────── analysis ─────────
function analyse(src) {
  const x = decode(src.file);
  const e = env(x, 48);
  const sorted = [...e].sort((a, b) => a - b);
  const floor = db(sorted[Math.floor(sorted.length * 0.1)]);
  const strikes = onsets(x, { jumpDb: 9, minAbove: 14, minGapMs: 45 }).map((o) => {
    // sample-accurate start: earliest sample within 3 ms before the main peak (searched 15 ms after the onset) above 15 % of it
    let pi = o.i, pv = 0;
    for (let i = Math.max(0, o.i - ms(4)); i < Math.min(x.length, o.i + ms(15)); i++) if (Math.abs(x[i]) > pv) { pv = Math.abs(x[i]); pi = i; }
    let s = pi;
    for (let i = Math.max(0, pi - ms(3)); i < pi; i++) if (Math.abs(x[i]) > 0.15 * pv) { s = i; break; }
    return { t: o.t, start: Math.max(0, s - ms(0.5)), peakDb: o.peakDb };
  });
  strikes.forEach((s, k) => { s.prev = k ? s.start - strikes[k - 1].start : 1e9; s.next = k + 1 < strikes.length ? strikes[k + 1].start - s.start : 1e9; });
  return { src, x, strikes, floor, maxPeakDb: Math.max(...strikes.map((s) => s.peakDb), -120) };
}

/** end of a decaying hit: last 2 ms RMS frame above clip peak −38 dB, capped */
function tailEnd(x, a, maxEnd) {
  const seg = x.subarray(a, maxEnd);
  const pk = peakOf(seg), thr = pk * Math.pow(10, -38 / 20), h = ms(2);
  for (let i = seg.length - h; i >= 0; i -= h) if (rmsOf(seg.subarray(i, i + h)) > thr) return a + Math.min(seg.length, i + h + ms(4));
  return a + ms(30);
}
const crest = (c) => peakOf(c) / Math.max(rmsOf(c), 1e-9);
function clipOf(an, a, b, extra = {}) {
  const raw = an.x.slice(a, b);
  const pk = peakOf(raw), hop = ms(5);
  let quiet = 0, frames = 0;
  for (let i = 0; i + hop <= raw.length; i += hop) { frames++; if (rmsOf(raw.subarray(i, i + hop)) < pk * 0.01) quiet++; }
  let head = 0, tot = 0;
  for (let i = 0; i < raw.length; i++) { tot += raw[i] * raw[i]; if (i < ms(30)) head += raw[i] * raw[i]; }
  const tail = db(rmsOf(raw.subarray(Math.max(0, raw.length - ms(60)), Math.max(1, raw.length - ms(12)))) / Math.max(pk, 1e-9));
  const startDb = db(rmsOf(raw.subarray(0, Math.min(raw.length, ms(15)))) / Math.max(pk, 1e-9));
  return { src: an.src, a, b, raw, peakDb: db(pk), centroid: centroid(raw, 0, Math.min(2048, raw.length >> 1 << 1)), strikes: an.strikes.filter((s) => s.start >= a && s.start < b).length, crest: crest(raw), sparse: frames ? quiet / frames : 0, headShare: head / Math.max(tot, 1e-12), tailDb: tail, startDb, ...extra };
}
const overlaps = (list, c, pad = ms(20)) => list.some((o) => o.src === c.src && c.a < o.b + pad && c.b > o.a - pad);

// ───────── candidate generators ─────────
/** one isolated hit: from its start to the decay end, ending before the next strike */
function singles(an, { minLen = 60, maxLen = 240, isolation = 0, cap = 250 } = {}) {
  const out = [];
  // long recordings: only the strongest `cap` strikes are considered
  const floor = [...an.strikes].map((s) => s.peakDb).sort((p, q) => q - p)[Math.min(cap, an.strikes.length) - 1] ?? -200;
  for (const s of an.strikes) {
    if (s.peakDb < floor) continue;
    if (s.prev < isolation) continue;
    const cap = Math.min(an.x.length, s.start + ms(maxLen), s.start + s.next - ms(6));
    if (cap - s.start < ms(minLen)) continue;
    const end = Math.max(s.start + ms(minLen), tailEnd(an.x, s.start, cap));
    out.push(clipOf(an, s.start, Math.min(end, cap), { strikePeakDb: s.peakDb }));
  }
  return out;
}
/** fixed-length window starting at a strike */
function windows(an, lenMs, { minStrikes = 3, cap = 220 } = {}) {
  const out = [];
  const stride = Math.max(1, Math.ceil(an.strikes.length / cap)); // long recordings: sample the strikes evenly
  for (const [k, s] of an.strikes.entries()) {
    if (k % stride) continue;
    const nominal = s.start + ms(lenMs);
    if (nominal + ms(80) > an.x.length) continue;
    // end the window at the quietest 5 ms point near its nominal end instead of cutting through a loud passage
    let b = nominal, bv = Infinity;
    for (let e = nominal - ms(100); e <= nominal + ms(80); e += ms(2)) { const v = rmsOf(an.x.subarray(e - ms(5), e)); if (v < bv) { bv = v; b = e; } }
    if (b - s.start < ms(300)) continue;
    const c = clipOf(an, s.start, b, { strikePeakDb: s.peakDb, window: true });
    if (c.strikes >= minStrikes) out.push(c);
  }
  return out;
}
/** pick `n` clips by descending score, no overlap within a source, spread over time */
const MAX_BOOST_DB = 24;
function pick(cands, n, score, { diverse = false } = {}) {
  cands = cands.filter((c) => c.peakDb >= -1 - MAX_BOOST_DB); // never amplify a clip by more than 24 dB to reach −1 dBFS
  const byScore = (p, q) => score(q) - score(p) || p.a - q.a;
  const chosen = [];
  if (diverse) {
    // round-robin over the source files so one recording cannot dominate a pool
    const groups = [...new Set(cands.map((c) => c.src.id))].sort().map((id) => cands.filter((c) => c.src.id === id).sort(byScore));
    for (let round = 0; chosen.length < n && groups.some((g) => g.length); round++)
      for (const g of groups) {
        while (g.length && overlaps(chosen, g[0])) g.shift();
        if (g.length && chosen.length < n) chosen.push(g.shift());
      }
  } else for (const c of [...cands].sort(byScore)) { if (chosen.length >= n) break; if (!overlaps(chosen, c)) chosen.push(c); }
  return chosen.sort((p, q) => p.src.id.localeCompare(q.src.id) || p.a - q.a);
}


// ───────── quality gates (objective only — nobody has listened) ─────────
const GATE = { minStartDb: -38, maxBoostDb: 18, maxSource: -0.5, maxSparse: 0.55, maxTailDb: -16, minHeadShare: 0.45, centroid: [0.45, 2.2], length: [0.5, 2] };
const audit = {}; // pool → { candidates, rejected: { reason: count } }
const EXCL_SRC = (() => { try { return (JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'exclusions.json'), 'utf8')).excludeSources ?? []).map((e) => e.src); } catch { return []; } })();
const EXCL = (() => { try { return JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'exclusions.json'), 'utf8')).exclude ?? []; } catch { return []; } })();
const KEEP = (() => { try { const k = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'exclusions.json'), 'utf8')).keepPools ?? {}; delete k._doc; return k; } catch { return {}; } })();
const med = (a) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
function qc(pool, list) {
  const rej = {};
  const why = (c) => {
    if (c.peakDb < -1 - GATE.maxBoostDb) return 'BOOST>18dB';
    if (c.peakDb > GATE.maxSource) return 'CLIPPED-SOURCE';
    if (c.startDb < GATE.minStartDb) return 'SLOW-START'; // the sound would begin late after the touch
    if (c.sparse > GATE.maxSparse) return 'SPARSE';
    if (c.window && c.tailDb > GATE.maxTailDb) return 'CUTOFF';
    if (!c.window && c.headShare < GATE.minHeadShare && c.b - c.a > ms(120)) return 'SOFTHEAD';
    if (EXCL_SRC.includes(c.src.id)) return 'LISTENER-SOURCE';
    if (EXCL.some((e) => e.src === c.src.id && Math.abs(e.srcStart - c.a / SR) <= (e.tol ?? 0.03))) return 'LISTENER-EXCLUDED';
    return null;
  };
  let kept = list.filter((c) => { const r = why(c); if (r) rej[r] = (rej[r] ?? 0) + 1; return !r; });
  if (kept.length >= 3) {
    const mc = med(kept.map((c) => c.centroid)), md = med(kept.map((c) => c.b - c.a));
    kept = kept.filter((c) => {
      let r = null;
      if (c.centroid < GATE.centroid[0] * mc || c.centroid > GATE.centroid[1] * mc) r = 'SPECTRUM-OUTLIER';
      else if (!c.window && ((c.b - c.a) < GATE.length[0] * md || (c.b - c.a) > GATE.length[1] * md)) r = 'LENGTH-OUTLIER';
      if (r) rej[r] = (rej[r] ?? 0) + 1;
      return !r;
    });
  }
  if (kept.length === 2 && Math.max(kept[0].centroid, kept[1].centroid) / Math.min(kept[0].centroid, kept[1].centroid) > GATE.centroid[1]) {
    rej['SPECTRUM-OUTLIER'] = (rej['SPECTRUM-OUTLIER'] ?? 0) + 2; // two clips that sound like different things cannot form a pool
    kept = [];
  }
  audit[pool] = { candidates: list.length, passed: kept.length, rejected: rej };
  return kept;
}
// a pool needs enough independent clips to avoid an audible loop; otherwise the event is dropped (the player then falls back or stays silent)
const MIN_CLIPS = { init: 2, crack: 3, crunch: 3, tap: 3, hold: 3, stretch: 3, fold: 3 };
const dropped = [];

// ───────── pools ─────────
const pools = {};
function addPool(name, event, material, clips, note) {
  if (clips.length < MIN_CLIPS[event]) { dropped.push({ pool: name, event, kept: clips.length, minimum: MIN_CLIPS[event], reason: 'too few clips passed the quality gates' }); return; }
  pools[name] = { event, material, note, clips };
}

const wax = WAX_SOURCES.map(analyse);
// W02 additionally uses real chocolate-bar snapping / crumbling (Freesound CC0) next to the simulator's chocolate-shell recordings
const CHOC = (id, usage) => an(id, usage, 'real chocolate (bar) — similar to a chocolate wax shell, not the toy');
const chocSnaps = [CHOC('660866', 'W02 chocolate snap/crumble'), CHOC('851574', 'W02 chocolate snap')];
for (const kind of ['apple', 'choco']) {
  const crackFiles = [...wax.filter((a) => a.src.title.startsWith(`${kind}_crack`)), ...(kind === 'choco' ? chocSnaps : [])], kneadFiles = wax.filter((a) => a.src.title.startsWith(`${kind}_knead`));
  const hits = qc(`${kind}.init`, crackFiles.flatMap((a) => singles(a, { minLen: 70, maxLen: 260, isolation: 140 }).filter((c) => c.strikePeakDb >= a.maxPeakDb - 10)));
  const init = pick(hits, 4, (c) => c.strikePeakDb, { diverse: true });
  const crack = pick(qc(`${kind}.crack`, crackFiles.flatMap((a) => singles(a, { minLen: 60, maxLen: 200 }).filter((c) => c.strikePeakDb >= a.maxPeakDb - 22 && c.strikePeakDb <= a.maxPeakDb - 2))).filter((c) => !init.some((i) => i.src === c.src && Math.abs(i.a - c.a) < ms(300))), 7, (c) => c.strikePeakDb - Math.abs(c.peakDb + 20) * 0.1, { diverse: true });
  const burst = pick(qc(`${kind}.burst`, crackFiles.flatMap((a) => windows(a, 420, { minStrikes: 4 }).filter((c) => c.peakDb >= -20))), 4, (c) => c.strikes, { diverse: true });
  const knead = pick(qc(`${kind}.knead`, kneadFiles.flatMap((a) => windows(a, 560, { minStrikes: 3 }))), 6, (c) => c.strikes - c.crest * 0.15);
  addPool(`${kind}.init`, 'init', 'wax', init, 'strongest isolated first-break hits');
  addPool(`${kind}.crack`, 'crack', 'wax', crack, 'single crack hits');
  addPool(`${kind}.burst`, 'crack', 'wax', burst, 'dense runs of ≥4 strikes (continuous breaking)');
  addPool(`${kind}.knead`, 'hold', 'wax', knead, 'crackle runs of the knead recordings');
}

// generic pool: strikes → singles (tap/crunch/fold hits) or windows (hold/stretch/fold passages)
const OWN_DIR = path.join(ROOT, 'scripts/fidgets/own');
/** the project owner's own recordings: scripts/fidgets/own/<pool>/*.wav|mp3|m4a — when present they REPLACE the stand-in sources of that pool */
function ownSources(pool, usage) {
  const d = path.join(OWN_DIR, pool);
  if (!fs.existsSync(d)) return [];
  // provenance comes from scripts/fidgets/own/sources.json (what the owner stated); no licence is assumed beyond "own recording"
  const meta = (() => { try { return JSON.parse(fs.readFileSync(path.join(OWN_DIR, 'sources.json'), 'utf8')); } catch { return {}; } })();
  return fs.readdirSync(d).filter((f) => /\.(wav|mp3|m4a|flac|aiff?)$/i.test(f)).sort().map((f) => {
    const m = meta[`${pool}/${f}`];
    if (!m) throw new Error(`own recording ${pool}/${f} has no entry in scripts/fidgets/own/sources.json`);
    return ANALYSED[`own:${pool}/${f}`] ??= analyse({ id: `own:${pool}/${f}`, file: path.join(d, f), title: m.title, author: 'project owner', url: 'own recording', license: 'Own recording (project owner)', licenseUrl: '', retrieved: m.added, usage, materialMatch: m.material });
  });
}
function gpool(name, event, material, note, srcIds, usage, { kind, n, len = [50, 200], lenMs = 600, minStrikes = 3, relFloor = 14, scoreFn } = {}) {
  const own = ownSources(name, usage);
  const srcs = own.length ? own : srcIds.map((id) => an(id, usage));
  const cands = srcs.flatMap((a) => kind === 'singles' ? singles(a, { minLen: len[0], maxLen: len[1] }).filter((c) => c.strikePeakDb >= a.maxPeakDb - relFloor) : windows(a, lenMs, { minStrikes }));
  const score = scoreFn ?? (kind === 'singles' ? (c) => c.strikePeakDb : (c) => c.strikes - c.crest * 0.3);
  const passed = qc(name, cands);
  // a pool the listener kept as is (exclusions.json keepPools): exactly those clips, no unheard replacements
  const keep = KEEP[name];
  const chosen = keep ? keep.map((k) => passed.find((c) => c.src.id === k.src && Math.abs(c.a / SR - k.srcStart) <= 0.005)).filter(Boolean) : pick(passed, n, score, { diverse: true });
  if (keep && chosen.length !== keep.length) throw new Error(`${name}: ${keep.length - chosen.length} kept clip(s) no longer pass the gates`);
  addPool(name, event, own.length ? 'own recording of the actual toy' : material, chosen, note);
}
// ── crunch bank: C01 soap crunch (dry crumbly foam), C02 sugar beads (small hard granules)
const SOAP = ['560167', '868249', '774262', '389657'];
gpool('soap.crunch', 'crunch', 'dry floral foam + styrofoam', 'short dry crushing hits', SOAP, 'C01 crunch', { kind: 'singles', n: 8, len: [45, 190], relFloor: 20 }); // 20 dB: the own recording (rec28) has a few very loud hits, so medium-strength crushes are admitted too
gpool('soap.hold', 'hold', 'dry floral foam + styrofoam', 'dense continuous crumbling windows', SOAP, 'C01 hold', { kind: 'windows', n: 6, lenMs: 640, minStrikes: 5 });
const BEADS = ['399002', '399006', '829549', '788735', '435367', '634162', '542695'];
gpool('beads.crunch', 'crunch', 'glass beads, sprinkles, pop-rocks, rock candy', 'short bead / granule collisions', BEADS, 'C02 crunch', { kind: 'singles', n: 9, len: [30, 150] });
gpool('beads.hold', 'hold', 'glass beads, sprinkles, pop-rocks, rock candy', 'continuous granule rattle / crackle windows', BEADS, 'C02 hold', { kind: 'windows', n: 6, lenMs: 640, minStrikes: 4 });
// ── squish bank (S01–S03 elastic, L01–L03 viscous)
const TPR = ['168011', '344643', '622335'];
gpool('tpr.tap', 'tap', 'stress balls / squeeze toy', 'short squeezes', TPR, 'S01 tap', { kind: 'singles', n: 6, len: [60, 240] });
gpool('tpr.hold', 'hold', 'stress balls / squeeze toy', 'sustained squeezing', TPR, 'S01 hold', { kind: 'windows', n: 5, lenMs: 520, minStrikes: 2 });
const FOAM = ['390315', '390314', '594753'];
gpool('foam.tap', 'tap', 'memory foam / sponge', 'short presses', FOAM, 'S02 tap', { kind: 'singles', n: 5, len: [80, 260] });
gpool('foam.hold', 'hold', 'memory foam / sponge', 'long slow presses', FOAM, 'S02 hold', { kind: 'windows', n: 5, lenMs: 800, minStrikes: 2 });
// (the first dough sources 241813 / 612769 were rejected by the listener on 2026-11-12; these replace them)
const MOCHI = ['172489', '323769', '403915', '837964'];
// a soft press is a short squish, not a click: ~0.34 s windows (dense dough recordings cut single hits at 60 ms)
gpool('mochi.tap', 'tap', 'soft dough', 'short dough presses (~0.34 s)', MOCHI, 'S03 tap', { kind: 'windows', n: 5, lenMs: 340, minStrikes: 1 });
gpool('mochi.hold', 'hold', 'soft dough', 'kneading / rolling windows', MOCHI, 'S03 hold', { kind: 'windows', n: 5, lenMs: 640, minStrikes: 3 });
const SLIME = ['794270', '680447', '655814'];
gpool('slime.hold', 'hold', 'slime', 'squishing windows', SLIME, 'L01 hold', { kind: 'windows', n: 6, lenMs: 600, minStrikes: 3 });
gpool('slime.stretch', 'stretch', 'slime', 'slime stretching passages', ['794270'], 'L01 stretch', { kind: 'windows', n: 5, lenMs: 900, minStrikes: 2 });
gpool('slime.fold', 'fold', 'slime', 'slime slaps / folds', ['794272', '824934'], 'L01 fold', { kind: 'singles', n: 6, len: [80, 280] });
const GEL = ['559768', '655814', '824934'];
gpool('gel.hold', 'hold', 'jelly / gooey gel', 'wet gel squishing windows', GEL, 'L02 hold', { kind: 'windows', n: 6, lenMs: 600, minStrikes: 3 });
gpool('gel.fold', 'fold', 'jelly / gooey gel', 'short wet gel squelches', GEL, 'L02 fold', { kind: 'singles', n: 6, len: [80, 280] });
// L02 mango slime: modelled on the reference app's rainbow-sharbet clips (bright continuous fine crackle, ~4.4 kHz,
// short 0.5–0.86 s / long 1.1–1.4 s) — crunchy-slime and fizzing-foam recordings with the same brightness and continuity
const MANGO = ['759401', '759402', '707236'];
gpool('mango.tap', 'tap', 'crunchy slime / fizzing foam', 'short crackly slime presses (~0.7 s)', MANGO, 'L02 tap', { kind: 'windows', n: 6, lenMs: 700, minStrikes: 2 });
gpool('mango.hold', 'hold', 'crunchy slime / fizzing foam', 'crackly slime kneading passages (~1.2 s)', MANGO, 'L02 hold', { kind: 'windows', n: 6, lenMs: 1200, minStrikes: 3 });
const CREAM = ['578460', '578463', '197761', '849247'];
gpool('cream.hold', 'hold', 'shaving foam / cream', 'foam squashing windows', CREAM, 'L03 hold', { kind: 'windows', n: 5, lenMs: 600, minStrikes: 2 });
gpool('cream.fold', 'fold', 'shaving foam / cream', 'foam folding windows', CREAM, 'L03 fold', { kind: 'windows', n: 5, lenMs: 480, minStrikes: 2 });

// ───────── write sprites ─────────
const CLASS = { init: 'impact', crack: 'impact', crunch: 'impact', tap: 'impact', hold: 'continuous', stretch: 'continuous', fold: 'continuous' };
/** impact clips: max 20 ms RMS after a 150 Hz one-pole high-pass (same idea as sfx.ts loudness()); continuous clips: whole-clip RMS */
function level(y, cls) {
  if (cls === 'continuous') return rmsOf(y);
  const a = Math.exp((-2 * Math.PI * 150) / SR); let px = 0, py = 0; const h = new Float32Array(y.length);
  for (let i = 0; i < y.length; i++) { py = a * (py + y[i] - px); px = y[i]; h[i] = py; }
  const n = ms(20); let m = 0;
  for (let i = 0; i + n <= h.length || i === 0; i += ms(5)) { let e = 0; const k = Math.min(n, h.length - i); for (let j = i; j < i + k; j++) e += h[j] * h[j]; m = Math.max(m, e / Math.max(1, k)); if (i + n > h.length) break; }
  return Math.sqrt(m);
}
function build(file, allNames, srcList) {
  const groupNames = allNames.filter((n) => pools[n]);
  // fade + peak-normalise each clip to −1 dBFS
  const prepared = {};
  for (const name of groupNames) prepared[name] = pools[name].clips.map((c) => {
    const y = Float32Array.from(c.raw);
    const fo = Math.min(y.length >> 1, ms(10)), fi = ms(0.5);
    for (let i = 0; i < y.length; i++) { let w = 1; if (i < fi) w *= i / fi; if (i >= y.length - fo) w *= 0.5 + 0.5 * Math.cos((Math.PI * (i - (y.length - fo))) / fo); y[i] *= w; }
    const k = PEAK / Math.max(peakOf(y), 1e-9);
    for (let i = 0; i < y.length; i++) y[i] *= k;
    return { ...c, y, boostDb: db(k) };
  });
  // within-pool loudness match: attenuate louder clips down to the quietest (RMS), gain ≤ 1
  for (const name of groupNames) { const rs = prepared[name].map((c) => level(c.y, CLASS[pools[name].event])); const t = Math.min(...rs); prepared[name].forEach((c, i) => { c.gain = Math.round((t / rs[i]) * 1e4) / 1e4; c.poolRmsDb = db(t); }); }
  const total = groupNames.reduce((n, g) => n + prepared[g].reduce((m, c) => m + c.y.length + GAP, 0), 0) - GAP;
  const sprite = new Float32Array(total);
  let pos = 0;
  const outPools = {};
  for (const name of groupNames) {
    outPools[name] = {
      event: pools[name].event,
      loudnessClass: CLASS[pools[name].event],
      material: pools[name].material,
      note: pools[name].note,
      recordings: prepared[name].length, // distinct extracted source passages
      variants: 0,
      entries: prepared[name].map((c) => {
        sprite.set(c.y, pos);
        const e = { start: pos, length: c.y.length, offset: Math.round((pos / SR) * 1e6) / 1e6, duration: Math.round((c.y.length / SR) * 1e6) / 1e6, gain: c.gain, src: c.src.id, srcStart: Math.round((c.a / SR) * 1e4) / 1e4, srcEnd: Math.round((c.b / SR) * 1e4) / 1e4, peakDbSource: Math.round(c.peakDb * 10) / 10, centroidHz: Math.round(c.centroid), strikes: c.strikes, boostDb: Math.round(c.boostDb * 10) / 10 };
        pos += c.y.length + GAP;
        return e;
      }),
    };
  }
  const wav = Buffer.alloc(44 + sprite.length * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + sprite.length * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(sprite.length * 2, 40);
  for (let i = 0; i < sprite.length; i++) wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sprite[i] * 32767))), 44 + i * 2);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${file}.wav`), wav);
  const used = new Set(Object.values(outPools).flatMap((p) => p.entries.map((e) => e.src)));
  const sources = Object.fromEntries(srcList.filter((s) => used.has(s.id)).map((s) => [s.id, { title: s.title, author: s.author, url: s.url, license: s.license, licenseUrl: s.licenseUrl, retrieved: s.retrieved, usage: s.usage, materialMatch: s.materialMatch, originalFile: path.relative(ROOT, s.file) }]));
  const recordings = Object.values(outPools).reduce((n, p) => n + p.recordings, 0);
  const map = {
    version: 1, file: `${file}.wav`, sampleRate: SR, channels: 1, bitDepth: 16, totalSamples: sprite.length,
    note: 'Clips were picked automatically from the waveform and have NOT been listened to. `recordings` = distinct passages extracted from the source files; `variants` = derived copies (none here — runtime speed/pitch jitter is not counted). Sprite clips are peak-normalised to −1 dBFS; `gain` (≤1) equalises RMS within a pool; relative loudness between event classes is set by the player.',
    counts: { sourceFiles: Object.keys(sources).length, extractedClips: recordings, derivedVariants: 0 },
    qualityGates: { ...GATE, minClips: MIN_CLIPS, listenerExclusions: EXCL.length },
    audit: Object.fromEntries(Object.entries(audit).filter(([n]) => allNames.includes(n))),
    dropped: dropped.filter((d) => allNames.includes(d.pool)),
    sources, pools: outPools,
  };
  fs.writeFileSync(path.join(OUT, `${file}.json`), JSON.stringify(map, null, 1) + '\n');
  console.log(`\n${file}: ${sprite.length} samples (${(sprite.length / SR).toFixed(2)} s), ${wav.length} bytes, ${recordings} clips from ${Object.keys(sources).length} source files`);
  for (const d of dropped.filter((d) => allNames.includes(d.pool))) console.log(`  DROPPED ${d.pool}: only ${d.kept} clip(s) passed the gates (min ${d.minimum})`);
  for (const [n, p] of Object.entries(outPools)) console.log(`  ${n.padEnd(14)} ${p.event.padEnd(6)} src=${[...new Set(p.entries.map((e) => e.src.replace('freesound:', 'fs').replace('wax:', '')))].join(',')} n=${String(p.entries.length).padStart(2)} dur ${Math.min(...p.entries.map((e) => e.duration)).toFixed(2)}–${Math.max(...p.entries.map((e) => e.duration)).toFixed(2)}s centroid ${Math.round(p.entries.reduce((s, e) => s + e.centroidHz, 0) / p.entries.length)}Hz  gain ${Math.min(...p.entries.map((e) => e.gain)).toFixed(2)}–1  max boost +${Math.max(...p.entries.map((e) => e.boostDb)).toFixed(1)}dB`);
}
const usedFs = Object.values(ANALYSED).map((a) => a.src);
build('wax', ['apple.init', 'apple.crack', 'apple.burst', 'apple.knead', 'choco.init', 'choco.crack', 'choco.burst', 'choco.knead'], [...WAX_SOURCES, ...usedFs]);
build('crunch', ['soap.crunch', 'soap.hold', 'beads.crunch', 'beads.hold'], usedFs);
build('squish', ['tpr.tap', 'tpr.hold', 'foam.tap', 'foam.hold', 'mochi.tap', 'mochi.hold', 'slime.hold', 'slime.stretch', 'slime.fold', 'gel.hold', 'gel.fold', 'mango.tap', 'mango.hold', 'cream.hold', 'cream.fold'], usedFs);

// ───────── credits (generated, so they cannot drift from the sprite metadata) ─────────
{
  const rd = (n) => JSON.parse(fs.readFileSync(path.join(OUT, `${n}.json`), 'utf8'));
  const w = rd('wax'), c = rd('crunch'), q = rd('squish');
  const ownIds = [w, c, q].flatMap((o) => Object.keys(o.sources).filter((id) => id.startsWith('own:')));
  const soapOwn = ownIds.some((id) => id.startsWith('own:soap.'));
  const ownNote = ownIds.length ? `Recordings of the actual toy: the \`own:\` rows (project owner's recordings); the wax-simulator ones possibly. Everything else is a similar material, not the toy.` : 'None is a recording of the actual toy except possibly the wax-simulator ones.';
  const row = (id, s) => `| ${id} | ${s.title} | ${s.author} | ${s.url} | ${s.license} | ${s.retrieved} | ${s.usage} | ${s.materialMatch} |`;
  const head = '| id | title | author | url | licence | retrieved | used for | material |\n|---|---|---|---|---|---|---|---|';
  const tbl = (o, filt = () => true) => Object.entries(o.sources).filter(([id, s]) => filt(id, s)).map(([id, s]) => row(id, s)).join('\n');
  const t = `# Fidget sound credits (wax, crunch, squish clips)

Generated by \`scripts/fidgets/build-clips.mjs\` — do not edit by hand. Pools, clip times, gates and counts are in \`wax.json\` / \`crunch.json\` / \`squish.json\`.
All clips were picked automatically from the waveforms and **have not been listened to**. ${ownNote}

## Wax (W01 청사과, W02 초콜릿)

**apple77771 (CC BY 4.0, attribution required)** — WAK-PPU-BALL sound effects by apple77771, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
Source: https://github.com/apple77771/wakppuball-simulator, pinned commit 6882bebcc312b3be3b871b0729e22ceacf5a2f01. The upstream notice is preserved in \`../wax/LICENSE.md\`; the original, unmodified MP3 files stay in \`../wax/\`.
**Changes (CC BY 4.0 §3(a)(1)(B)): the clips in \`wax.wav\` were modified** — cut out of the original recordings at detected strike points, faded in/out, peak-normalised to −1 dBFS and loudness-matched within each pool. No filtering, EQ or pitch change is baked in.
The upstream licence says the recordings are the maintainer's own; that claim was not independently verified.
W02 also uses real chocolate-bar snapping/crumbling recordings (Freesound CC0, below). Counts: ${w.counts.extractedClips} clips from ${w.counts.sourceFiles} files.

${head}
${tbl(w)}

## Crunch (C01 비누 크런치, C02 슈가비즈 말랑이)${soapOwn ? '' : ' — Freesound CC0 1.0'}

${soapOwn ? `**C01 비누 크런치 uses the project owner's own recordings of the actual soap crunch squishy** (rows \`own:\` below; \`soap.crunch\` short crushing from one take, \`soap.hold\` continuous squeezing from another). Own recordings — no third-party licence; the owner holds the rights.
C02 uses Freesound recordings marked Creative Commons 0 (https://creativecommons.org/publicdomain/zero/1.0/) on their pages on the retrieval date (public HQ preview MP3s). CC0 needs no attribution; we credit the authors anyway.
**C02 is not a recording of sugar beads** — similar materials: glass beads, sprinkles, pop rocks, rock candy.` : `All marked Creative Commons 0 (https://creativecommons.org/publicdomain/zero/1.0/) on their pages on the retrieval date (public HQ preview MP3s). CC0 needs no attribution; we credit the authors anyway.
**Not recordings of soap crunch slime or sugar beads** — similar materials: C01 dry floral foam / styrofoam, C02 glass beads, sprinkles, pop rocks, rock candy.`} Counts: ${c.counts.extractedClips} clips from ${c.counts.sourceFiles} files.

${head}
${tbl(c)}

## Squish (S01–S03 말랑이, L01–L03 슬랑이) — Freesound CC0 1.0

Replaces the earlier shared gel sprite. S01 stress balls / squeeze toy, S02 memory foam / sponge, S03 dough, L01 slime, L02 jelly / goo, L03 shaving foam. Counts: ${q.counts.extractedClips} clips from ${q.counts.sourceFiles} files.

${head}
${tbl(q)}

## Counting

\`recordings\` = distinct passages cut from the files above; \`variants\` = derived copies (0). The player adds a ±3–5 % speed/pitch jitter and picks clips so that none repeats back-to-back — that jitter is playback variation, not additional recordings.
Sources are downloaded (Freesound preview MP3s, sha256-pinned in \`scripts/fidgets/freesound-sources.json\`) into the git-ignored \`bench-out/fidget-src/\` when missing.
`;
  fs.writeFileSync(path.join(OUT, 'CREDITS.md'), t);
  console.log('\nCREDITS.md written');
}
