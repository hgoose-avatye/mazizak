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
  pebble: { name: 'Gray ivory', keys: [0xd9d6cd,0xece8de,0xbdbab1,0xece8de,0xd9d6cd,0xece8de,0xc9c5bb,0xbdbab1,0xd9d6cd,0xbdbab1], tray: 0xcfcbc0, metalness: 0, caseRoughness: 0.82, roughness: 0.78, clearcoat: 0 },
  clack: { name: 'Clear ice', keys: [0xeaf4f9,0xcfe3ee,0xf7fbfd,0xcfe3ee,0xeaf4f9,0xf7fbfd,0xf7fbfd,0xcfe3ee,0xeaf4f9,0xb9d6e6], tray: 0xdcebf3, metalness: 0, caseRoughness: 0.12, roughness: 0.14, clearcoat: 0.8 },
  'creamy-thocky': { name: 'Butter cream', keys: [0xf3ead6,0xefe0bf,0xf8f1e2,0xefe0bf,0xf8f1e2,0xf3ead6,0xf8f1e2,0xefe0bf,0xf3ead6,0xe8d3a5], tray: 0xe9dcc0, metalness: 0, caseRoughness: 0.62, roughness: 0.58, clearcoat: 0.1 },
  topre: { name: 'Marshmallow', keys: [0xf4eef6,0xe3d8ee,0xfbf7f3,0xe3d8ee,0xf4eef6,0xfbf7f3,0xfbf7f3,0xe3d8ee,0xf4eef6,0xd4c4e6], tray: 0xe8e0ee, metalness: 0, caseRoughness: 0.64, roughness: 0.6, clearcoat: 0.12 },
  'turquoise-tealios': { name: 'Mint turquoise', keys: [0xf4f8f6,0x8fd6c6,0x2c9c98,0xf4f8f6,0x8fd6c6,0x2c9c98,0xf4f8f6,0xf4f8f6,0x8fd6c6,0x2c9c98], tray: 0x5fb8ad, metalness: 0.15, caseRoughness: 0.3, roughness: 0.3, clearcoat: 0.3 },
  'ibm-buckling-spring': { name: 'Terminal', keys: [0xa65b4b,0xe5dfcc,0xe5dfcc, 0xe5dfcc,0xe5dfcc,0xa8aaa2, 0xa8aaa2,0xa8aaa2,0xa8aaa2, 0xe5dfcc], tray: 0xc9c3af, metalness: 0, caseRoughness: .8, roughness: .74, clearcoat: 0 },
  'oil-king': { name: 'Midnight brass', keys: [0x22272b,0x22272b,0x32383a, 0x32383a,0xc09b54,0x22272b, 0x22272b,0x32383a,0xe1d7bd, 0x22272b], tray: 0x191f23, metalness: .85, caseRoughness: .34, roughness: .48, clearcoat: .15 },
  'boba-u4t': { name: 'Espresso', keys: [0x805645,0xdbc8a5,0xeee1c9, 0xdbc8a5,0x805645,0xdbc8a5, 0xeee1c9,0xc47d45,0x805645, 0x805645], tray: 0xd5b991, metalness: 0, caseRoughness: .6, roughness: .42, clearcoat: .24 },
  'box-jade': { name: 'Clear jade', keys: [0x9fd8bf,0xdff2e8,0x3f9a7c,0xdff2e8,0x9fd8bf,0xdff2e8,0x3f9a7c,0xdff2e8,0x9fd8bf,0xc9ecdb], tray: 0x6fb89a, metalness: 0, caseRoughness: 0.15, roughness: 0.15, clearcoat: 0.85 },
  'silent-peach-v3': { name: 'Peach fuzz', keys: [0xf6e4d8,0xfaf3ec,0xe9bfa6,0xfaf3ec,0xf6e4d8,0xfaf3ec,0xe9bfa6,0xfaf3ec,0xf6e4d8,0xe9bfa6], tray: 0xefd2bf, metalness: 0, caseRoughness: 0.88, roughness: 0.85, clearcoat: 0 },
  'mongdol-pl87w': { name: 'Sea stone', keys: [0x4a4d4f,0x5b5e60,0xcdbfa8,0x5b5e60,0x4a4d4f,0x5b5e60,0xb9aa92,0x5b5e60,0x4a4d4f,0xcdbfa8], tray: 0x3a3c3e, metalness: 0, caseRoughness: 0.62, roughness: 0.58, clearcoat: 0.1 },
  'jjigae-topre': { name: 'Cocoa stew', keys: [0xefe0c4,0xe3d0ae,0x6b4532,0xe3d0ae,0xefe0c4,0xe3d0ae,0x6b4532,0xe3d0ae,0xefe0c4,0x6b4532], tray: 0x2f2b2a, metalness: 0, caseRoughness: 0.72, roughness: 0.68, clearcoat: 0 },
  'dojagi-space65': { name: 'Celadon glaze', keys: [0xc3dccf,0xdcebe0,0x8fb8a6,0xdcebe0,0xc3dccf,0xdcebe0,0x8fb8a6,0xdcebe0,0xc3dccf,0x8fb8a6], tray: 0xb7d2c3, metalness: 0, caseRoughness: 0.28, roughness: 0.26, clearcoat: 0.55 },
};
