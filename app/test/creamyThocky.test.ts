import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEYBOARD_SAMPLE_CREDITS, loadKeyboardSamples } from '../src/audio/keyboardSamples';
import { SYNTH_BASE, VISUAL_STYLE } from '../src/audio/keyPresets';
import { buildKeyboardSounds } from '../src/audio/sfx';

// Checks the SHIPPED creamy-thocky sprite (My Sound Pack, CC BY 4.0) straight from disk. Audio *quality/timbre* is NOT
// verified here (nobody has listened to it); these tests only guard format, levels, map consistency and loader behaviour.

const fsName = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as { readFileSync(p: URL): Uint8Array };
const file = (name: string) => readFileSync(new URL(`../public/sfx/keyboard/${name}`, import.meta.url));
const ascii = (b: Uint8Array, a: number, z: number) => String.fromCharCode(...b.subarray(a, z));

interface Entry { start: number; length: number; offset: number; duration: number; gain: number; src: string; srcStart: number; srcEnd: number }
interface SpriteMap { preset: string; file: string; sampleRate: number; channels: number; bitDepth: number; totalSamples: number; upMode?: string; sources: Record<string, { author: string; url: string; license: string; licenseUrl: string }>; entries: Record<'down' | 'up' | 'spaceDown' | 'spaceUp', Entry[]> }

function readWav(buf: Uint8Array) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  expect(ascii(buf, 0, 4)).toBe('RIFF');
  expect(ascii(buf, 8, 12)).toBe('WAVE');
  let p = 12, fmt: { ch: number; sr: number; bits: number; tag: number } | undefined, data: Float32Array | undefined;
  while (p + 8 <= buf.length) {
    const id = ascii(buf, p, p + 4), size = v.getUint32(p + 4, true), body = p + 8;
    if (id === 'fmt ') fmt = { tag: v.getUint16(body, true), ch: v.getUint16(body + 2, true), sr: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    if (id === 'data') { const n = size / 2; data = new Float32Array(n); for (let i = 0; i < n; i++) data[i] = v.getInt16(body + i * 2, true) / 32768; }
    p = body + size + (size & 1);
  }
  return { fmt: fmt!, data: data! };
}
const map = JSON.parse(new TextDecoder().decode(file('creamy-thocky.json'))) as SpriteMap;
const wav = readWav(file(map.file));
const slice = (e: Entry) => wav.data.slice(e.start, e.start + e.length).map((v) => v * e.gain);
const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const db = (v: number) => 20 * Math.log10(v);

describe('creamy-thocky sprite', () => {
  it('is 16-bit mono PCM at 48 kHz and matches its map', () => {
    expect(wav.fmt).toMatchObject({ tag: 1, ch: 1, bits: 16, sr: 48000 });
    expect(map.preset).toBe('creamy-thocky');
    expect(map.sampleRate).toBe(wav.fmt.sr);
    expect(map.totalSamples).toBe(wav.data.length);
  });

  it('has key-down clips only and declares no release sound', () => {
    expect(map.upMode).toBe('none');
    expect(map.entries.down.length).toBe(5);
    expect(map.entries.up).toEqual([]);
    expect(map.entries.spaceUp).toEqual([]);
    expect(map.entries.spaceDown).toEqual([]);
  });

  it('entries are consistent with the file and point at the pack source', () => {
    for (const e of map.entries.down) {
      expect(e.start + e.length).toBeLessThanOrEqual(wav.data.length);
      expect(Math.abs(e.offset * map.sampleRate - e.start)).toBeLessThanOrEqual(1);
      expect(Math.abs(e.duration * map.sampleRate - e.length)).toBeLessThanOrEqual(1);
      expect(e.gain).toBeGreaterThan(0);
      expect(e.gain).toBeLessThanOrEqual(1);
      expect(e.src).toBe(`mechvibes:my-sound-pack-5/${e.src.split('/')[1]}`);
      expect(e.srcEnd).toBeGreaterThan(e.srcStart);
      expect(e.duration).toBeGreaterThan(0.08);
      expect(e.duration).toBeLessThan(0.25);
    }
  });

  it('never clips and does not exceed −1 dBFS after gain', () => {
    const ceil = Math.pow(10, -1 / 20) + 1 / 32768;
    expect(peak(wav.data)).toBeLessThanOrEqual(ceil);
    for (const e of map.entries.down) expect(peak(slice(e))).toBeLessThanOrEqual(ceil);
  });

  it('clips are loudness-matched (RMS within 1 dB) after gain', () => {
    const l = map.entries.down.map((e) => db(rms(slice(e))));
    expect(Math.max(...l) - Math.min(...l)).toBeLessThan(1);
  });

  it('no clip starts or ends in audible silence, and each fades out to zero', () => {
    for (const e of map.entries.down) {
      const x = slice(e), pk = peak(x), n = 240; // 5 ms
      expect(rms(x.subarray(0, n))).toBeGreaterThan(pk * Math.pow(10, -50 / 20));
      expect(Math.abs(x[x.length - 1])).toBeLessThan(pk * 0.01);
    }
  });

  it('records source, author and license', () => {
    const s = map.sources['mechvibes:my-sound-pack-5'];
    expect(s.author).toBe('Chevy');
    expect(s.url).toBe('https://mechvibes.com/sound-packs/my-sound-pack-5');
    expect(s.license).toContain('CC BY 4.0');
    expect(s.licenseUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(KEYBOARD_SAMPLE_CREDITS).toContain('Chevy');
    expect(KEYBOARD_SAMPLE_CREDITS).toContain('CC BY 4.0');
  });

  it('CREDITS.md credits Chevy, the Mechvibes URL, the CC BY 4.0 link and the changes made', () => {
    const t = new TextDecoder().decode(file('CREDITS.md'));
    for (const needle of ['My Sound Pack', 'Chevy', 'https://mechvibes.com/sound-packs/my-sound-pack-5', 'https://creativecommons.org/licenses/by/4.0/', 'normalis']) expect(t).toContain(needle);
  });
});

describe('preset registry helpers', () => {
  it('every preset has a synth fallback and a visual style, and keeps pebble/clack unchanged', () => {
    expect(Object.keys(SYNTH_BASE).sort()).toEqual(Object.keys(VISUAL_STYLE).sort());
    expect(SYNTH_BASE.pebble).toBe('pebble');
    expect(SYNTH_BASE.clack).toBe('clack');
    expect(VISUAL_STYLE.pebble).toBe('pebble');
    expect(VISUAL_STYLE.clack).toBe('clack');
  });

  it('the synthesized fallback for creamy-thocky has sounds for every role', () => {
    class FB { private d: Float32Array; constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) { this.d = new Float32Array(length); } getChannelData() { return this.d; } }
    const ctx = { sampleRate: 48000, createBuffer: (c: number, n: number, sr: number) => new FB(c, n, sr) } as unknown as BaseAudioContext;
    const s = buildKeyboardSounds(ctx, SYNTH_BASE['creamy-thocky']);
    for (const r of ['down', 'up', 'spaceDown', 'spaceUp'] as const) expect(s[r].length).toBeGreaterThan(0);
  });
});

describe('loadKeyboardSamples("creamy-thocky")', () => {
  afterEach(() => vi.unstubAllGlobals());
  class FakeBuffer { private d: Float32Array; constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) { this.d = new Float32Array(length); } getChannelData() { return this.d; } }
  const fakeCtx = () => ({
    sampleRate: 48000,
    createBuffer: (c: number, n: number, sr: number) => new FakeBuffer(c, n, sr),
    decodeAudioData: async (ab: ArrayBuffer) => { const { data } = readWav(new Uint8Array(ab)); const b = new FakeBuffer(1, data.length, 48000); b.getChannelData().set(data); return b; },
  }) as unknown as BaseAudioContext;
  const okFetch = () => vi.fn(async (url: string) => {
    const buf = file(String(url).split('/').pop()!);
    return { ok: true, status: 200, json: async () => JSON.parse(new TextDecoder().decode(buf)), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
  });

  it('loads 5 key-down buffers; release stays empty (no key-down sound reused as release); spaceDown falls back to down', async () => {
    vi.stubGlobal('fetch', okFetch());
    const s = await loadKeyboardSamples(fakeCtx(), 'creamy-thocky');
    expect(s.down.length).toBe(5);
    expect(s.up).toEqual([]);
    expect(s.spaceUp).toEqual([]);
    expect(s.spaceDown).toBe(s.down);
    s.down.forEach((b, i) => expect(peak(b.getChannelData(0))).toBeCloseTo(peak(slice(map.entries.down[i])), 5));
  });

  it('rejects on HTTP errors (caller falls back to synth) and can be retried', async () => {
    const ctx = fakeCtx();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(loadKeyboardSamples(ctx, 'creamy-thocky')).rejects.toThrow(/HTTP 404/);
    vi.stubGlobal('fetch', okFetch());
    await expect(loadKeyboardSamples(ctx, 'creamy-thocky')).resolves.toBeTruthy();
  });

  it('rejects when the wav is corrupt', async () => {
    const f = vi.fn(async (url: string) => String(url).endsWith('.json')
      ? { ok: true, status: 200, json: async () => JSON.parse(new TextDecoder().decode(file('creamy-thocky.json'))) }
      : { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal('fetch', f);
    const ctx = { sampleRate: 48000, createBuffer: () => null, decodeAudioData: async () => { throw new Error('EncodingError'); } } as unknown as BaseAudioContext;
    await expect(loadKeyboardSamples(ctx, 'creamy-thocky')).rejects.toThrow();
  });
});
