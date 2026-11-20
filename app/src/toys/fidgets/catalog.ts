export type Family = "elastic" | "viscous" | "wax" | "particles";
export interface FidgetSpec {
  id: string;
  name: string;
  category: string;
  family: Family;
  shape:
    | "ball"
    | "foam"
    | "mochi"
    | "cheese"
    | "mango"
    | "cream"
    | "apple"
    | "chocolate"
    | "soap"
    | "beads"
    // 뭉개기 (owner, 2026-11-20): things that look like they would squash under a finger
    | "tomato"
    | "strawberry"
    | "pudding"
    | "marshmallow"
    | "tofu"
    | "butter";
  color: number;
  inner: number;
  roughness: number;
  opacity: number;
  width: number;
  height: number;
  depth: number;
  press: number;
  recovery: number;
  damping: number;
  stretch: number;
  /**
   * Plastic: pressing / pulling reshapes the material itself, so it keeps the new shape after the finger lifts and then flows back to
   * its original shape over `plastic` seconds (≈ time constant; mostly home after ~3×). `KEEP_SHAPE` (Infinity): it never flows back —
   * a dent or a stretch stays, as a broken chocolate stays broken (owner, 2026-11-20); only what was lifted sags down. One finger can
   * pull it far. The reset button shows.
   */
  plastic?: number;
  /** another toy whose sounds this one borrows (FIDGET_SOUND / sound chunks are keyed by toy id) — the 뭉개기 toys */
  soundAs?: string;
  /** how big the toy looks on screen (camera distance ÷ this): <1 shows it smaller (owner, 2026-11-20: 레인보우·비누 smaller) */
  viewScale?: number;
  sound:
    | "gel"
    | "foam"
    | "mochi"
    | "cheese"
    | "mango"
    | "cream"
    | "apple"
    | "chocolate"
    | "soap"
    | "beads";
  hint: string;
}
/** `plastic` value for toys that keep whatever shape they were squashed or pulled into — the wax balls (owner, 2026-11-20) */
export const KEEP_SHAPE = Infinity;
/**
 * `plastic` value for every other toy: memory foam — a dent / stretch holds ≈0.4 s, then slowly fills back in (≈2.5 s time
 * constant, home in ~7 s), no bounce (owner, 2026-11-20: "메모리폼처럼 천천히 회복 — 왁뿌볼 말고 모두")
 */
export const MEMORY_FOAM = 2.5;
export const FIDGETS: readonly FidgetSpec[] = [
  {
    id: "S01",
    name: "슬랑이",
    category: "말랑이",
    family: "elastic",
    shape: "ball",
    color: 0x6dcbbb,
    inner: 0xb1e6cc,
    roughness: 0.16,
    opacity: 0.86,
    width: 1,
    height: 1,
    depth: 1,
    press: 0.42, // squishier (owner, 2026-11-20 "좀 더 말랑"; was 0.3)
    recovery: 0.18,
    damping: 0.36,
    stretch: 1.25,
    plastic: MEMORY_FOAM,
    sound: "gel",
    hint: "꾹 누르거나 쭉 당겨보세요 · 천천히 원래대로 차올라요",
  },
  {
    id: "S02",
    name: "모닝빵",
    category: "말랑이",
    family: "elastic",
    shape: "foam",
    color: 0xf6d89e,
    inner: 0xe4ad71,
    roughness: 0.95,
    opacity: 1,
    width: 1.12,
    height: 0.8,
    depth: 0.9,
    press: 0.5,
    recovery: 2.8,
    damping: 1,
    stretch: 1.1,
    plastic: MEMORY_FOAM,
    sound: "foam",
    hint: "길게 누르거나 당겨보세요 · 천천히 원래대로 차올라요",
  },
  {
    id: "S03",
    name: "찹쌀떡",
    category: "말랑이",
    family: "elastic",
    shape: "mochi",
    color: 0xf3bdca,
    inner: 0xf7d6cf,
    roughness: 0.6,
    opacity: 0.93,
    width: 1.25,
    height: 0.57,
    depth: 0.78,
    press: 0.48,
    recovery: 0.5,
    damping: 0.78,
    stretch: 1.35,
    plastic: MEMORY_FOAM,
    sound: "mochi",
    hint: "깊게 누르거나 쭉 당겨보세요 · 천천히 원래대로 차올라요",
  },
  {
    id: "W01",
    name: "청사과",
    category: "왁뿌볼",
    family: "wax",
    shape: "apple",
    color: 0x81bd35,
    inner: 0xf4f2d9,
    roughness: 0.22,
    opacity: 1,
    width: 1,
    height: 1.04,
    depth: 1,
    press: 0.45,
    recovery: 0.35,
    damping: 0.7,
    stretch: 1.2,
    plastic: KEEP_SHAPE,
    viewScale: 0.9, // a little smaller on screen (owner, 2026-11-20)
    sound: "apple",
    hint: "꾹 누르면 얇은 껍질이 갈라져요 · 열린 코어도 만져보세요",
  },
  {
    id: "W02",
    name: "초콜릿",
    category: "왁뿌볼",
    family: "wax",
    shape: "chocolate",
    color: 0x533024,
    inner: 0xeb9cbb,
    roughness: 0.5,
    opacity: 1,
    width: 0.62,
    height: 0.9,
    depth: 0.18,
    press: 0.5,
    recovery: 0.55,
    damping: 0.85,
    stretch: 1.25,
    plastic: KEEP_SHAPE,
    sound: "chocolate",
    hint: "초콜릿 6조각을 꾹 눌러 깨고 · 속을 주물러보세요",
  },
  {
    id: "L01",
    name: "치즈",
    category: "뭉개기", // moved from 슬랑이 (owner, 2026-11-20)
    family: "viscous",
    shape: "cheese",
    color: 0xf7c948, // cheese yellow (owner, 2026-11-20; was a pale cream 0xf4e3a0)
    inner: 0xe6aa31,
    roughness: 0.24,
    opacity: 1,
    width: 1.35,
    height: 0.8,
    depth: 0.72,
    press: 0.62,
    recovery: 1.5,
    damping: 1,
    stretch: 2.7,
    plastic: KEEP_SHAPE,
    sound: "cheese",
    hint: "꾹 눌러 뭉개보세요 · 뭉개진 채로 남아요",
  },
  {
    id: "L02",
    name: "망고",
    category: "슬랑이",
    family: "viscous",
    shape: "mango",
    color: 0xf2a83e,
    inner: 0xffdc8e,
    roughness: 0.12,
    opacity: 0.92,
    width: 1.16,
    height: 0.85,
    depth: 0.78,
    press: 0.48,
    recovery: 1.9,
    damping: 1,
    stretch: 2.6,
    plastic: MEMORY_FOAM,
    sound: "mango",
    hint: "꾹 잡고 쭉 당겨 늘려보세요 · 늘어난 채로 천천히 퍼져 돌아와요",
  },
  {
    id: "L03",
    name: "휘핑크림",
    category: "뭉개기", // moved from 슬랑이 (owner, 2026-11-20)
    family: "viscous",
    shape: "cream",
    color: 0xf7edda,
    inner: 0xe9cfa6,
    roughness: 0.88,
    opacity: 1,
    width: 1.08,
    height: 0.83,
    depth: 1.05,
    press: 0.55,
    recovery: 2.4,
    damping: 1,
    stretch: 2.1,
    plastic: KEEP_SHAPE,
    sound: "cream",
    hint: "크림을 꾹 눌러 뭉개보세요 · 뭉개진 채로 남아요",
  },
  {
    id: "C01",
    name: "비누",
    category: "크런치 말랑이",
    family: "particles",
    shape: "soap",
    color: 0xfffcf5,
    inner: 0xf2efdf,
    roughness: 0.22,
    opacity: 1,
    width: 1.2,
    height: 0.74,
    depth: 0.82,
    press: 0.43,
    recovery: 0.8,
    damping: 0.92,
    stretch: 1.25,
    plastic: MEMORY_FOAM,
    viewScale: 0.93,
    sound: "soap",
    hint: "매끈한 겉면을 꾹 눌러보세요 · 속의 크런치가 부드럽게 밀려요",
  },
  {
    id: "C02",
    name: "레인보우",
    category: "크런치 말랑이",
    family: "particles",
    shape: "beads",
    color: 0xffffff,
    inner: 0xf2deeb,
    roughness: 0.18,
    opacity: 0.48,
    width: 1,
    height: 1,
    depth: 1,
    press: 0.4,
    recovery: 0.6,
    damping: 0.82,
    stretch: 1.35,
    plastic: MEMORY_FOAM,
    viewScale: 0.83,
    sound: "beads",
    hint: "알록달록 작은 비즈 알갱이를 눌러보세요 · 알갱이가 자리를 바꿔요",
  },
  // ---------- 뭉개기 (owner, 2026-11-20): press them flat — they squash, spread and stay squashed until 초기화 ----------
  ...squashToys(),
];
export const findFidget = (id: string) => FIDGETS.find((f) => f.id === id);
/** the 뭉개기 tab's toys (ids M01…) */
export const isSquash = (f: Pick<FidgetSpec, "category">) => f.category === "뭉개기";
function squashToys(): FidgetSpec[] {
  const base: Pick<FidgetSpec, "category" | "family" | "roughness" | "opacity" | "press" | "recovery" | "damping" | "stretch" | "plastic"> = {
    category: "뭉개기",
    family: "viscous",
    roughness: 0.4,
    opacity: 1,
    press: 0.66,
    recovery: 1,
    damping: 1,
    stretch: 1.6,
    plastic: KEEP_SHAPE,
  };
  return [
    { ...base, id: "M01", name: "토마토", shape: "tomato", color: 0xe53b2c, inner: 0xf26b4a, roughness: 0.22, width: 1, height: 0.86, depth: 1, sound: "mango", soundAs: "L02", hint: "꾹 눌러 뭉개보세요 · 뭉개진 채로 남아요" },
    { ...base, id: "M02", name: "딸기", shape: "strawberry", color: 0xe8333f, inner: 0xff8a8a, roughness: 0.3, width: 0.86, height: 1, depth: 0.86, sound: "mango", soundAs: "L02", hint: "꾹 눌러 뭉개보세요 · 뭉개진 채로 남아요" },
    { ...base, id: "M03", name: "푸딩", shape: "pudding", color: 0xf6d26b, inner: 0xfae29a, roughness: 0.18, width: 1, height: 0.82, depth: 1, sound: "gel", soundAs: "S01", hint: "탱글한 푸딩을 꾹 눌러 뭉개보세요" },
    // 마시멜로 lives in the 말랑이 tab (owner, 2026-11-20): a memory-foam squishy, no squash, nothing thrown
    { ...base, category: "말랑이", family: "elastic", plastic: MEMORY_FOAM, press: 0.5, id: "M04", name: "마시멜로", shape: "marshmallow", color: 0xfbf6f1, inner: 0xffffff, roughness: 0.85, width: 0.92, height: 0.78, depth: 0.92, sound: "foam", soundAs: "S02", hint: "폭신한 마시멜로를 꾹 눌러보세요 · 천천히 원래대로 차올라요" },
    { ...base, id: "M05", name: "두부", shape: "tofu", color: 0xf6f2e6, inner: 0xffffff, roughness: 0.55, width: 1.1, height: 0.72, depth: 0.9, sound: "mochi", soundAs: "S03", hint: "말랑한 두부를 꾹 눌러 뭉개보세요" },
    { ...base, id: "M06", name: "버터", shape: "butter", color: 0xf8df86, inner: 0xfbe9a8, roughness: 0.32, width: 1.2, height: 0.62, depth: 0.8, sound: "cheese", soundAs: "L01", hint: "버터를 꾹 눌러 뭉개보세요 · 뭉개진 채로 남아요" },
  ];
}
