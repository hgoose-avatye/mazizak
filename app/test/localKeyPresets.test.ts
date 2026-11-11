import { afterEach, expect, it, vi } from 'vitest';
import { LOCAL_KEY_PRESETS, LOCAL_KEY_PRESETS_ENABLED, isKeyPresetEnabled } from '../src/audio/localKeyPresets';
import { loadKeyboardSamples } from '../src/audio/keyboardSamples';

afterEach(() => vi.unstubAllGlobals());

it('keeps all four local-only choices disabled unless explicitly enabled by the dev server', () => {
  expect(LOCAL_KEY_PRESETS_ENABLED).toBe(false);
  for (const id of Object.keys(LOCAL_KEY_PRESETS)) expect(isKeyPresetEnabled(id)).toBe(false);
  for (const id of ['pebble', 'clack', 'creamy-thocky', 'topre']) expect(isKeyPresetEnabled(id)).toBe(true);
});

it('cannot fetch local samples through an alternate base URL when local mode is disabled', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const preset of ['oil-king', 'silent-peach-v3'] as const) {
    await expect(loadKeyboardSamples({} as BaseAudioContext, preset, '/sfx/keyboard/')).rejects.toThrow('Local-only preset is disabled');
  }
  expect(fetch).not.toHaveBeenCalled();
});
