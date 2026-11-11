import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadKeyboardSamples } from '../src/audio/keyboardSamples';
import { topreRole, topreRow } from '../src/audio/keyboardRouting';

const fsName = 'node:fs', cryptoName = 'node:crypto';
const { readFileSync } = await import(/* @vite-ignore */ fsName);
const { createHash } = await import(/* @vite-ignore */ cryptoName);
const file = (name: string): Uint8Array => readFileSync(new URL(`../public/sfx/keyboard/${name}`, import.meta.url));
const map = JSON.parse(new TextDecoder().decode(file('topre.json')));
const bytes = file('topre.wav');
const wav = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
class BufferStub {
  private data: Float32Array;
  constructor(readonly length: number, readonly sampleRate: number) { this.data = new Float32Array(length); }
  getChannelData() { return this.data; }
}
const ctx = () => ({
  createBuffer: (_: number, n: number, sr: number) => new BufferStub(n, sr),
  decodeAudioData: async () => {
    const b = new BufferStub((bytes.length - 44) / 2, 48000);
    for (let i = 0; i < b.length; i++) b.getChannelData()[i] = wav.getInt16(44 + i * 2, true) / 32768;
    return b;
  },
}) as unknown as BaseAudioContext;
afterEach(() => vi.unstubAllGlobals());

describe('Topre source and sprite integrity', () => {
  it('preserves all 12 original MP3s with pinned source hashes', () => {
    const entries = Object.values(map.entries).flat() as { src: string; sha256: string }[];
    expect(entries).toHaveLength(12);
    expect(new Set(entries.map(e => e.src)).size).toBe(12);
    for (const e of entries) {
      const source = readFileSync(new URL(`../scripts/kbsamples/source/topre/${e.src}`, import.meta.url));
      expect(createHash('sha256').update(source).digest('hex')).toBe(e.sha256);
    }
  });
  it('has valid mono 48 kHz 16-bit slices, including every dedicated role', () => {
    expect(wav.getUint16(20, true)).toBe(1);
    expect(wav.getUint16(22, true)).toBe(1);
    expect(wav.getUint32(24, true)).toBe(48000);
    expect(wav.getUint16(34, true)).toBe(16);
    expect(wav.getUint32(40, true)).toBe(map.totalSamples * 2);
    expect(map.entries.down).toHaveLength(5);
    for (const role of ['up', 'spaceDown', 'spaceUp', 'enterDown', 'enterUp', 'backspaceDown', 'backspaceUp']) expect(map.entries[role]).toHaveLength(1);
    for (const e of Object.values(map.entries).flat() as { start: number; length: number; offset: number; duration: number }[]) {
      expect(e.length).toBeGreaterThan(100);
      expect(e.start + e.length).toBeLessThanOrEqual(map.totalSamples);
      expect(e.offset * 48000).toBeCloseTo(e.start, 5);
      expect(e.duration * 48000).toBeCloseTo(e.length, 5);
      let peak = 0;
      for (let i = e.start; i < e.start + e.length; i++) peak = Math.max(peak, Math.abs(wav.getInt16(44 + i * 2, true)));
      expect(peak).toBeGreaterThan(100);
      expect(peak).toBeLessThan(32767);
    }
  });
  it('preserves the complete MIT notice and flags uncertain recording provenance', () => {
    const license = new TextDecoder().decode(file('topre-LICENSE.md'));
    const original = readFileSync(new URL('../scripts/kbsamples/source/topre/LICENSE.md', import.meta.url), 'utf8');
    expect(license).toBe(original);
    expect(license).toContain('Copyright (c) Thomas Lai');
    expect(license).toContain('THE SOFTWARE IS PROVIDED');
    expect(map.source.recordingProvenance).toContain('Unverified');
    expect(new TextDecoder().decode(file('CREDITS.md'))).toContain('Recording rights provenance: unverified');
  });
  it('loads precisely 12 buffers and reuses the same five down buffers for row routing', async () => {
    const fetch = vi.fn(async (url: string) => ({ ok: true, json: async () => map, arrayBuffer: async () => file(url.split('/').pop()!).buffer }));
    vi.stubGlobal('fetch', fetch);
    const c = ctx();
    const create = vi.spyOn(c, 'createBuffer');
    const sounds = await loadKeyboardSamples(c, 'topre');
    expect(create).toHaveBeenCalledTimes(12);
    expect(sounds.rowDown).toBe(sounds.down);
    sounds.down.forEach((b, i) => expect(b.length).toBe(map.entries.down[i].length));
    for (const role of ['enterDown', 'enterUp', 'backspaceDown', 'backspaceUp'] as const) expect(sounds[role]).toHaveLength(1);
    expect(await loadKeyboardSamples(c, 'topre')).toBe(sounds);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('Topre fullsize row and key roles', () => {
  it.each([['F1', 0], ['Escape', 0], ['Digit1', 1], ['Equal', 1], ['KeyQ', 2], ['KeyP', 2], ['KeyA', 3], ['Quote', 3], ['KeyZ', 4], ['ShiftRight', 4], ['ArrowLeft', 4]] as const)('%s uses R%i and the common keyup', (code, row) => {
    expect(topreRow(code)).toBe(row);
    expect(topreRole(code, 'Down')).toBe(`downR${row}`);
    expect(topreRole(code, 'Up')).toBe('up');
  });
  it.each([['Space', 'space'], ['Enter', 'enter'], ['NumpadEnter', 'enter'], ['Backspace', 'backspace']])('%s uses its dedicated pair', (code, role) => {
    expect(topreRole(code, 'Down')).toBe(`${role}Down`);
    expect(topreRole(code, 'Up')).toBe(`${role}Up`);
  });
  it('does not consume unsupported physical codes', () => expect(topreRole('AudioVolumeUp', 'Down')).toBeUndefined());
});
