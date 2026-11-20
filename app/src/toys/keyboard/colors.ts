import type { KeyPresetId } from '../../audio/keyPresets';

interface Colorway {
  name: string;
  keys: readonly number[]; // QWE / ASD / ZXC / space — color placement is part of each design
  tray: number;
  metalness: number;
  caseRoughness: number;
  roughness: number;
  clearcoat: number;
  /** game-style theme (owner, 2026-11-20 "이름에 맞춰 게임처럼"): a pattern printed on every cap top, the 10 legends (the middle
   *  row becomes the theme's icons, the space bar its name), and plate / switch colours */
  theme?: KeyTheme;
}

export type DecoPattern = 'speckle' | 'frost' | 'swirl' | 'powder' | 'chips' | 'ring' | 'blush' | 'stone' | 'bubbles' | 'grain' | 'peaches';
export interface KeyTheme {
  pattern: DecoPattern;
  /** pattern colour (CSS) */
  ink: string;
  legends: readonly string[];
  plate: number;
  switches: number;
  /** a pattern on the plate between the caps and on the case frame too, each in its own colour (owner, 2026-11-20: "틀까지 다" —
   *  an ice keyboard all ice, a mint-chocolate one all mint chocolate) */
  platePattern?: { pattern: DecoPattern; ink: string; gloss?: boolean; tile?: number };
}
// the space bar is left blank (owner, 2026-11-20: "스페이스바 글씨 없는 게 낫겠다"); `space` is kept as the design's name.
// The middle row shows the preset's three icons (public/keyboard-icons/<preset>-<n>.webp, made from docs/keyboard-icon-prompts.md;
// originals kept out of git in .keyboard-icons-original/). `_emoji` were the stand-ins before the pictures arrived.
export const ICON_PREFIX = 'img:';
const row = (preset: string, _emoji: [string, string, string], _space: string) =>
  ['만', '지', '작', ...[1, 2, 3].map((n) => `${ICON_PREFIX}./keyboard-icons/${preset}-${n}.webp`), '1', '2', '3', ''];

/** Individually composed keysets: placement, contrast, materials and case are designed together. */
export const KEYBOARD_COLORS: Record<KeyPresetId, Colorway> = {
  pebble: { name: 'Gray ivory', keys: [0xd9d6cd,0xece8de,0xbdbab1,0xece8de,0xd9d6cd,0xece8de,0xc9c5bb,0xbdbab1,0xd9d6cd,0xbdbab1], tray: 0xb8a385 /* a brownish pebble frame (owner, 2026-11-20) */, metalness: 0, caseRoughness: 0.82, roughness: 0.78, clearcoat: 0 , theme: { pattern: 'speckle', ink: 'rgba(70,66,60,0.55)', legends: row('pebble', ['🪨', '🌿', '💧'], '조약돌'), plate: 0xa18c70, switches: 0x8a7a64, platePattern: { pattern: 'speckle', ink: 'rgba(72,56,40,0.55)', tile: 120 } } },
  clack: { name: 'Clear ice', keys: [0xeaf4f9,0xcfe3ee,0xf7fbfd,0xcfe3ee,0xeaf4f9,0xf7fbfd,0xf7fbfd,0xcfe3ee,0xeaf4f9,0xb9d6e6], tray: 0x8ccbec /* bluer, glossy ice (owner, 2026-11-20) */, metalness: 0, caseRoughness: 0.12, roughness: 0.14, clearcoat: 0.8 , theme: { pattern: 'frost', ink: 'rgba(255,255,255,0.85)', legends: row('clack', ['❄️', '🧊', '💎'], '❄ 얼음 ❄'), plate: 0x7fc3e8, switches: 0xd6ecf6, platePattern: { pattern: 'frost', ink: 'rgba(255,255,255,0.9)', gloss: true } } },
  'creamy-thocky': { name: 'Butter cream', keys: [0xf3ead6,0xefe0bf,0xf8f1e2,0xefe0bf,0xf8f1e2,0xf3ead6,0xf8f1e2,0xefe0bf,0xf3ead6,0xe8d3a5], tray: 0xe9dcc0, metalness: 0, caseRoughness: 0.62, roughness: 0.58, clearcoat: 0.1 , theme: { pattern: 'swirl', ink: 'rgba(255,250,235,0.9)', legends: row('creamy-thocky', ['🍰', '🧁', '🍦'], '크림'), plate: 0xc9a46e, switches: 0xf3e6c8 } },
  topre: { name: 'Marshmallow', keys: [0xf4eef6,0xe3d8ee,0xfbf7f3,0xe3d8ee,0xf4eef6,0xfbf7f3,0xfbf7f3,0xe3d8ee,0xf4eef6,0xd4c4e6], tray: 0xe8e0ee, metalness: 0, caseRoughness: 0.64, roughness: 0.6, clearcoat: 0.12 , theme: { pattern: 'powder', ink: 'rgba(255,255,255,0.9)', legends: row('topre', ['☁️', '🍡', '💗'], '마시멜로'), plate: 0xc7b3dd, switches: 0xf5eefb } },
  'turquoise-tealios': { name: 'Mint chocolate', keys: [0xa8e6cf,0x8fdcc2,0xa8e6cf,0x8fdcc2,0x6b4532,0x8fdcc2,0xa8e6cf,0x8fdcc2,0xa8e6cf,0x6b4532], tray: 0x86d3b6, metalness: 0, caseRoughness: 0.7, roughness: 0.66, clearcoat: 0 , theme: { pattern: 'chips', ink: 'rgba(88,52,34,0.95)', legends: row('turquoise-tealios', ['🍃', '🍫', '🌱'], '민트초코'), plate: 0x9fe0c6, switches: 0x6b4532, platePattern: { pattern: 'chips', ink: 'rgba(88,52,34,0.95)', tile: 72 } } },
  'ibm-buckling-spring': { name: 'Typewriter', keys: [0x2b2b2d,0x2b2b2d,0x2b2b2d, 0x2b2b2d,0xa6392f,0x2b2b2d, 0x2b2b2d,0x2b2b2d,0x2b2b2d, 0x2b2b2d], tray: 0x9ea2a6, metalness: .9, caseRoughness: .32, roughness: .35, clearcoat: .5 , theme: { pattern: 'ring', ink: 'rgba(205,210,214,0.95)', legends: row('ibm-buckling-spring', ['✉️', '✒️', '📜'], '타자기'), plate: 0x2a2a2c, switches: 0x4a4a4e } },
  'oil-king': { name: 'Midnight brass', keys: [0x22272b,0x22272b,0x32383a, 0x32383a,0xc09b54,0x22272b, 0x22272b,0x32383a,0xe1d7bd, 0x22272b], tray: 0x191f23, metalness: .85, caseRoughness: .34, roughness: .48, clearcoat: .15 },
  'boba-u4t': { name: 'Espresso', keys: [0x805645,0xdbc8a5,0xeee1c9, 0xdbc8a5,0x805645,0xdbc8a5, 0xeee1c9,0xc47d45,0x805645, 0x805645], tray: 0xd5b991, metalness: 0, caseRoughness: .6, roughness: .42, clearcoat: .24 },
  'box-jade': { name: 'Clear jade', keys: [0x9fd8bf,0xdff2e8,0x3f9a7c,0xdff2e8,0x9fd8bf,0xdff2e8,0x3f9a7c,0xdff2e8,0x9fd8bf,0xc9ecdb], tray: 0x6fb89a, metalness: 0, caseRoughness: 0.3, roughness: 0.28, clearcoat: 0.45 },
  'silent-peach-v3': { name: 'Peach fuzz', keys: [0xf6e4d8,0xfaf3ec,0xe9bfa6,0xfaf3ec,0xf6e4d8,0xfaf3ec,0xe9bfa6,0xfaf3ec,0xf6e4d8,0xe9bfa6], tray: 0xf8d9c6, metalness: 0, caseRoughness: 0.88, roughness: 0.85, clearcoat: 0 , theme: { pattern: 'blush', ink: 'rgba(255,140,150,0.45)', legends: row('silent-peach-v3', ['🍑', '🌸', '💕'], '복숭아'), plate: 0xf6c9b4, switches: 0xf6d6c6, platePattern: { pattern: 'peaches', ink: '', tile: 120 } } },
  'mongdol-pl87w': { name: 'Sea stone', keys: [0x3f4244,0x4c4f51,0x8a8d8e,0x4c4f51,0x3f4244,0x4c4f51,0xa5a7a6,0x4c4f51,0x3f4244,0x8a8d8e], tray: 0xc4c2bd /* light grey stone frame (owner, 2026-11-20) */, metalness: 0, caseRoughness: 0.9, roughness: 0.95, clearcoat: 0 , theme: { pattern: 'stone', ink: 'rgba(230,232,232,0.35)', legends: row('mongdol-pl87w', ['🌊', '🐚', '⚫'], '몽돌'), plate: 0xaeaca7, switches: 0x8a8884, platePattern: { pattern: 'speckle', ink: 'rgba(78,76,72,0.55)' } } },
  'jjigae-topre': { name: 'Kimchi stew', keys: [0xe8553a,0xf07a3c,0xe8553a,0xf6efe2,0xe8553a,0xf6efe2,0xf07a3c,0xe8553a,0xf07a3c,0xd8432c] /* stew in a stainless pot: brushed steel case (owner, 2026-11-20; was a dark earthenware pot) */, tray: 0xc9ced3, metalness: 0.92, caseRoughness: 0.26, roughness: 0.7, clearcoat: 0 , theme: { pattern: 'bubbles', ink: 'rgba(255,255,255,0.75)', legends: row('jjigae-topre', ['🔥', '🌶️', '🍲'], '보글보글 찌개'), plate: 0x55595e, switches: 0x7a7f85 } },
  'dojagi-space65': { name: 'Tofu & soy', keys: [0xfaf8f1,0xf1ede2,0xfaf8f1,0xf1ede2,0xfaf8f1,0xe6dfcf,0xf1ede2,0xfaf8f1,0xf1ede2,0xf4f0e6] /* a tofu-white space bar too (owner, 2026-11-20; was soy brown) */, tray: 0xf0cf63 /* a yellow tofu mould (owner, 2026-11-20; was dark wood) */, metalness: 0, caseRoughness: 0.55, roughness: 0.92, clearcoat: 0 , theme: { pattern: 'grain', ink: 'rgba(160,138,100,0.5)', legends: row('dojagi-space65', ['🥢', '🫘', '🍚'], '두부'), plate: 0xd6ae45, switches: 0xe8c35a } },
};
