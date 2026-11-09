import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSquishySamples, SQUISHY_SAMPLES_ARE_RECORDED } from '../src/audio/squishySamples';

// node APIs via dynamic import (no @types/node in this project; same pattern as sfx.test.ts)
const fsName = 'node:fs';
const { readFileSync, statSync } = (await import(/* @vite-ignore */ fsName)) as {
  readFileSync(p: string): Uint8Array;
  statSync(p: string): { size: number };
};
const dir = decodeURIComponent(new URL('../public/sfx/squishy/', import.meta.url).pathname);
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const ab = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const map = JSON.parse(text(readFileSync(dir + 'squishy.json'))) as {
  sampleRate: number;
  file: string;
  slices: {
    name: string; cat: string; start: number; end: number; startSample: number; length: number;
    loop: boolean; src: string; srcStart: number; srcEnd: number; recorded: boolean;
  }[];
  sources: Record<string, { license: string; licenseUrl: string; url: string; author: string; title: string; retrieved: string }>;
};

function readWav(buf: ArrayBuffer) {
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  expect(tag(0)).toBe('RIFF');
  expect(tag(8)).toBe('WAVE');
  let o = 12, sr = 0, ch = 0, bits = 0, data: Float32Array | null = null;
  while (o + 8 <= buf.byteLength) {
    const id = tag(o), n = v.getUint32(o + 4, true);
    if (id === 'fmt ') { ch = v.getUint16(o + 10, true); sr = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true); }
    if (id === 'data') data = Float32Array.from(new Int16Array(buf.slice(o + 8, o + 8 + n)), (x) => x / 32768);
    o += 8 + n + (n & 1);
  }
  return { sr, ch, bits, data: data! };
}
const wav = readWav(ab(readFileSync(dir + map.file)));
const sliceData = (s: (typeof map.slices)[number]) => wav.data.subarray(s.startSample, s.startSample + s.length);
const of = (cat: string) => map.slices.filter((s) => s.cat === cat);

const peakDb = (x: Float32Array) => 20 * Math.log10(x.reduce((m, v) => Math.max(m, Math.abs(v)), 0) + 1e-12);
function blocksDb(x: Float32Array, n: number) {
  const out: number[] = [];
  for (let s = 0; s + n <= x.length; s += n) {
    let e = 0;
    for (let i = 0; i < n; i++) e += x[s + i] ** 2;
    out.push(10 * Math.log10(e / n + 1e-20));
  }
  return out;
}
/** RMS over 10 ms blocks within 30 dB of the loudest block. */
function activeRmsDb(x: Float32Array, sr: number) {
  const e = blocksDb(x, Math.round(sr / 100));
  const mx = Math.max(...e);
  const act = e.filter((v) => v > mx - 30);
  return 10 * Math.log10(act.reduce((s, v) => s + 10 ** (v / 10), 0) / act.length);
}
/** Onset = start of first 1 ms block whose RMS is within 30 dB of the loudest 1 ms block. */
function onsetMs(x: Float32Array, sr: number) {
  const n = Math.round(sr / 1000);
  const e = blocksDb(x, n);
  const mx = Math.max(...e);
  return e.findIndex((v) => v >= mx - 30) * (1000 * n) / sr;
}
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

describe('squishy sample sprite', () => {
  it('is a 16-bit mono WAV under 1.2 MB', () => {
    expect(wav.ch).toBe(1);
    expect(wav.bits).toBe(16);
    expect(wav.sr).toBe(map.sampleRate);
    expect(statSync(dir + map.file).size).toBeLessThan(1.2 * 1024 * 1024);
  });

  it('map slices are in bounds, consistent and non-overlapping', () => {
    let prevEnd = 0;
    for (const s of [...map.slices].sort((a, b) => a.startSample - b.startSample)) {
      expect(s.startSample).toBeGreaterThanOrEqual(prevEnd);
      expect(s.startSample + s.length).toBeLessThanOrEqual(wav.data.length);
      expect(Math.abs(s.start * map.sampleRate - s.startSample)).toBeLessThan(1);
      expect(Math.abs((s.end - s.start) * map.sampleRate - s.length)).toBeLessThan(1);
      prevEnd = s.startSample + s.length;
    }
  });

  it('every slice has provenance pointing at a CC0 source', () => {
    for (const s of map.slices) {
      expect(s.srcEnd).toBeGreaterThan(s.srcStart);
      const src = map.sources[s.src];
      expect(src, s.src).toBeDefined();
      expect(src.license).toBe('CC0 1.0');
      expect(src.licenseUrl).toContain('publicdomain/zero/1.0');
      expect(src.url).toMatch(/^https:\/\/freesound\.org\/people\/.+\/sounds\/\d+\/$/);
      expect(src.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('has the required counts per category', () => {
    expect(of('touch').length).toBeGreaterThanOrEqual(4);
    expect(of('compress').length).toBeGreaterThanOrEqual(4);
    expect(of('recover').length).toBeGreaterThanOrEqual(2);
    expect(of('rub').filter((s) => s.loop).length).toBe(1);
    expect(of('stretch').filter((s) => s.loop).length).toBe(1);
  });

  it('durations are in range', () => {
    for (const s of of('touch')) expect(s.end - s.start).toBeLessThanOrEqual(0.25);
    for (const s of of('compress')) {
      expect(s.end - s.start).toBeGreaterThanOrEqual(0.2);
      expect(s.end - s.start).toBeLessThanOrEqual(0.8);
    }
    for (const s of [...of('rub'), ...of('stretch')]) {
      expect(s.end - s.start).toBeGreaterThanOrEqual(1.5);
      expect(s.end - s.start).toBeLessThanOrEqual(3);
    }
    for (const s of of('recover')) {
      expect(s.end - s.start).toBeGreaterThanOrEqual(1);
      expect(s.end - s.start).toBeLessThanOrEqual(2.5);
    }
  });

  it('touch / compress / gel onsets are within 2 ms', () => {
    for (const s of [...of('touch'), ...of('compress'), ...of('compressGel')]) {
      expect(onsetMs(sliceData(s), map.sampleRate), s.name).toBeLessThanOrEqual(2);
    }
  });

  it('nothing clips (peak <= -1 dBFS) and one-shots start/end near silence', () => {
    for (const s of map.slices) {
      const x = sliceData(s);
      expect(peakDb(x), s.name).toBeLessThanOrEqual(-1);
      if (!s.loop) expect(Math.abs(x[x.length - 1]), s.name).toBeLessThan(0.003);
    }
  });

  it('loops are seamless (no seam jump or level step)', () => {
    for (const s of [...of('rub'), ...of('stretch')]) {
      const x = sliceData(s);
      const diffs = Array.from({ length: x.length - 1 }, (_, i) => Math.abs(x[i + 1] - x[i])).sort((a, b) => a - b);
      const p99 = diffs[Math.floor(diffs.length * 0.99)];
      expect(Math.abs(x[0] - x[x.length - 1]), s.name).toBeLessThanOrEqual(p99);
      const w = Math.round(map.sampleRate * 0.1);
      const head = activeRmsDb(x.subarray(0, w), map.sampleRate);
      const tail = activeRmsDb(x.subarray(x.length - w), map.sampleRate);
      expect(Math.abs(head - tail), s.name).toBeLessThan(6);
    }
  });

  it('relative levels: recover and touch are quieter than compress', () => {
    const lvl = (cat: string) => mean(of(cat).map((s) => activeRmsDb(sliceData(s), map.sampleRate)));
    expect(lvl('recover')).toBeLessThan(lvl('compress') - 10);
    expect(Math.max(...of('recover').map((s) => activeRmsDb(sliceData(s), map.sampleRate)))).toBeLessThan(
      Math.min(...of('compress').map((s) => activeRmsDb(sliceData(s), map.sampleRate))),
    );
    expect(lvl('touch')).toBeLessThan(lvl('compress'));
  });

  it('only recorded material; derived slices are flagged', () => {
    expect(SQUISHY_SAMPLES_ARE_RECORDED).toBe(false); // recover is derived, not a direct recording
    for (const s of map.slices) expect(s.recorded).toBe(s.cat !== 'recover');
  });
});

describe('loadSquishySamples', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches once, slices into buffers and caches per context', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const file = url.split('/').pop()!;
      const b = readFileSync(dir + file);
      return { ok: true, status: 200, json: async () => JSON.parse(text(b)), arrayBuffer: async () => ab(b) };
    });
    vi.stubGlobal('fetch', fetchMock);
    class FakeBuffer {
      private d: Float32Array;
      constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) { this.d = new Float32Array(length); }
      get duration() { return this.length / this.sampleRate; }
      getChannelData() { return this.d; }
    }
    const ctx = {
      sampleRate: map.sampleRate,
      createBuffer: (c: number, n: number, sr: number) => new FakeBuffer(c, n, sr),
      decodeAudioData: async (buf: ArrayBuffer) => {
        const w = readWav(buf);
        const b = new FakeBuffer(1, w.data.length, w.sr);
        b.getChannelData().set(w.data);
        return b;
      },
    } as unknown as BaseAudioContext;

    const s = await loadSquishySamples(ctx, '/x/sfx/squishy');
    expect(s.touch.length).toBe(of('touch').length);
    expect(s.compress.length).toBe(of('compress').length);
    expect(s.recover.length).toBe(of('recover').length);
    expect(s.compressGel?.length ?? 0).toBe(of('compressGel').length);
    expect(s.rub.duration).toBeCloseTo(of('rub')[0].end - of('rub')[0].start, 3);
    expect(Array.from(s.stretch.getChannelData(0).subarray(0, 64))).toEqual(Array.from(sliceData(of('stretch')[0]).subarray(0, 64)));
    expect(await loadSquishySamples(ctx, '/x/sfx/squishy/')).toBe(s);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
