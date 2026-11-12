/** Unverified recordings are served from outside the repository by the opt-in Vite dev server only. */
export const LOCAL_KEY_PRESETS_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_KEY_PRESETS === "1";
export const LOCAL_KEY_PRESETS = {
  "oil-king": {
    id: "K05",
    label: "Oil King",
    sensoryExpression: "묵직한 돌멩이",
    onomatopoeia: "둑둑·퉁퉁",
    tags: ["deep", "heavy", "thocky"],
    classification: "Linear",
  },
  "boba-u4t": {
    id: "K07",
    label: "Boba U4T",
    sensoryExpression: "찰진 가래떡·절구공이",
    onomatopoeia: "도각·톡톡",
    tags: ["tactile", "punchy", "poppy"],
    classification: "Tactile",
  },
  "box-jade": {
    id: "K08",
    label: "BOX Jade",
    sensoryExpression: "유리구슬·방울",
    onomatopoeia: "찰칵·챙",
    tags: ["clicky", "sharp", "click-bar"],
    classification: "Clicky",
  },
  "silent-peach-v3": {
    id: "K09",
    label: "Peach V3",
    sensoryExpression: "솜사탕·모래사장",
    onomatopoeia: "푹·톡",
    tags: ["silent", "soft", "muted"],
    classification: "Silent Linear",
  },
} as const;
export type LocalKeyPresetId = keyof typeof LOCAL_KEY_PRESETS;
export const isLocalKeyPreset = (id: string): id is LocalKeyPresetId =>
  Object.hasOwn(LOCAL_KEY_PRESETS, id);
/** Reserved for replacement: assets and visual palettes are intentionally retained. */
export const RETIRED_KEY_PRESETS = new Set<string>(["oil-king", "boba-u4t"]);
export const isRetiredKeyPreset = (id: string) => RETIRED_KEY_PRESETS.has(id);
export const isKeyPresetEnabled = (id: string) =>
  !isRetiredKeyPreset(id) &&
  (!isLocalKeyPreset(id) || LOCAL_KEY_PRESETS_ENABLED);
