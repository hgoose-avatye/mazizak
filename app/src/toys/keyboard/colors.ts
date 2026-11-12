import type { KeyPresetId } from '../../audio/keyPresets';

interface Colorway {
  name: string;
  keys: readonly number[]; // QWE / ASD / ZXC / space — color placement is part of each design
  tray: number;
  metalness: number;
  caseRoughness: number;
  roughness: number;
  clearcoat: number;
}

/** Individually composed keysets: placement, contrast, materials and case are designed together. */
export const KEYBOARD_COLORS: Record<KeyPresetId, Colorway> = {
  pebble: { name: 'Stoneware', keys: [0xddd7ca,0xeee9df,0xaaa89f, 0xeee9df,0xddd7ca,0xeee9df, 0xb96042,0xaaa89f,0xddd7ca, 0xaaa89f], tray: 0xd1c8b9, metalness: 0, caseRoughness: .72, roughness: .68, clearcoat: 0 },
  clack: { name: 'Arcade', keys: [0x252b38,0xf0eee8,0x252b38, 0xf0eee8,0x325bc6,0xf0eee8, 0x252b38,0xf0eee8,0xe6ca4a, 0xe35141], tray: 0x262b36, metalness: .55, caseRoughness: .3, roughness: .25, clearcoat: .55 },
  'creamy-thocky': { name: 'Pistachio cream', keys: [0xaabda3,0xeee5d3,0xeee5d3, 0xeee5d3,0xeee5d3,0xc79391, 0xeee5d3,0xaabda3,0xeee5d3, 0xc79391], tray: 0x827369, metalness: .1, caseRoughness: .64, roughness: .55, clearcoat: .1 },
  topre: { name: 'Graphite', keys: [0x747778,0x424747,0xa25b50, 0x424747,0x424747,0x747778, 0x747778,0x424747,0x424747, 0x747778], tray: 0x303535, metalness: 0, caseRoughness: .75, roughness: .7, clearcoat: 0 },
  'turquoise-tealios': { name: 'Poolside', keys: [0xe8eee5,0x75c4bc,0x1e666c, 0xe8eee5,0x75c4bc,0x1e666c, 0xe8eee5,0xe8eee5,0x75c4bc, 0x1e666c], tray: 0x6ea9a5, metalness: .65, caseRoughness: .28, roughness: .32, clearcoat: .4 },
  'ibm-buckling-spring': { name: 'Terminal', keys: [0xa65b4b,0xe5dfcc,0xe5dfcc, 0xe5dfcc,0xe5dfcc,0xa8aaa2, 0xa8aaa2,0xa8aaa2,0xa8aaa2, 0xe5dfcc], tray: 0xc9c3af, metalness: 0, caseRoughness: .8, roughness: .74, clearcoat: 0 },
  'oil-king': { name: 'Midnight brass', keys: [0x22272b,0x22272b,0x32383a, 0x32383a,0xc09b54,0x22272b, 0x22272b,0x32383a,0xe1d7bd, 0x22272b], tray: 0x191f23, metalness: .85, caseRoughness: .34, roughness: .48, clearcoat: .15 },
  'boba-u4t': { name: 'Espresso', keys: [0x805645,0xdbc8a5,0xeee1c9, 0xdbc8a5,0x805645,0xdbc8a5, 0xeee1c9,0xc47d45,0x805645, 0x805645], tray: 0xd5b991, metalness: 0, caseRoughness: .6, roughness: .42, clearcoat: .24 },
  'box-jade': { name: 'Rally green', keys: [0xe8e4d6,0x254c3f,0xe8e4d6, 0x254c3f,0xe8e4d6,0x254c3f, 0xe8e4d6,0x254c3f,0xd4d956, 0x254c3f], tray: 0x244a3b, metalness: .35, caseRoughness: .22, roughness: .22, clearcoat: .65 },
  'silent-peach-v3': { name: 'Apricot linen', keys: [0xefdfd4,0xefdfd4,0xc6c3b2, 0xdca48b,0xefdfd4,0xefdfd4, 0xc6c3b2,0xefdfd4,0xefdfd4, 0xdca48b], tray: 0xe4c6b5, metalness: 0, caseRoughness: .78, roughness: .78, clearcoat: 0 },
  'mongdol-pl87w': { name: 'Pebble white', keys: [0xeeeae2,0xd9d6cf,0xeeeae2, 0xb9b6ae,0xeeeae2,0xd9d6cf, 0xeeeae2,0xb9b6ae,0xeeeae2, 0xd9d6cf], tray: 0xdcd9d1, metalness: 0, caseRoughness: .66, roughness: .52, clearcoat: .18 },
  'jjigae-topre': { name: 'Stew pot', keys: [0x8f9291,0x646869,0xb5503c, 0x646869,0x8f9291,0x646869, 0x8f9291,0x646869,0x8f9291, 0xb5503c], tray: 0x34383a, metalness: 0, caseRoughness: .7, roughness: .7, clearcoat: 0 },
  'dojagi-space65': { name: 'Celadon glaze', keys: [0xf2f0e8,0xc9ddd6,0x3e6f8e, 0xc9ddd6,0xf2f0e8,0xc9ddd6, 0xf2f0e8,0xf2f0e8,0x3e6f8e, 0xc9ddd6], tray: 0xe6e4dc, metalness: 0, caseRoughness: .2, roughness: .16, clearcoat: .9 },
};
