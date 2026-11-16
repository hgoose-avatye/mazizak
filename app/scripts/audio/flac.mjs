// Lossless FLAC encode/decode through the reference libFLAC (1.3.4) compiled to JavaScript (asm.js build): npm libflacjs@5.6.0 (exact
// version pinned in package.json). Pure JS/WASM: the same bytes on macOS, Linux and Windows, no system encoder needed.
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
export const ENCODER = 'libFLAC 1.3.4 (libflacjs 5.6.0, asm.js)';
export const COMPRESSION = 8; // flac -8: best ratio, still lossless; decode cost is the same for every level
let FlacP;
const lib = () => (FlacP ??= new Promise((res) => { const F = require('libflacjs/dist/libflac.js'); if (F.isReady()) res(F); else F.on('ready', () => res(F)); }));

/** 16-bit mono (or interleaved) PCM → FLAC file bytes. Throws unless libFLAC's own verify pass succeeds. */
export async function encodeFlac(pcm /* Int16Array */, sampleRate, channels = 1) {
  const Flac = await lib();
  const frames = pcm.length / channels;
  const enc = Flac.create_libflac_encoder(sampleRate, channels, 16, COMPRESSION, frames, /*verify*/ true, 0);
  if (!enc) throw new Error('flac: encoder create failed');
  const parts = [];
  if (Flac.init_encoder_stream(enc, (data) => { parts.push(new Uint8Array(data)); }, () => {}) !== 0) throw new Error('flac: init failed');
  const i32 = Int32Array.from(pcm);
  const CH = 65536 * channels;
  for (let i = 0; i < i32.length; i += CH) if (!Flac.FLAC__stream_encoder_process_interleaved(enc, i32.subarray(i, i + CH), Math.min(CH, i32.length - i) / channels)) throw new Error('flac: encode failed (state ' + Flac.FLAC__stream_encoder_get_state(enc) + ')');
  if (!Flac.FLAC__stream_encoder_finish(enc)) throw new Error('flac: finish/verify failed');
  Flac.FLAC__stream_encoder_delete(enc);
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  // A stream encoder without a seek callback cannot go back to fill in STREAMINFO's MD5 at the end: write it here (MD5 of the
  // samples as signed 16-bit little-endian, as the FLAC format defines it), so every decoder that checks it can.
  if (String.fromCharCode(...out.subarray(0, 4)) !== 'fLaC' || (out[4] & 0x7f) !== 0) throw new Error('flac: STREAMINFO not first');
  const le = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) le.writeInt16LE(pcm[i], i * 2);
  out.set(crypto.createHash('md5').update(le).digest(), 8 + 18);
  return out;
}

/** FLAC bytes → { sampleRate, channels, pcm: Int16Array (interleaved) } with libFLAC's MD5 check on. */
export async function decodeFlac(bytes /* Uint8Array */) {
  const Flac = await lib();
  const dec = Flac.create_libflac_decoder(/*md5 check*/ true);
  let pos = 0, meta = null, err = null;
  const chunks = [];
  const read = (n) => { const end = Math.min(bytes.length, pos + n); const buf = bytes.subarray(pos, end); pos = end; return { buffer: buf, readDataLength: buf.length, error: false }; };
  const write = (channelsData, frameInfo) => {
    const n = frameInfo.blocksize, ch = frameInfo.channels, out = new Int16Array(n * ch);
    for (let c = 0; c < ch; c++) { const dv = new DataView(channelsData[c].buffer, channelsData[c].byteOffset, channelsData[c].byteLength); for (let i = 0; i < n; i++) out[i * ch + c] = dv.getInt16(i * 2, true); }
    chunks.push(out);
  };
  if (Flac.init_decoder_stream(dec, read, write, (code, desc) => { err = desc; }, (m) => { meta = m; }) !== 0) throw new Error('flac: decoder init failed');
  Flac.FLAC__stream_decoder_process_until_end_of_stream(dec);
  const md5ok = Flac.FLAC__stream_decoder_finish(dec);
  Flac.FLAC__stream_decoder_delete(dec);
  if (err) throw new Error('flac: decode error ' + err);
  if (!md5ok) throw new Error('flac: MD5 mismatch');
  const pcm = new Int16Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0; for (const c of chunks) { pcm.set(c, o); o += c.length; }
  return { sampleRate: meta.sampleRate, channels: meta.channels, bitsPerSample: meta.bitsPerSample, md5: meta.md5sum, pcm };
}
