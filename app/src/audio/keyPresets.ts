import type { KeySwitchPreset } from './sfx';
import type { LocalKeyPresetId } from './localKeyPresets';

/**
 * Keyboard sound preset ids. `pebble` / `clack` are the original presets (they also have a synthesized
 * variant in sfx.ts). Further presets are recording-only and name the synthesized preset to fall back to
 * when their samples fail to load. To add one: ship `<id>.wav` + `<id>.json` in public/sfx/keyboard/,
 * add the id here, a label in KEY_PRESET_INFO (toy.ts) and a credit line in CREDITS.md.
 */
export type KeyPresetId = KeySwitchPreset | 'creamy-thocky' | 'topre' | 'turquoise-tealios' | 'ibm-buckling-spring' | LocalKeyPresetId;

/** Synthesized preset used as the fallback sound (and as base of the `?sfx=synth` A/B mode). */
export const SYNTH_BASE: Record<KeyPresetId, KeySwitchPreset> = {
  'mongdol-pl87w': 'pebble', 'jjigae-topre': 'pebble', 'dojagi-space65': 'clack', 'oil-king': 'pebble', 'turquoise-tealios': 'clack', 'boba-u4t': 'pebble', 'box-jade': 'clack', 'silent-peach-v3': 'pebble', 'ibm-buckling-spring': 'clack',
  topre: 'pebble',
  pebble: 'pebble',
  clack: 'clack',
  'creamy-thocky': 'pebble', // soft, round "thock"
};

export type KeyVisualStyle = KeyPresetId;

/** Visual key style for each preset (keys of STYLES in toys/keyboard/visual.ts). */
export const VISUAL_STYLE: Record<KeyPresetId, KeyVisualStyle> = {
  'pebble': 'pebble',
  'clack': 'clack',
  'creamy-thocky': 'creamy-thocky',
  'topre': 'topre',
  'turquoise-tealios': 'turquoise-tealios',
  'ibm-buckling-spring': 'ibm-buckling-spring',
  'mongdol-pl87w': 'mongdol-pl87w',
  'jjigae-topre': 'jjigae-topre',
  'dojagi-space65': 'dojagi-space65',
  'oil-king': 'oil-king',
  'boba-u4t': 'boba-u4t',
  'box-jade': 'box-jade',
  'silent-peach-v3': 'silent-peach-v3',
};
