import { afterEach, expect, it, vi } from "vitest";
import {
  CLEARED_KEY_PRESETS,
  LOCAL_KEY_PRESETS,
  LOCAL_KEY_PRESETS_ENABLED,
  isKeyPresetEnabled,
  isRetiredKeyPreset,
} from "../src/audio/localKeyPresets";
import { loadKeyboardSamples } from "../src/audio/keyboardSamples";

afterEach(() => vi.unstubAllGlobals());

it("enables the owner-cleared presets in every build and keeps the other local choices disabled unless the dev server enables them", () => {
  expect(LOCAL_KEY_PRESETS_ENABLED).toBe(false);
  expect([...CLEARED_KEY_PRESETS].sort()).toEqual(["dojagi-space65", "jjigae-topre", "mongdol-pl87w", "silent-peach-v3"]);
  for (const id of Object.keys(LOCAL_KEY_PRESETS))
    expect(isKeyPresetEnabled(id), id).toBe(CLEARED_KEY_PRESETS.has(id));
  for (const id of ["pebble", "clack", "creamy-thocky", "topre"])
    expect(isKeyPresetEnabled(id)).toBe(true);
});

it("a local preset that is NOT cleared cannot be fetched through any base URL when local mode is disabled", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  // no such preset is left in the table (the retired ones reject earlier); the guard is exercised with a made-up local id
  const local = LOCAL_KEY_PRESETS as Record<string, unknown>;
  local["not-cleared-test"] = { id: "KXX", label: "x", sensoryExpression: "x", onomatopoeia: "x", tags: [], classification: "x" };
  try {
    await expect(
      loadKeyboardSamples({} as BaseAudioContext, "not-cleared-test" as never, "/sfx/keyboard/"),
    ).rejects.toThrow("Local-only preset is disabled");
  } finally {
    delete local["not-cleared-test"];
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("reserves Oil King and Boba slots without fetching their retained assets", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const id of ["oil-king", "boba-u4t"] as const) {
    expect(isRetiredKeyPreset(id)).toBe(true);
    expect(isKeyPresetEnabled(id)).toBe(false);
    await expect(
      loadKeyboardSamples({} as BaseAudioContext, id),
    ).rejects.toThrow("Reserved keyboard slot");
  }
  expect(fetch).not.toHaveBeenCalled();
});
