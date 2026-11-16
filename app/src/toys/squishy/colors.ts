/** Light-weight (no three.js): the home screen needs the swatches without loading the squishy toy. */
export interface SquishyColor {
  id: string;
  label: string;
  color: number;
  sss: number;
  tint: [number, number, number];
}

export const SQUISHY_COLORS: SquishyColor[] = [
  { id: 'pink', label: '핑크', color: 0xf0a0b2, sss: 0xff7f98, tint: [0.93, 0.84, 0.87] },
  { id: 'mint', label: '민트', color: 0x9adbc4, sss: 0x5fe0b5, tint: [0.84, 0.93, 0.89] },
  { id: 'lavender', label: '라벤더', color: 0xbcaee8, sss: 0xa07cff, tint: [0.89, 0.86, 0.95] },
  { id: 'lemon', label: '레몬', color: 0xf3dc86, sss: 0xffc23f, tint: [0.95, 0.9, 0.78] },
];
