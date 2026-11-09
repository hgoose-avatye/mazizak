// Renders the real AudioEngine graph (limiter + soft clip + de-stacking) offline in Chrome
// with the shipped recorded samples, and reports peaks — clipping / overlap check.
// Usage (dev server running): BASE=http://localhost:4319 node scripts/audio-check.mjs
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:4319';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.goto(`${BASE}/lab-sound.html`);
const res = await page.evaluate(async () => {
  const { AudioEngine } = await import('/src/core/audio.ts');
  const { loadKeyboardSamples } = await import('/src/audio/keyboardSamples.ts');
  const { loadSquishySamples } = await import('/src/audio/squishySamples.ts');
  const SR = 48000;
  async function render(seconds, setup) {
    const off = new OfflineAudioContext(2, SR * seconds, SR);
    const eng = new AudioEngine(24, off);
    for (const p of ['pebble', 'clack']) {
      const s = await loadKeyboardSamples(off, p);
      for (const [k, v] of Object.entries(s)) eng.register(`kb:${p}:${k}`, v);
    }
    const sq = await loadSquishySamples(off);
    eng.register('sq:touch', sq.touch);
    eng.register('sq:compress', sq.compress);
    eng.register('sq:recover', sq.recover);
    setup(eng, sq, off);
    const buf = await off.startRendering();
    let peak = 0, sum = 0, over = 0, n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); peak = Math.max(peak, a); sum += a * a; n++; if (a >= 0.999) over++; }
    }
    return { peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(2), rmsDb: +(10 * Math.log10(sum / n || 1e-12)).toFixed(1), samplesAt0dBFS: over };
  }
  const out = {};
  for (const p of ['pebble', 'clack']) {
    out[`${p}: 10 keys same instant (+5 dB makeup)`] = await render(1, (e) => { for (let i = 0; i < 10; i++) e.play(`kb:${p}:down`, { gainDb: 5, gainJitterDb: 1.2 }); });
    out[`${p}: typing 12 keys/s, 3 s`] = await render(3.5, (e) => { for (let i = 0; i < 36; i++) { const t = i / 12; e.play(`kb:${p}:${i % 7 === 6 ? 'spaceDown' : 'down'}`, { gainDb: 5, delaySec: t }); e.play(`kb:${p}:${i % 7 === 6 ? 'spaceUp' : 'up'}`, { gainDb: 5, delaySec: t + 0.06 }); } });
    out[`${p}: 5-key chord ×4`] = await render(2, (e) => { for (let r = 0; r < 4; r++) for (let i = 0; i < 5; i++) e.play(`kb:${p}:down`, { gainDb: 5, delaySec: r * 0.3 }); });
  }
  out['squishy: 2 touches + 2 compress + rub + stretch loops'] = await render(3, (e, sq) => {
    e.play('sq:touch'); e.play('sq:touch', { gainDb: -4 }); e.play('sq:compress', { delaySec: 0.3 }); e.play('sq:compress', { delaySec: 0.35 });
    const rub = e.createLoop(sq.rub); rub.set(0.8, 0.8); const st = e.createLoop(sq.stretch); st.set(1, 1);
    e.play('sq:recover', { delaySec: 1 });
  });
  return out;
});
mkdirSync(new URL('../bench-out/', import.meta.url).pathname, { recursive: true });
writeFileSync(new URL('../bench-out/audio-check.json', import.meta.url).pathname, JSON.stringify(res, null, 2));
console.log(JSON.stringify(res, null, 2));
await browser.close();
