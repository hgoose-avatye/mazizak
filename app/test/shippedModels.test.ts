import { describe, expect, it } from "vitest";
import { FIDGETS } from "../src/toys/fidgets/catalog";
import { SHIPPED_MODELS } from "../src/toys/fidgets/references";

// 모닝빵 (S02) / 찹쌀떡 (S03) ship with a packed reference model (public/models/). These tests guard the files and the record of the owner's permission;
// they cannot (and do not) verify the permission itself.
// node:fs via a dynamic specifier so `tsc` needs no @types/node (same pattern as the other sample tests)
const fsName = "node:fs";
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ fsName)) as { readFileSync(p: URL): Uint8Array; readdirSync(p: URL): string[] };
const pub = (name: string) => new URL(`../public/${name}`, import.meta.url);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
function glb(b: Uint8Array) {
  expect(new TextDecoder().decode(b.subarray(0, 4))).toBe("glTF");
  expect(u32(b, 4)).toBe(2);
  expect(u32(b, 8)).toBe(b.length);
  const len = u32(b, 12);
  expect(u32(b, 16)).toBe(0x4e4f534a);
  return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len)));
}

describe("shipped 모닝빵 / 찹쌀떡 models", () => {
  it("are listed for exactly the two toys and every listed file exists", () => {
    expect(Object.keys(SHIPPED_MODELS).sort()).toEqual(["S02", "S03"]);
    for (const id of Object.keys(SHIPPED_MODELS)) expect(FIDGETS.some((f) => f.id === id)).toBe(true);
    expect(readdirSync(pub("models/")).filter((f) => f.endsWith(".glb")).sort()).toEqual(Object.values(SHIPPED_MODELS).map((p) => p.replace("models/", "")).sort());
  });
  describe.each(Object.entries(SHIPPED_MODELS))("%s %s", (_id, rel) => {
    const bytes = readFileSync(pub(rel));
    const json = glb(bytes);
    it("is a small valid glb with one textured mesh the game can read", () => {
      expect(bytes.length).toBeLessThan(1_000_000);
      expect(json.meshes).toHaveLength(1);
      const prim = json.meshes[0].primitives[0];
      expect(Object.keys(prim.attributes).sort()).toEqual(["POSITION", "TEXCOORD_0"]);
      expect(prim.indices).toBeDefined();
      expect(json.accessors[prim.attributes.POSITION].count).toBeGreaterThan(1000);
      expect(json.accessors[prim.attributes.POSITION].count).toBeLessThan(20000); // the vertices are moved in JS every frame
      expect(json.images).toHaveLength(1);
      expect(json.images[0].mimeType).toBe("image/jpeg");
      expect(json.materials[0].pbrMetallicRoughness.baseColorTexture).toBeDefined();
    });
    it("is described in models.json with the owner's permission record", () => {
      const m = JSON.parse(new TextDecoder().decode(readFileSync(pub("models/models.json"))));
      expect(m.clearance).toMatchObject({ statedBy: "project owner", statedOn: "2026-11-16" });
      const e = m.models.find((x: { file: string }) => rel.endsWith(x.file));
      expect(e).toBeDefined();
      expect(e.packed.bytes).toBe(bytes.length);
      expect(e.packed.texture.width).toBeLessThanOrEqual(1024);
    });
  });
  it("are named in the settings sheet", () => {
    const html = new TextDecoder().decode(readFileSync(new URL("../index.html", import.meta.url)));
    expect(html).toContain("모닝빵·찹쌀떡 3D 모델");
  });
});
