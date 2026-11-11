import type { KeySwitchPreset } from './sfx';

/**
 * Keyboard sound preset ids. `pebble` / `clack` are the original presets (they also have a synthesized
 * variant in sfx.ts). Further presets are recording-only and name the synthesized preset to fall back to
 * when their samples fail to load. To add one: ship `<id>.wav` + `<id>.json` in public/sfx/keyboard/,
 * add the id here, a label in KEY_PRESET_INFO (toy.ts) and a credit line in CREDITS.md.
 */
export type KeyPresetId = KeySwitchPreset | 'creamy-thocky' | 'topre';

/** Synthesized preset used as the fallback sound (and as base of the `?sfx=synth` A/B mode). */
export const SYNTH_BASE: Record<KeyPresetId, KeySwitchPreset> = {
  topre: 'pebble',
  pebble: 'pebble',
  clack: 'clack',
  'creamy-thocky': 'pebble', // soft, round "thock"
};

/** Visual key style for each preset (keys of STYLES in toys/keyboard/visual.ts). */
export const VISUAL_STYLE: Record<KeyPresetId, Exclude<KeyPresetId, 'topre'>> = {
  topre: 'pebble',
  pebble: 'pebble',
  clack: 'clack',
  'creamy-thocky': 'creamy-thocky',
};
