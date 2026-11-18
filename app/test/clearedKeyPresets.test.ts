import { afterEach, describe, expect, it, vi } from "vitest";
import { loadKeyboardSamples } from "../src/audio/keyboardSamples";
import { CLEARED_KEY_PRESETS, isKeyPresetEnabled } from "../src/audio/localKeyPresets";

// 옥구슬 · 복숭아 · 몽돌 · 찌개 · 도자기: third-party recordings the project owner obtained permission to use in the public build (2026-11-16).
// These tests guard the shipped files and the record of that permission; they cannot (and do not) verify the permission itself.
// node:fs via a dynamic specifier so `tsc` needs no @types/node (same pattern as the other sample tests)
const fsName = "node:fs";
const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as { readFileSync(p: URL): Uint8Array };
const file = (name: string) => readFileSync(new URL(`../audio-src/sfx/keyboard/${name}`, import.meta.url));
const json = (id: string) => JSON.parse(new TextDecoder().decode(file(`${id}.json`)));
afterEach(() => vi.unstubAllGlobals());

describe.each([...CLEARED_KEY_PRESETS])("cleared preset %s", (id) => {
  const map = json(id);
  const bytes = file(map.file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = (bytes.length - 44) / 2;

  it("ships a 48 kHz mono 16-bit sprite whose entries lie inside it, key-down only", () => {
    expect(map.file).toBe(`${id}.wav`);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(map.upMode).toBe("none");
    expect(map.entries.down.length).toBeGreaterThan(0);
    for (const role of Object.keys(map.entries))
      for (const e of map.entries[role] as { offset: number; duration: number }[]) {
        expect(e.offset).toBeGreaterThanOrEqual(0);
        expect((e.offset + e.duration) * 48000).toBeLessThanOrEqual(samples + 1);
        let peak = 0;
        const i0 = Math.round(e.offset * 48000);
        for (let i = i0; i < Math.min(samples, i0 + Math.round(e.duration * 48000)); i++) peak = Math.max(peak, Math.abs(view.getInt16(44 + i * 2, true)));
        expect(peak, `${id} entry at ${e.offset}s is silent`).toBeGreaterThan(100);
        expect(peak, `${id} entry at ${e.offset}s clips`).toBeLessThan(32767);
      }
  });

  it("carries the owner's permission record instead of the local-only marker, and no local path", () => {
    const text = JSON.stringify(map);
    // 복숭아 is the owner's own recording since 2026-11-18 (scripts/kbsamples/build-own-peach.py); the others are third-party recordings the owner cleared
    const own = id === "silent-peach-v3";
    expect(map.clearance).toMatchObject({ statedBy: "project owner", statedOn: own ? "2026-11-18" : "2026-11-16" });
    expect(map.usage).toBeUndefined();
    expect(map.rights).toBeUndefined();
    expect(text).not.toMatch(/LOCAL_DEVELOPMENT_ONLY|NOT_FOR_PUBLIC_DISTRIBUTION|\/Users\/|\/private\//);
    if (!own) expect(map.credit.url).toMatch(/^https:\/\//);
  });

  it("is enabled in every build and loads from the shipped folder, never from the dev route", async () => {
    expect(isKeyPresetEnabled(id)).toBe(true);
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      urls.push(u);
      return { ok: true, json: async () => map, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    }));
    class Buf {
      private data: Float32Array;
      constructor(readonly length: number, readonly sampleRate: number) { this.data = new Float32Array(length); }
      getChannelData() { return this.data; }
    }
    const ctx = {
      createBuffer: (_: number, n: number, sr: number) => new Buf(n, sr),
      decodeAudioData: async () => {
        const b = new Buf(samples, 48000);
        for (let i = 0; i < samples; i++) b.getChannelData()[i] = view.getInt16(44 + i * 2, true) / 32768;
        return b;
      },
    } as unknown as BaseAudioContext;
    const s = await loadKeyboardSamples(ctx, id as never);
    expect(s.down.length).toBe(map.entries.down.length);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u.startsWith("./sfx/keyboard/"), u).toBe(true);
      expect(u).not.toContain("__local-keyboard");
    }
  });
});
