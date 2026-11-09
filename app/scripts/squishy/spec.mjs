// node spec.mjs file.f32 out.png [t0 t1]  -> spectrogram (log freq) + RMS envelope PNG, with 1s grid
import fs from 'node:fs'; import zlib from 'node:zlib';
const [f, outp, a0, a1] = process.argv.slice(2); const SR = 44100;
const all = new Float32Array(fs.readFileSync(f).buffer.slice(0));
const t0 = +(a0 ?? 0), t1 = +(a1 ?? all.length / SR);
const x = all.subarray(Math.floor(t0 * SR), Math.floor(t1 * SR));
const W = Math.min(2400, Math.max(400, Math.round((t1 - t0) * 100))), H = 260, EH = 100;
const N = 1024; const M = new Float32Array(W*H); const img = new Uint8Array((H + EH) * W * 3);
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]];[im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(a * k), s = Math.sin(a * k); const ur = re[i + k], ui = im[i + k]; const vr = re[i + k + len / 2] * c - im[i + k + len / 2] * s, vi = re[i + k + len / 2] * s + im[i + k + len / 2] * c; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; } } }
const hop = x.length / W;
for (let c = 0; c < W; c++) {
  const s = Math.floor(c * hop); const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[s + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  fft(re, im);
  for (let r = 0; r < H; r++) { const fr = 40 * Math.pow(18000 / 40, 1 - r / H); const bin = Math.round(fr / SR * N);
    const mag = Math.hypot(re[bin], im[bin]); let db = 20 * Math.log10(mag + 1e-9); M[r*W+c]=db; let v=0;
    const o = (r * W + c) * 3; img[o] = 255 * Math.min(1, v * 2); img[o + 1] = 255 * Math.max(0, v * 2 - 1); img[o + 2] = 80 * v; }
  let e = 0, n = Math.max(1, Math.floor(hop)); for (let i = 0; i < n; i++) e += (x[s + i] || 0) ** 2; const db = 10 * Math.log10(e / n + 1e-12);
  const h = Math.max(0, Math.min(EH, Math.round((db + 70) / 70 * EH)));
  for (let r = 0; r < EH; r++) { const o = ((H + r) * W + c) * 3; const on = (EH - r) <= h; img[o] = img[o + 1] = img[o + 2] = on ? 200 : 20; }
}
{ let mx=-1e9; for (const v of M) if (v>mx) mx=v; for (let i=0;i<W*H;i++){ const v=Math.max(0,Math.min(1,(M[i]-mx+75)/75)); const o=i*3; img[o]=255*Math.min(1,v*2); img[o+1]=255*Math.max(0,v*2-1); img[o+2]=80*v; } }
// grid each second
for (let t = Math.ceil(t0); t < t1; t++) { const c = Math.round((t - t0) / (t1 - t0) * W); for (let r = 0; r < H + EH; r += 2) { const o = (r * W + c) * 3; if (o < img.length) { img[o] = 0; img[o + 1] = 150; img[o + 2] = 255; } } }
// -20dB / -40dB lines in envelope
for (const d of [-20, -40]) { const r = H + EH - Math.round((d + 70) / 70 * EH); for (let c = 0; c < W; c += 3) { const o = (r * W + c) * 3; img[o] = 255; img[o+1]=0; img[o+2]=0; } }
const raw = Buffer.alloc((W * 3 + 1) * (H + EH)); for (let r = 0; r < H + EH; r++) { raw[r * (W * 3 + 1)] = 0; Buffer.from(img.buffer, r * W * 3, W * 3).copy(raw, r * (W * 3 + 1) + 1); }
const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
const crc = b => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H + EH, 4); ih[8] = 8; ih[9] = 2;
fs.writeFileSync(outp, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(outp, W, 'px for', (t1 - t0).toFixed(2), 's');
