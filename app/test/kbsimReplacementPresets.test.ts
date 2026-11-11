import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadKeyboardSamples } from '../src/audio/keyboardSamples';
import { isLocalKeyPreset, isKeyPresetEnabled } from '../src/audio/localKeyPresets';
import { isKbsimMappedPreset } from '../src/audio/keyboardRouting';

const fsName = 'node:fs', cryptoName = 'node:crypto';
const { readFileSync } = await import(/* @vite-ignore */ fsName);
const { createHash } = await import(/* @vite-ignore */ cryptoName);
const file = (name: string): Uint8Array => readFileSync(new URL(`../public/sfx/keyboard/${name}`, import.meta.url));
afterEach(() => vi.unstubAllGlobals());

for (const [id, upstream] of [['turquoise-tealios', 'turquoise'], ['ibm-buckling-spring', 'buckling']] as const) {
  describe(id, () => {
    const map = JSON.parse(new TextDecoder().decode(file(`${id}.json`)));
    const bytes = file(map.file);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    it('preserves the 12 source hashes, five rows and all special press/release pairs', () => {
      expect(map.source.path).toBe(`src/assets/audio/${upstream}`);
      expect(map.entries.down.map((e: { src: string }) => e.src)).toEqual(Array.from({ length: 5 }, (_, i) => `press/GENERIC_R${i}.mp3`));
      const entries = Object.values(map.entries).flat() as { src: string; sha256: string; start: number; length: number; offset: number; duration: number }[];
      expect(entries).toHaveLength(12);
      expect(new Set(entries.map(e => e.src)).size).toBe(12);
      for (const role of ['up', 'spaceDown', 'spaceUp', 'enterDown', 'enterUp', 'backspaceDown', 'backspaceUp']) expect(map.entries[role]).toHaveLength(1);
      for (const e of entries) {
        const original = readFileSync(new URL(`../scripts/kbsamples/source/${id}/${e.src}`, import.meta.url));
        expect(createHash('sha256').update(original).digest('hex')).toBe(e.sha256);
        expect(e.start + e.length).toBeLessThanOrEqual(map.totalSamples);
        expect(e.offset * 48000).toBeCloseTo(e.start);
        expect(e.duration * 48000).toBeCloseTo(e.length);
        let peak = 0;
        for (let i = e.start; i < e.start + e.length; i++) peak = Math.max(peak, Math.abs(view.getInt16(44 + i * 2, true)));
        expect(peak).toBeGreaterThan(100);
        expect(peak).toBeLessThan(32767);
      }
      expect(view.getUint16(22, true)).toBe(1);
      expect(view.getUint32(24, true)).toBe(48000);
      expect(view.getUint16(34, true)).toBe(16);
    });

    it('loads actual recorded keyups and special keys without local-only mode', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => map, arrayBuffer: async () => bytes.buffer })));
      class Buf {
        private data: Float32Array;
        constructor(readonly length: number, readonly sampleRate: number) { this.data = new Float32Array(length); }
        getChannelData() { return this.data; }
      }
      const ctx = {
        createBuffer: (_: number, n: number, sr: number) => new Buf(n, sr),
        decodeAudioData: async () => {
          const b = new Buf(map.totalSamples, 48000);
          for (let i = 0; i < map.totalSamples; i++) b.getChannelData()[i] = view.getInt16(44 + i * 2, true) / 32768;
          return b;
        },
      } as unknown as BaseAudioContext;
      const s = await loadKeyboardSamples(ctx, id);
      expect(s.rowDown).toBe(s.down);
      expect(s.down).toHaveLength(5);
      for (const role of ['up', 'spaceDown', 'spaceUp', 'enterDown', 'enterUp', 'backspaceDown', 'backspaceUp'] as const) expect(s[role]).toHaveLength(1);
      expect(isLocalKeyPreset(id)).toBe(false);
      expect(isKeyPresetEnabled(id)).toBe(true);
      expect(isKbsimMappedPreset(id)).toBe(true);
    });

    it('preserves the full upstream MIT notice', () => {
      const license = new TextDecoder().decode(file('kbsim-LICENSE.md'));
      expect(license).toBe(readFileSync(new URL(`../scripts/kbsamples/source/${id}/LICENSE.md`, import.meta.url), 'utf8'));
      expect(license).toContain('Copyright (c) Thomas Lai');
      expect(map.source.license).toBe('MIT');
    });
  });
}
