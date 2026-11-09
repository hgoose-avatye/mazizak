// plot.mjs out.png file.f32:start:end [file:start:end ...]  -> stacked waveform + dB envelope rows
import { chromium } from 'playwright-core';
import { load, SR } from './lib.mjs';
const [out, ...specs] = process.argv.slice(2);
const rows = specs.map((s) => { const [f, a, b] = s.split(':'); const x = load(f); const i0 = Math.floor(+a * SR), i1 = Math.min(x.length, Math.floor(+b * SR)); return { label: s.split('/').pop(), a: +a, b: +b, data: Array.from(x.subarray(i0, i1)) }; });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const W = 1800, H = 220;
const page = await browser.newPage({ viewport: { width: W, height: H * rows.length } });
await page.setContent(`<canvas id=c width=${W} height=${H * rows.length}></canvas>`);
await page.evaluate(({ rows, W, H, SR }) => {
  const g = document.getElementById('c').getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H * rows.length);
  rows.forEach((r, k) => {
    const y0 = k * H, n = r.data.length, mid = y0 + H / 2;
    g.strokeStyle = '#ccc'; g.beginPath(); g.moveTo(0, y0 + H); g.lineTo(W, y0 + H); g.stroke();
    // grid every 100ms
    const dur = n / SR; g.fillStyle = '#999'; g.font = '11px sans-serif';
    for (let t = 0; t < dur; t += 0.1) { const x = (t / dur) * W; g.fillRect(x, y0, 1, 6); if (Math.round(t * 10) % 5 == 0) g.fillText((r.a + t).toFixed(1), x + 2, y0 + 16); }
    g.fillStyle = '#36c';
    for (let px = 0; px < W; px++) { const i0 = Math.floor(px * n / W), i1 = Math.max(i0 + 1, Math.floor((px + 1) * n / W)); let lo = 0, hi = 0; for (let i = i0; i < i1; i++) { lo = Math.min(lo, r.data[i]); hi = Math.max(hi, r.data[i]); } g.fillRect(px, mid - hi * H * 0.48, 1, Math.max(1, (hi - lo) * H * 0.48)); }
    // dB envelope (2ms rms) red: -80..0 dB
    g.strokeStyle = '#d33'; g.beginPath();
    for (let px = 0; px < W; px++) { const i0 = Math.floor(px * n / W), i1 = Math.max(i0 + 96, Math.floor((px + 1) * n / W)); let s = 0; for (let i = i0; i < i1 && i < n; i++) s += r.data[i] ** 2; const d = 10 * Math.log10(s / (i1 - i0) + 1e-12); const y = y0 + H - ((d + 80) / 80) * H; px ? g.lineTo(px, y) : g.moveTo(px, y); }
    g.stroke(); g.fillStyle = '#000'; g.fillText(r.label, 4, y0 + 30);
  });
}, { rows, W, H, SR });
await page.screenshot({ path: out });
await browser.close();
