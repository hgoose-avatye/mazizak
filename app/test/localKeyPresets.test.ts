import { afterEach, expect, it, vi } from "vitest";
import {
  LOCAL_KEY_PRESETS,
  LOCAL_KEY_PRESETS_ENABLED,
  isKeyPresetEnabled,
  isRetiredKeyPreset,
} from "../src/audio/localKeyPresets";
import { loadKeyboardSamples } from "../src/audio/keyboardSamples";

afterEach(() => vi.unstubAllGlobals());

it("keeps all four local-only choices disabled unless explicitly enabled by the dev server", () => {
  expect(LOCAL_KEY_PRESETS_ENABLED).toBe(false);
  for (const id of Object.keys(LOCAL_KEY_PRESETS))
    expect(isKeyPresetEnabled(id)).toBe(false);
  for (const id of ["pebble", "clack", "creamy-thocky", "topre"])
    expect(isKeyPresetEnabled(id)).toBe(true);
});

it("cannot fetch local samples through an alternate base URL when local mode is disabled", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const preset of ["silent-peach-v3"] as const) {
    await expect(
      loadKeyboardSamples({} as BaseAudioContext, preset, "/sfx/keyboard/"),
    ).rejects.toThrow("Local-only preset is disabled");
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
