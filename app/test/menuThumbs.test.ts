import { describe, expect, it } from "vitest";
import { FIDGETS } from "../src/toys/fidgets/catalog";
import { KEYBOARD_COLORS } from "../src/toys/keyboard/colors";
import { isKeyPresetEnabled, isLocalKeyPreset } from "../src/audio/localKeyPresets";

// Menu card thumbnails: renders of the app's own toys (scripts/make-thumbs.mjs → public/thumbs/menu/)
// node:fs via a dynamic specifier so `tsc` needs no @types/node (same pattern as the other sample tests)
const fsName = "node:fs";
const fs = (await import(/* @vite-ignore */ fsName)) as {
  readFileSync(p: URL): Uint8Array;
  readdirSync(p: URL): string[];
  existsSync(p: URL): boolean;
};
const dir = new URL("../public/thumbs/menu/", import.meta.url);
// the presets of the public build: the open-licence ones plus the owner-cleared ones (isKeyPresetEnabled is false for retired / dev-only presets)
const publicPresets = Object.keys(KEYBOARD_COLORS).filter((p) => isKeyPresetEnabled(p));
const expected = [...FIDGETS.map((f) => f.id), ...publicPresets.map((p) => `kb-${p}`)];
const jpegSize = (b: Uint8Array) => {
  expect([b[0], b[1]]).toEqual([0xff, 0xd8]); // JPEG start of image
  const u16 = (i: number) => (b[i] << 8) | b[i + 1];
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xc3) return { h: u16(i + 5), w: u16(i + 7) };
    i += 2 + u16(i + 2);
  }
  throw new Error("no JPEG frame header");
};

describe("menu thumbnails", () => {
  it("every toy and every public key preset has one; presets that are not in the public build must not ship one", () => {
    expect(publicPresets.length).toBeGreaterThanOrEqual(10); // 옥구슬 retired 2026-11-18
    for (const name of expected) expect(fs.existsSync(new URL(`${name}.jpg`, dir)), `${name}.jpg`).toBe(true);
    for (const p of Object.keys(KEYBOARD_COLORS).filter((p) => isLocalKeyPreset(p) && !isKeyPresetEnabled(p))) expect(fs.existsSync(new URL(`kb-${p}.jpg`, dir)), `kb-${p}.jpg (not in the public build)`).toBe(false);
  });
  it("are 256×256 JPEGs under 60 KB, and no file is left over from a removed toy", () => {
    const files = fs.readdirSync(dir).filter((f: string) => !f.startsWith("."));
    expect(files.sort()).toEqual(expected.map((n) => `${n}.jpg`).sort());
    for (const f of files) {
      const b = fs.readFileSync(new URL(f, dir));
      expect(b.length, f).toBeLessThan(60000);
      expect(jpegSize(b), f).toEqual({ w: 256, h: 256 });
    }
  });
});
