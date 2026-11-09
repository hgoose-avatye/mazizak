// Chrome verification of the shipped keyboard sprites, through the REAL loader (src/audio/keyboardSamples.ts,
// transpiled on the fly) + real fetch/decodeAudioData, rendered with OfflineAudioContext through a chain that
// mirrors core/audio.ts (voice gain/pan → master 0.9 → DynamicsCompressor −6 dB/20:1/2 ms/80 ms).
// Scenarios per preset: 10 sample-aligned downs; the same spread over 0–8 ms; a 3 s typing burst at 12 keys/s (every 6th = space).
// Writes bench-out/audio-src/keyboard/report.json.   Usage: node scripts/kbsamples/verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tsSrc = fs.readFileSync(path.join(ROOT, 'src/audio/keyboardSamples.ts'), 'utf8');
const js = ts.transpileModule(tsSrc, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage();
await page.route('http://kb.test/**', async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>kb</title>' });
  if (u.pathname === '/keyboardSamples.js') return route.fulfill({ contentType: 'text/javascript', body: js });
  const f = path.join(ROOT, 'public', u.pathname);
  if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ contentType: f.endsWith('.json') ? 'application/json' : 'audio/wav', body: fs.readFileSync(f) });
});
await page.goto('http://kb.test/');

const result = await page.evaluate(async () => {
  const { loadKeyboardSamples, KEYBOARD_SAMPLE_CREDITS } = await import('/keyboardSamples.js');
  const SR = 48000;
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const stats = (buf) => {
    let pk = 0, sum = 0, n = 0, maxST = 0; const w = Math.round(0.1 * SR);
    const chs = [buf.getChannelData(0), buf.getChannelData(1)];
    for (const c of chs) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > pk) pk = a; sum += c[i] * c[i]; n++; }
    for (let i = 0; i + w <= buf.length; i += w / 4) { let s = 0; for (const c of chs) for (let j = i; j < i + w; j++) s += c[j] * c[j]; maxST = Math.max(maxST, Math.sqrt(s / (2 * w))); }
    const db = (v) => +(20 * Math.log10(Math.max(v, 1e-9))).toFixed(2);
    return { peakDbfs: db(pk), rmsDbfs: db(Math.sqrt(sum / n)), maxShortTermRms100msDbfs: db(maxST), clipped: pk >= 1 };
  };
  async function render(preset, scenario, withLimiter) {
    const dur = scenario.startsWith('chord10') ? 1.0 : 3.6;
    const ctx = new OfflineAudioContext(2, Math.round(dur * SR), SR);
    const s = await loadKeyboardSamples(ctx, preset, '/sfx/keyboard/');
    const master = ctx.createGain(); master.gain.value = 0.9;
    if (withLimiter) {
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -6; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.08;
      master.connect(lim).connect(ctx.destination);
    } else master.connect(ctx.destination);
    const play = (buf, t, { gainDb = 0, jitterDb = 1.2, detune = 22, pan = 0 } = {}) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.detune.value = (rnd() * 2 - 1) * detune;
      const g = ctx.createGain(); g.gain.value = Math.pow(10, (gainDb + (rnd() * 2 - 1) * jitterDb) / 20);
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      src.connect(g).connect(p).connect(master); src.start(t);
    };
    if (scenario === 'chord10') {
      for (let k = 0; k < 10; k++) play(s.down[k % s.down.length], 0.1, { jitterDb: 0, pan: ((k / 9) * 2 - 1) * 0.22 });
    } else if (scenario === 'chord10_spread8ms') {
      // same 10 downs, but start times spread over 0–8 ms (real fingers never land on the same sample)
      for (let k = 0; k < 10; k++) play(s.down[k % s.down.length], 0.1 + rnd() * 0.008, { jitterDb: 0, pan: ((k / 9) * 2 - 1) * 0.22 });
    } else {
      // 12 keys/s for 3 s; each key releases 70–110 ms later (space: 120–160 ms); rapid presses get −2 dB like the toy
      for (let k = 0; k < 36; k++) {
        const t = 0.1 + k / 12, space = k % 6 === 5, pan = (rnd() * 2 - 1) * 0.22;
        const pick = (a) => a[Math.floor(rnd() * a.length)];
        play(pick(space ? s.spaceDown : s.down), t, { gainDb: k ? -2 : 0, pan });
        play(pick(space ? s.spaceUp : s.up), t + (space ? 0.12 : 0.07) + rnd() * 0.04, { jitterDb: 1, detune: 18, pan });
      }
    }
    return stats(await ctx.startRendering());
  }
  const out = {};
  for (const preset of ['pebble', 'clack']) {
    out[preset] = {};
    for (const sc of ['chord10', 'chord10_spread8ms', 'typing12ps']) out[preset][sc] = { preLimiter: await render(preset, sc, false), postLimiter: await render(preset, sc, true) };
    const ctx = new OfflineAudioContext(1, 1, SR); const s = await loadKeyboardSamples(ctx, preset, '/sfx/keyboard/');
    out[preset].counts = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.length]));
  }
  // also exercise a 44.1 kHz context (decodeAudioData resamples; loader addresses the sprite in seconds)
  const c441 = new OfflineAudioContext(1, 1, 44100); const s441 = await loadKeyboardSamples(c441, 'clack', '/sfx/keyboard/');
  out.ctx44100 = { downSampleRate: s441.down[0].sampleRate, downLen0: s441.down[0].length };
  out.credits = KEYBOARD_SAMPLE_CREDITS;
  return out;
});
await browser.close();

const { execFileSync } = await import('node:child_process');
const metrics = JSON.parse(execFileSync('node', [path.join(ROOT, 'scripts/kbsamples/metrics.mjs')], { encoding: 'utf8' }));
const sizes = Object.fromEntries(fs.readdirSync(path.join(ROOT, 'public/sfx/keyboard')).map((f) => [f, fs.statSync(path.join(ROOT, 'public/sfx/keyboard', f)).size]));
const report = { generated: new Date().toISOString(), chain: 'voice gain(±1.2 dB jitter, −2 dB rapid) → pan ±0.22 → master 0.9 → DynamicsCompressor(thr −6, knee 0, ratio 20, atk 2 ms, rel 80 ms)', render: result, sliceMetrics: metrics, shippedBytes: sizes };
const outFile = path.join(ROOT, 'bench-out/audio-src/keyboard/report.json');
fs.writeFileSync(outFile, JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify(result, null, 1));
console.log('wrote', outFile);
