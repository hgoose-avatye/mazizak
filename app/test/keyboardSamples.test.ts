import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEYBOARD_SAMPLE_CREDITS, loadKeyboardSamples } from '../src/audio/keyboardSamples';

// Parses the SHIPPED sprite WAV + JSON straight from disk (no fetch) and checks the audio itself.

// node:fs via a dynamic specifier (same pattern as squishySamples.test.ts) so `tsc` needs no @types/node
const fsName = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as { readFileSync(p: URL): Uint8Array };
const file = (name: string) => readFileSync(new URL(`../public/sfx/keyboard/${name}`, import.meta.url));
const ascii = (b: Uint8Array, a: number, z: number) => String.fromCharCode(...b.subarray(a, z));
const PRESETS = ['pebble', 'clack'] as const;
const ROLES = ['down', 'up', 'spaceDown', 'spaceUp'] as const;
type Role = (typeof ROLES)[number];
interface Entry { start: number; length: number; offset: number; duration: number; gain: number; src: string; srcStart?: number; srcEnd?: number }
interface SpriteMap { file: string; sampleRate: number; channels: number; totalSamples: number; entries: Record<Role, Entry[]> }

function readWav(buf: Uint8Array) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  expect(ascii(buf, 0, 4)).toBe('RIFF');
  expect(ascii(buf, 8, 12)).toBe('WAVE');
  let p = 12, fmt: { ch: number; sr: number; bits: number; tag: number } | undefined, data: Float32Array | undefined;
  while (p + 8 <= buf.length) {
    const id = ascii(buf, p, p + 4), size = v.getUint32(p + 4, true), body = p + 8;
    if (id === 'fmt ') fmt = { tag: v.getUint16(body, true), ch: v.getUint16(body + 2, true), sr: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    if (id === 'data') {
      const n = size / 2; data = new Float32Array(n);
      for (let i = 0; i < n; i++) data[i] = v.getInt16(body + i * 2, true) / 32768;
    }
    p = body + size + (size & 1);
  }
  return { fmt: fmt!, data: data! };
}

function load(preset: string) {
  const map = JSON.parse(new TextDecoder().decode(file(`${preset}.json`))) as SpriteMap;
  const wavBuf = file(map.file);
  const wav = readWav(wavBuf);
  const slices = {} as Record<Role, Float32Array[]>;
  for (const r of ROLES) slices[r] = map.entries[r].map((e) => wav.data.slice(e.start, e.start + e.length).map((v) => v * e.gain));
  return { map, wav, wavBytes: wavBuf.length, slices };
}

// ── analysis helpers ──
const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (x: Float32Array, n = x.length) => { const k = Math.min(n, x.length); let s = 0; for (let i = 0; i < k; i++) s += x[i] * x[i]; return Math.sqrt(s / k); };
const db = (v: number) => 20 * Math.log10(v);
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
function onsetSample(x: Float32Array) { const t = 0.1 * peak(x); return x.findIndex((v) => Math.abs(v) >= t); }
/** ms until the 2 ms RMS envelope last exceeds peak − 30 dB */
function effLenMs(x: Float32Array, sr: number) {
  const thr = peak(x) * 0.0316; let last = 0;
  for (let i = 0; i + 96 <= x.length; i += 48) if (rms(x.subarray(i, i + 96)) > thr) last = i + 96;
  return (last / sr) * 1000;
}
/** power-weighted spectral centroid (Hz) of the first 2048 samples (Hann), radix-2 FFT */
function centroid(x: Float32Array, sr: number) {
  const n = 2048, len = Math.min(n, x.length), re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < len; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / len));
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let L = 2; L <= n; L <<= 1) { const a = (-2 * Math.PI) / L; for (let i = 0; i < n; i += L) for (let k = 0; k < L / 2; k++) { const wr = Math.cos(a * k), wi = Math.sin(a * k), p = i + k, q = p + L / 2; const vr = re[q] * wr - im[q] * wi, vi = re[q] * wi + im[q] * wr; re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; } }
  let num = 0, den = 0;
  for (let k = 1; k < n / 2; k++) { const pw = re[k] * re[k] + im[k] * im[k]; num += pw * ((k * sr) / n); den += pw; }
  return num / den;
}

const data = Object.fromEntries(PRESETS.map((p) => [p, load(p)])) as Record<(typeof PRESETS)[number], ReturnType<typeof load>>;

describe('shipped keyboard sprites', () => {
  for (const p of PRESETS) {
    describe(p, () => {
      const { map, wav, slices } = data[p];

      it('is 16-bit mono PCM at 44.1/48 kHz and matches its map', () => {
        expect(wav.fmt).toMatchObject({ tag: 1, ch: 1, bits: 16 });
        expect([44100, 48000]).toContain(wav.fmt.sr);
        expect(map.sampleRate).toBe(wav.fmt.sr);
        expect(map.totalSamples).toBe(wav.data.length);
      });

      it('map entries lie within the file and are consistent', () => {
        for (const r of ROLES)
          for (const e of map.entries[r]) {
            expect(e.start).toBeGreaterThanOrEqual(0);
            expect(e.length).toBeGreaterThan(0);
            expect(e.start + e.length).toBeLessThanOrEqual(wav.data.length);
            expect(Math.abs(e.offset * map.sampleRate - e.start)).toBeLessThanOrEqual(1);
            expect(Math.abs(e.duration * map.sampleRate - e.length)).toBeLessThanOrEqual(1);
            expect(e.gain).toBeGreaterThan(0);
            expect(e.gain).toBeLessThanOrEqual(1);
            expect(e.src).toMatch(/^freesound:\d+$/);
            if (e.srcStart !== undefined) expect(e.srcEnd).toBeGreaterThan(e.srcStart); // clack (bank B) does not record source times
          }
      });

      it('has enough variants per role', () => {
        expect(map.entries.down.length).toBeGreaterThanOrEqual(8);
        expect(map.entries.up.length).toBeGreaterThanOrEqual(6);
        expect(map.entries.spaceDown.length).toBeGreaterThanOrEqual(3);
        expect(map.entries.spaceUp.length).toBeGreaterThanOrEqual(2);
      });

      // clack = bank B clips copied unchanged: some have a quiet lead-in (up to ~18 ms) before the 10 % point
      it(`every slice starts within ${p === 'clack' ? 20 : 2} ms of its onset`, () => {
        for (const r of ROLES) for (const x of slices[r]) expect(onsetSample(x)).toBeLessThanOrEqual(Math.round((p === 'clack' ? 0.02 : 0.002) * map.sampleRate));
      });

      it('never clips: sprite and gained slices peak ≤ −1 dBFS', () => {
        const ceil = Math.pow(10, -1 / 20) + 1 / 32768;
        expect(peak(wav.data)).toBeLessThanOrEqual(ceil);
        for (const r of ROLES) for (const x of slices[r]) expect(peak(x)).toBeLessThanOrEqual(ceil);
      });

      it('presses are louder than releases on average', () => {
        const lv = (r: Role) => mean(slices[r].map((x) => rms(x, 2880)));
        expect(db(lv('down'))).toBeGreaterThan(db(lv('up')) + 2);
        expect(db(lv('spaceDown'))).toBeGreaterThan(db(lv('spaceUp')) + 2);
      });

      // the pebble/old-clack spacebar proxies were picked for a long ring; bank B's spacebar clips are not longer
      (p === 'pebble' ? it : it.skip)('space presses are longer than normal presses', () => {
        const len = (r: Role) => mean(slices[r].map((x) => x.length));
        const eff = (r: Role) => mean(slices[r].map((x) => effLenMs(x, map.sampleRate)));
        expect(len('spaceDown')).toBeGreaterThan(len('down'));
        expect(eff('spaceDown')).toBeGreaterThan(eff('down') * 1.5);
      });
    });
  }

  it('pebble is clearly darker than clack (spectral centroid of presses)', () => {
    const c = (p: (typeof PRESETS)[number]) => mean(data[p].slices.down.map((x) => centroid(x, data[p].map.sampleRate)));
    const pebble = c('pebble'), clack = c('clack');
    expect(pebble).toBeLessThan(clack * 0.5);
  });

  it('presets differ by source recording, not by processing of one source', () => {
    const srcs = (p: (typeof PRESETS)[number]) => new Set(ROLES.flatMap((r) => data[p].map.entries[r].map((e) => e.src)));
    const a = srcs('pebble'), b = srcs('clack');
    for (const s of a) expect(b.has(s)).toBe(false);
  });

  it('total shipped keyboard audio stays under 1.5 MB', () => {
    expect(data.pebble.wavBytes + data.clack.wavBytes).toBeLessThan(1.5 * 1024 * 1024);
  });

  it('credits mention every source', () => {
    for (const id of ['815614', '755222']) expect(KEYBOARD_SAMPLE_CREDITS).toContain(id);
  });
});

// ── loader, with fetch + AudioContext shimmed from disk ──
class FakeBuffer {
  private d: Float32Array;
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) { this.d = new Float32Array(length); }
  getChannelData() { return this.d; }
}
function fakeCtx(sampleRate: number) {
  return {
    sampleRate,
    createBuffer: (c: number, n: number, sr: number) => new FakeBuffer(c, n, sr),
    decodeAudioData: async (ab: ArrayBuffer) => {
      const { fmt, data: pcm } = readWav(new Uint8Array(ab));
      // naive linear resample to the context rate, like a real decodeAudioData would
      const n = Math.round((pcm.length * sampleRate) / fmt.sr), b = new FakeBuffer(1, n, sampleRate), o = b.getChannelData();
      for (let i = 0; i < n; i++) { const t = (i * fmt.sr) / sampleRate, k = Math.floor(t), a = t - k; o[i] = (pcm[k] ?? 0) * (1 - a) + (pcm[k + 1] ?? 0) * a; }
      return b;
    },
  } as unknown as BaseAudioContext;
}

describe('loadKeyboardSamples', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stubFetch = () => {
    const f = vi.fn(async (url: string) => {
      const name = String(url).split('/').pop()!;
      const buf = file(name);
      return { ok: true, status: 200, json: async () => JSON.parse(new TextDecoder().decode(buf)), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
    });
    vi.stubGlobal('fetch', f);
    return f;
  };

  it('slices every role with gain applied, and caches per preset', async () => {
    const f = stubFetch();
    const ctx = fakeCtx(48000);
    const s = await loadKeyboardSamples(ctx, 'pebble');
    const map = data.pebble.map;
    for (const r of ROLES) {
      expect(s[r].length).toBe(map.entries[r].length);
      s[r].forEach((b, i) => {
        expect(b.length).toBe(map.entries[r][i].length);
        const ref = data.pebble.slices[r][i];
        expect(peak(b.getChannelData(0))).toBeCloseTo(peak(ref), 5);
      });
    }
    expect(f).toHaveBeenCalledWith('./sfx/keyboard/pebble.json');
    const again = await loadKeyboardSamples(ctx, 'pebble');
    expect(again).toBe(s);
    expect(f).toHaveBeenCalledTimes(2); // json + wav, once
  });

  it('works when the context runs at 44.1 kHz (addresses the sprite in seconds)', async () => {
    stubFetch();
    const s = await loadKeyboardSamples(fakeCtx(44100), 'clack', '/x/');
    const e = data.clack.map.entries.down[0];
    expect(s.down[0].sampleRate).toBe(44100);
    expect(Math.abs(s.down[0].length - Math.round(e.duration * 44100))).toBeLessThanOrEqual(1);
    expect(s.spaceDown.length).toBe(data.clack.map.entries.spaceDown.length);
  });
});
