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
    label: "옥구슬",
    sensoryExpression: "유리구슬·방울",
    onomatopoeia: "찰칵·챙",
    tags: ["clicky", "sharp", "click-bar"],
    classification: "Clicky",
  },
  "silent-peach-v3": {
    id: "K09",
    label: "복숭아",
    sensoryExpression: "솜사탕·모래사장",
    onomatopoeia: "푹·톡",
    tags: ["silent", "soft", "muted"],
    classification: "Silent Linear",
  },
  // Recordings taken from YouTube typing videos chosen by the owner. LOCAL DEVELOPMENT ONLY: never shipped (rights unverified).
  "mongdol-pl87w": {
    id: "K11",
    label: "몽돌",
    sensoryExpression: "바둑알 달그락",
    onomatopoeia: "달그락·톡톡",
    tags: ["pebble", "poppy", "smooth"],
    classification: "Linear (HMX 몽돌)",
    sourceVideo: "https://www.youtube.com/shorts/BgO3pE7VnI8",
  },
  "jjigae-topre": {
    id: "K12",
    label: "찌개",
    sensoryExpression: "보글보글 찌개",
    onomatopoeia: "보글·퐁퐁",
    tags: ["topre", "lubed", "deep"],
    classification: "Topre EC 30g (Krytox 105)",
    sourceVideo: "https://www.youtube.com/watch?v=TTfTCiwA38c",
  },
  "dojagi-space65": {
    id: "K13",
    label: "도자기",
    sensoryExpression: "도자기 두드리는 소리",
    onomatopoeia: "또각·탁",
    tags: ["ceramic", "clean", "clacky"],
    classification: "Linear (BSUN RAW)",
    sourceVideo: "https://www.youtube.com/watch?v=Ry1DJ2xzg6Q&t=10s",
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
