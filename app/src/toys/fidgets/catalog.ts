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
    | "beads";
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
export const FIDGETS: readonly FidgetSpec[] = [
  {
    id: "S01",
    name: "TPR 젤리볼",
    category: "말랑이",
    family: "elastic",
    shape: "ball",
    color: 0x73c7c2,
    inner: 0xb1e6cc,
    roughness: 0.16,
    opacity: 0.72,
    width: 1,
    height: 1,
    depth: 1,
    press: 0.3,
    recovery: 0.18,
    damping: 0.36,
    stretch: 1.25,
    sound: "gel",
    hint: "꾹 누르고 놓아보세요 · 탱글하게 출렁여요",
  },
  {
    id: "S02",
    name: "슬로우 라이징 폼",
    category: "말랑이",
    family: "elastic",
    shape: "foam",
    color: 0xe9bc83,
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
    sound: "foam",
    hint: "길게 누른 뒤 놓아보세요 · 자국이 천천히 차올라요",
  },
  {
    id: "S03",
    name: "모찌 말랑이",
    category: "말랑이",
    family: "elastic",
    shape: "mochi",
    color: 0xf3bdca,
    inner: 0xf7d6cf,
    roughness: 0.6,
    opacity: 0.93,
    width: 1.25,
    height: 0.57,
    depth: 1.05,
    press: 0.48,
    recovery: 0.5,
    damping: 0.78,
    stretch: 1.35,
    sound: "mochi",
    hint: "손끝으로 깊게 눌러보세요 · 주변이 말랑하게 밀려나요",
  },
  {
    id: "W01",
    name: "청사과 왁뿌볼",
    category: "왁뿌볼",
    family: "wax",
    shape: "apple",
    color: 0x92c548,
    inner: 0xf5dc8c,
    roughness: 0.22,
    opacity: 1,
    width: 1,
    height: 1.04,
    depth: 1,
    press: 0.33,
    recovery: 0.35,
    damping: 0.7,
    stretch: 1.2,
    sound: "apple",
    hint: "꾹 누르면 얇은 껍질이 갈라져요 · 열린 코어도 만져보세요",
  },
  {
    id: "W02",
    name: "초콜릿 왁뿌볼",
    category: "왁뿌볼",
    family: "wax",
    shape: "chocolate",
    color: 0x533024,
    inner: 0xeb9cbb,
    roughness: 0.5,
    opacity: 1,
    width: 1.06,
    height: 0.92,
    depth: 1.06,
    press: 0.4,
    recovery: 0.55,
    damping: 0.85,
    stretch: 1.25,
    sound: "chocolate",
    hint: "두꺼운 초콜릿 조각을 꾹 눌러 깨고 · 속을 주물러보세요",
  },
  {
    id: "L01",
    name: "치즈 슬랑이",
    category: "슬랑이",
    family: "viscous",
    shape: "cheese",
    color: 0xf3cf51,
    inner: 0xe6aa31,
    roughness: 0.45,
    opacity: 1,
    width: 1.35,
    height: 0.46,
    depth: 0.85,
    press: 0.28,
    recovery: 1.5,
    damping: 1,
    stretch: 3.1,
    sound: "cheese",
    hint: "두 손가락을 벌려 길게 늘리고 · 모으면 접혀요",
  },
  {
    id: "L02",
    name: "망고 슬랑이",
    category: "슬랑이",
    family: "viscous",
    shape: "mango",
    color: 0xf2a83e,
    inner: 0xffdc8e,
    roughness: 0.12,
    opacity: 0.92,
    width: 1.23,
    height: 0.38,
    depth: 1.05,
    press: 0.48,
    recovery: 1.9,
    damping: 1,
    stretch: 2.6,
    sound: "mango",
    hint: "꾹 눌러 촉촉하게 퍼뜨리고 · 천천히 늘려보세요",
  },
  {
    id: "L03",
    name: "휘핑크림 슬랑이",
    category: "슬랑이",
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
    sound: "cream",
    hint: "폭신한 봉우리를 뭉개고 · 접어서 다시 주물러요",
  },
  {
    id: "C01",
    name: "비누 크런치",
    category: "크런치 말랑이",
    family: "particles",
    shape: "soap",
    color: 0x94c6e0,
    inner: 0xc4e8e4,
    roughness: 0.48,
    opacity: 0.45,
    width: 1.15,
    height: 0.65,
    depth: 0.95,
    press: 0.38,
    recovery: 0.65,
    damping: 0.9,
    stretch: 1.2,
    sound: "soap",
    hint: "오래 눌러 조각을 바삭하게 부숴보세요 · 초기화로 복구",
  },
  {
    id: "C02",
    name: "슈가비즈 말랑이",
    category: "크런치 말랑이",
    family: "particles",
    shape: "beads",
    color: 0xdeb6e3,
    inner: 0xb7d2e9,
    roughness: 0.18,
    opacity: 0.32,
    width: 1.18,
    height: 0.7,
    depth: 1.0,
    press: 0.38,
    recovery: 0.32,
    damping: 0.6,
    stretch: 1.4,
    sound: "beads",
    hint: "누르고 문지르면 작은 비즈가 밀리고 부딪혀요",
  },
];
export const findFidget = (id: string) => FIDGETS.find((f) => f.id === id);
