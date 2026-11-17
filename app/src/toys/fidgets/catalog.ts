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
  /**
   * Plastic slime: pulling reshapes the material itself, so it stays stretched after the finger lifts and then flows back to its
   * original shape over `plastic` seconds (≈ time constant; mostly home after ~3×). One finger can pull it far. The reset button shows.
   */
  plastic?: number;
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
    press: 0.3,
    recovery: 0.18,
    damping: 0.36,
    stretch: 1.25,
    sound: "gel",
    hint: "꾹 누르거나 쭉 당겨보세요 · 놓으면 탱글하게 돌아와요",
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
    sound: "foam",
    hint: "길게 누르거나 당겨보세요 · 놓으면 천천히 차올라요",
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
    sound: "mochi",
    hint: "깊게 누르거나 쭉 당겨보세요 · 놓으면 말랑하게 돌아와요",
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
    sound: "chocolate",
    hint: "초콜릿 6조각을 꾹 눌러 깨고 · 속을 주물러보세요",
  },
  {
    id: "L01",
    name: "치즈",
    category: "슬랑이",
    family: "viscous",
    shape: "cheese",
    color: 0xf4e3a0,
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
    plastic: 8,
    sound: "cheese",
    hint: "꾹 잡고 쭉 당겨 늘려보세요 · 늘어난 채로 천천히 돌아와요",
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
    plastic: 8,
    sound: "mango",
    hint: "꾹 잡고 쭉 당겨 늘려보세요 · 늘어난 채로 천천히 퍼져 돌아와요",
  },
  {
    id: "L03",
    name: "휘핑크림",
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
    plastic: 10,
    sound: "cream",
    hint: "봉우리를 뭉개고 당겨보세요 · 빚은 모양이 한동안 남아요",
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
    sound: "beads",
    hint: "알록달록 작은 비즈 알갱이를 눌러보세요 · 알갱이가 자리를 바꿔요",
  },
];
export const findFidget = (id: string) => FIDGETS.find((f) => f.id === id);
