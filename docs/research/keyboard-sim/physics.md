# 키보드 타건 시뮬레이터 — 3D/물리 설계 메모 (기획·설계 전용, 코드 변경 없음)

작성: 3D/Physics 에이전트 · 2026-11-09 · 대상: `app/src/toys/keyboard/*`, `src/core/spring.ts`
태그: [확인: 출처] / [추정] / [가설] / [검증필요] / [추천] / [미결정] / [미확인]

> 출처 표기 주의: "✓"가 붙은 출처는 페이지를 직접 열어 값을 확인했다. 나머지 [확인]은 웹 검색 결과 요약에 나온 해당 페이지 값이다. 원문 재확인은 [검증필요]로 남긴다. 리테일러 값은 제조사 데이터시트가 아니며, 같은 모델도 판매처마다 값이 다른 경우가 많았다(아래 "충돌" 열).

---

## 0. 요약 결론 (먼저 읽기)

1. **분류 축을 다시 잡는다 [추천]**: "5종 메커니즘"은 서로 같은 층위가 아니다.
   - **느낌(힘 곡선)**: 리니어 / 택타일 / 클릭(click-jacket·click-bar)
   - **소음 보정(모디파이어)**: 저소음 댐퍼(바닥·상단 패드). 리니어와 택타일 어디에도 붙는다. 예: Silent Lime은 저소음 *택타일*이다.
   - **센싱 방식**: 접점 / 자석(HE, 홀 센서) / 광학(Razer analog는 **광학**). 센싱은 손에 닿는 느낌이 아니라 "어디서 입력으로 인정하나"를 바꾼다. HE 스위치 대부분은 리니어 느낌이다.
   - 그래서 데이터 모델은 `family(linear|tactile|clicky) × silent(bool) × sensing(contact|magnetic|optical)`로 둔다.
2. **실측 수준의 타건은 25~30ms 안에 끝난다**. 60fps에서는 **1~2프레임**이다(§3.1 시뮬레이션). 이 시간 안에서 택타일 범프 위치 차이는 3ms 남짓이라 **눈으로는 구분할 수 없다**. 메커니즘 차이를 *보여주려면* 시간을 늘리는 양식화가 필요하다. 대신 늘린 만큼 소리와 화면의 동기가 어긋날 위험이 있다(허용 창 약 40ms).
3. **현재 구현의 복귀 동작은 물리적으로 반대 방향이다**: `up {freq:17, ζ:0.5}`는 키를 휴지 위치 **위로** 약 16% 튀어 오르게 한다(계산값 e^(−πζ/√(1−ζ²)) ≈ 0.163). 실물 스템은 상단 하우징에 막혀 정지한다. 튕김이 있다면 **아래쪽(행정 안쪽)**으로 생긴다 [확인: 구조상, spring.ts/model.ts 코드 확인]. → 상단·바닥 하드 스톱과 반발계수 방식으로 바꾸기를 추천한다.
4. **눈에 보이는 메커니즘 차이는 현실적으로 다음뿐이다**: (a) 바닥 도달 방식(딱 멈춤 vs 저소음의 부드러운 안착·짧은 행정), (b) 1프레임짜리 "걸림" 정지(택타일·클릭, 양식화), (c) 클릭 스위치의 투명 하우징 안쪽 부품 움직임(점검 모드 한정), (d) HE의 작동점 표시. **주 채널은 소리**이고, 화면은 소리를 *배반하지 않는* 수준이면 된다.
5. **상표 정책**: 기획서 §8.2에 따라 스위치 제품명은 UI에 노출하지 않는다. 아래 표는 내부 파라미터 근거 자료로만 쓴다.

---

## 1. 스위치 사실 검증 표

단위: gf ≈ cN (1 cN = 1.02 gf, 실무상 같게 취급). "작동"=operating/actuation force. "프리"=pre-travel(작동점), "총"=total travel.

### 1.1 리니어

| 후보 | 정체/제조사 | 작동력 | 바닥력 | 프리 | 총 | 비고 / 충돌 |
|---|---|---|---|---|---|---|
| HMX 몽돌축 | **모델을 특정하지 못함** [미확인] | [미확인] | [미확인] | [미확인] | [미확인] | 한국어·영어 검색 모두 해당 제품명이 없음. 커뮤니티 별칭이거나 국내 한정 명칭일 가능성 [추정]. 판매 페이지 URL을 받아야 한다 |
| 하이무 바다소금축 | **Haimu Sea Salt Linear** (Haimu) | 47±5 gf [확인: Keychron NL] | 55 gf [확인: 동일] | 2.0±0.5 mm [확인] | 3.6±0.3 mm [확인] | Keychron FR 페이지는 55±8 gf / 3.6±0.2로 다르다. 그런데 표 제목이 "Baby Raccoon"으로 되어 있어 복붙 오류로 보인다 [추정]. POM 스템, PC/나일론 하우징, 5핀, 공장 윤활. 출처: https://keychron.co.nl/nl/products/haimu-sea-salt-linear-switch , https://www.keychron.fr/products/haimu-sea-salt-linear-switch |
| Gateron Oil King | Gateron | 55±5 gf [확인: Gateron 블로그] | ~80 gf [확인: Gateron 블로그] / ~65 g (Lumekeebs) | 2.0 mm [확인] | 4.0 mm [확인] | 바닥력이 판매처마다 다름(80 vs 65). 20 mm 스프링, 5핀, 공장 윤활. https://www.gateron.com/blog/detail/gateron-oil-king-linear-switch-set-the-ultimate-typing-experience , https://keebsforall.com/products/gateron-oil-king-linear-switches |
| 키위치/레오폴드 개량 리니어 | **모델을 특정하지 못함** [미확인] | [미확인] | [미확인] | [미확인] | [미확인] | 검색해도 키보드 스위치 자료가 나오지 않음. 정확한 상품명이 필요하다 |
| Cherry MX Red (MX2A) | Cherry | 45 cN [확인 ✓: cherry.de] | 최종력 100 cN(페이지 표기) [확인 ✓] | 2.0 mm [확인 ✓] | 4.0 mm [확인 ✓] | 초기력 30 cN [확인 ✓]. "최종력 100 cN"은 스프링 끝 힘이 아니라 바닥 접촉 힘일 수 있어 해석은 [검증필요]. https://www.cherry.de/en-gb/product/mx2a-red |

### 1.2 택타일

| 후보 | 정체/제조사 | 작동력 | 범프(힘@위치) | 바닥력 | 프리 | 총 | 비고 / 충돌 |
|---|---|---|---|---|---|---|---|
| 바나나축 | **이름이 모호함**: Gateron Jupiter Banana / Banana Smoothie / KS-33 LP Banana / Keychron K Pro Banana가 모두 존재 | Jupiter: 59±10 gf [확인: kbd.news] | Jupiter: 65 gf @0.50 mm [확인: kbd.news] (상단 범프) | Smoothie: 65 g @3.4 mm [확인: kbd.news] | Jupiter 2.0±0.6 [확인] | Jupiter 3.4±0.4 [확인] | 어느 바나나인지 확정 필요 [미결정]. https://kbd.news/switch/Gateron-Jupiter-Banana-107.html , https://kbd.news/switch/Gateron-Banana-Smoothie-switch-442.html , 공식 시트 목록 https://gateron.com/pages/product-specification |
| Silent Lime | **Outemu Silent Lime V3** (Gaote/Outemu) = **저소음 택타일** | 35±10 gf [확인: ozokeyboards] | [미확인] | 45~50 g (출처마다 다름) | 1.8±0.6 mm [확인] | 3.3 mm [확인] | 택타일과 저소음 **양쪽 목록에 중복**된 이유다 → 하나의 프로필(tactile+silent)로 처리. 2025년 "롱폴 55g" 변형이 따로 존재 [확인: 검색 요약]. https://www.ozokeyboards.com/products/outemu-lime-v3-silent-tactile-switches , https://kbd.news/switch/Outemu-Silent-Lemon-Lime-V3-switch-191.html |
| Holy Panda V2 | **"V2" 공식 모델을 찾지 못함** [미확인] | — | — | — | — | — | 확인된 것: 원조 Holy Panda = Halo 스템 + Invyr Panda 하우징, 67g 스프링 [확인: Thock King]. Drop Holy Panda X는 Gateron 생산 [확인: drop.com]. 수치 [미확인]. https://www.thockking.com/products/invyr-holy-panda-tactile-switches , https://drop.com/buy/drop-holy-panda-x-mechanical-switches |
| Aqua Panda | **찾지 못함** [미확인] | — | — | — | — | — | 참고용 Panda 계열: TTC Panda는 범프 58 g @0.50 mm, 작동 45 g @2 mm, 바닥 63.5 g @3.3 mm [확인 ✓: kbd.news]. https://kbd.news/switch/TTC-Panda-519.html |
| Cherry MX Brown (MX2A) | Cherry | 55 cN [확인: cherry.de en-us] | 위치·크기 **미공개** [미확인] | 최종력 80 cN [확인: cherry.de en-gb] | 2.0 mm [확인] | 4.0 mm [확인] | Cherry 자체 페이지끼리 충돌한다: en-gb는 작동 45 cN / 초기 30 cN, en-us는 55 cN. https://www.cherry.de/en-us/product/mx2a-brown , https://www.cherry.de/en-gb/product/mx2a-brown |
| Kailh Box 택타일 계열 | Kailh Box Brown | 45±10 gf [확인: 판매처] | 50±10 gf, 위치 [미확인] | 57~68 g (판매처마다 다름) | 1.8 또는 2.0 mm (충돌) | 3.6 mm [확인] | V2는 범프 75 g라는 표기도 있음(충돌). 같은 계열의 저소음 택타일: Kailh Deep Sea Silent Pro "Whale" — 작동 40±10, 범프 60±10, 프리 2.0±0.4, 총 3.6±0.4 [확인: Keychron]. https://www.mechboards.co.uk/products/kailh-box-brown , https://kbd.news/switch/Kailh-Box-V2-Brown-457.html |

### 1.3 클릭

| 후보 | 클릭 방식 | 작동력 | 바닥력 | 프리/작동점 | 총 | 비고 |
|---|---|---|---|---|---|---|
| Kailh Box White | **click-bar** (금속 바가 튀어 오르며 침) [확인: Kinetic Labs·Drop 해설] | 45±15 gf [확인: mechanicalkeyboards.com, Sharkoon] | V2: 50 g [확인: Lumekeebs] | 1.8 mm [확인] | 3.6±0.3 mm [확인] | 범프 55±10 gf [확인: StacksKB]. **누를 때와 뗄 때 모두 클릭** [확인: 같은 해설·RTINGS 비교]. DailyClack에는 50g 표기(이상치). https://mechanicalkeyboards.com/products/kailh-box-white-45g-clicky-plate-mount , https://kineticlabs.com/blog/an-introduction-to-clicky-switch-mechanisms |
| Cherry MX Blue | **click-jacket** (스템 하단 재킷이 떨어지며 소리) [확인: Kinetic Labs] | 60 cN [확인: cherry.de 블로그] | [미확인] | 2.2 mm [확인: cherry.de 블로그] | 4.0 mm [추정: MX 표준, 원문 미확인] | **누를 때만 클릭**, 뗄 때는 없음 [확인]. 리셋 1.6 mm라는 리뷰 표기가 있으나 출처가 불명확해 [추정]. https://www.cherry.de/en-gb/company/news/cherry-blog/article/how-to-diy-keyboard-part-3-cherry-mx-original |
| Razer Green | 클릭 방식 [미확인] | 50 g [확인: Razer 지원] (RTINGS 실측 55 gf) | [미확인] | 작동 1.9 mm / 리셋 1.5 mm [확인: Razer 지원] | 4.0 mm [확인] | https://mysupport.razer.com/app/answers/detail/a_id/13260 , https://www.rtings.com/keyboard-switch/reviews/razer/green-gen-3 |
| Kailh Box Blue | **현재 "Box Blue"는 리니어 신제품으로 소개됨** [확인: Mechkeys] → 클릭 후보로 부적합 | — | — | — | — | Kailh의 클릭 Box 라인업은 White / Jade / Navy 등이다. Box Navy: 압점 1.7 mm / 리셋 1.8 mm [확인: Thock King]. https://mechkeys.com/blogs/news/kailh-introduces-all-new-box-blue-linear-mechanical-switches , https://www.thockking.com/collections/switches/products/kailh-box-navy-crystal-clicky-switches |
| Outemu Blue | click-jacket [추정: MX 클론 구조, 출처 없음] | 60 gf (판매처 시트) vs 50 g (kbd.news) — **충돌** | 끝 힘 65 gf (판매처) | 2.2 mm (판매처), 2.0 (keeb-finder) | 4.0 mm [확인: 다수] | https://kbd.news/switch/Outemu-Blue-352.html |

### 1.4 저소음

| 후보 | 정체 | 작동력 | 바닥력 | 프리 | 총 | 비고 |
|---|---|---|---|---|---|---|
| Kailh Deep Sea Pro Silent | Kailh "Deep Sea Silent Pro" Box: **변형이 여럿**(Islet=리니어, Whale=택타일) | Islet 45±10 gf [확인: Keychron] | [미확인] | 1.8±0.4 mm | 3.6±0.4 mm | 복귀력 ≥15 gf, 롱 스프링. 어떤 변형인지 확정 필요. https://keychron.com/products/kailh-deep-sea-silent-pro-box-switch |
| KTT 저소음 바다축/화이트축 | **모델을 특정하지 못함** [미확인] | — | — | — | — | KTT 저소음 계열은 대체로 작동 약 43 g / 바닥 55~58 g / 총 4 mm 수준이지만 **해당 모델 값이 아니므로 쓰지 않는다**. 상품명 필요 |
| Outemu Silent Peach V3 | Outemu 저소음 리니어 | 40 gf [확인: 판매처 시트] | 끝 45 gf / 바닥 50 g (충돌) | 2.0 mm (±0.6) | 3.3 mm [확인] | https://kbd.news/switch/Outemu-Silent-Honey-Peach-V3-134.html (Honey Peach와 이름이 혼동됨: [검증필요]) |
| Silent Lime | → §1.2 (저소음 택타일) | | | | | |
| Cherry MX Silent Red (MX2A) | Cherry 저소음 리니어 | 45 cN [확인: cherry.de] | [미확인] | 1.9 mm [확인] | **3.7 mm** [확인] | 특허 댐핑. 일반 Red 대비 행정이 0.3 mm 짧다 = **댐퍼가 행정을 먹는다**는 시각 단서. https://cherry.de/en-us/product/mx2a-silent-red |

### 1.5 자석/HE (그리고 광학 아날로그)

> HE(홀 효과)는 **자석의 위치를 *감지*하는 방식**이다. 자기 부상도 아니고 마찰 없는 행정도 아니다. 스템·스프링·하우징 마찰은 일반 스위치와 같다. 조절 가능한 작동점과 Rapid Trigger는 **키보드 펌웨어 기능**이며, 범위는 스위치가 아니라 보드에 따라 다르다.

| 후보 | 센싱 | 힘 | 총 | 작동점 범위 | 비고 |
|---|---|---|---|---|---|
| Wooting Lekker (L60 V2) | 자석/홀 | 40→60 cN (리니어) [확인: wooting.io] | 4.0 mm [확인] | 0.1–4.0 mm (작동·리셋) [확인: wooting.io] | Lekker Tikken: 42→54 gf, 22 mm 스프링 [확인: Notebookcheck]. https://wooting.io/ja/product/lekker-switch-l60-v2 , https://www.notebookcheck.net/A-world-first-and-near-perfect-thocky-Hall-effect-switch-Wooting-Lekker-Tikken-vs-Lekker-V2-switch-hands-on-test.1156046.0.html |
| Gateron Magnetic Jade | 자석/홀 | 초기 36±5 gf [확인: Gateron] (판매처 30±7) / 바닥 50 g [추정: keeb-finder] | 3.5±0.1 mm [확인] | 보드에 따름 | 변형 주의: Attraction 30/30 gf·3.2 mm, Silent 33/45 gf·3.2 mm [확인: Gateron]. https://gateron.com/blog/detail/gateron-magnetic-switches-series-for-the-ultimate-gaming-experience |
| Geon Raptor HE | 자석/홀 | V2: 35 g / 바닥 45 g [확인: Divinikey] · V1: 42/52 g [keeb-finder] | V2 3.4 mm / V1 4.0 mm | 보드에 따름 | https://divinikey.com/collections/geon-switches/products/geon-raptor-he-switches |
| Razer analog | **광학**(Analog Optical Gen-2), HE 아님 | [미확인] | [미확인] | 0.1–4.0 mm, 0.1 mm 단위 [확인: Razer 뉴스룸·Reviewed] | "자석/HE" 분류에서 빼고 "아날로그 센싱"으로 묶는다. https://www.razer.com/newsroom/product-news/razer-analog-optical-switches-gen-2 |
| DrunkDeer (Raesha) | 자석 | [미확인] | [미확인] | 제품 페이지 0.2–3.8 mm vs FAQ·PC Gamer 0.4–3.6 mm — **충돌**(펌웨어·리비전 차이로 추정) | https://www.drunkdeer.com/products/adjustable-keyboard-magnetic-switch-a75 , https://drunkdeer.com/pages/a75-faq |
| Outemu HE | — | [미확인] | [미확인] | [미확인] | 조회 예산 내에서 찾지 못함 |

### 1.6 아키타입으로 압축 (시뮬레이터 입력값) [가설]

검증된 값만으로 만든 대표 프로필이다. UI 이름은 의성어·일반명으로 한다.

| 아키타입 | 근거 | 총행정 | 작동점 | 힘곡선(mm:gf) | 이벤트 |
|---|---|---|---|---|---|
| 리니어 | MX Red ✓, Oil King, Sea Salt | 4.0 (3.6 변형) | 2.0 | 0:30 → 2.0:45 → 4.0:60 (선형) [끝점 60은 추정] | 바닥 |
| 택타일(상단 범프) | TTC Panda ✓, Jupiter Banana | 3.3–3.4 | 2.0 | 0:40 → 0.5:58(피크) → 1.1:38 → 2.0:45 → 3.3:63.5 [피크 이후 하강폭은 추정] | 범프 통과, 바닥 |
| 클릭-재킷 | MX Blue, Outemu Blue | 4.0 | 2.2 | 0:35 → 1.5:62 → 1.75:38 → 2.2:50 → 4.0:65 [피크 위치·크기 추정] | 클릭(하강만), 바닥 |
| 클릭-바 | Box White | 3.6 | 1.8 | 0:35 → 1.5:55 → 1.7:35 → 1.8:45 → 3.6:55 [추정] | 클릭(하강+상승), 바닥 |
| 저소음 리니어 | MX Silent Red, Silent Peach V3 | 3.3–3.7 | 1.9–2.0 | 리니어와 같음 + 바닥 0.3 mm 댐퍼 영역 | 부드러운 안착(반발 0) |
| 저소음 택타일 | Silent Lime V3, Deep Sea Whale | 3.3–3.6 | 1.8–2.0 | 택타일과 같음, 범프는 작게 + 바닥 댐퍼 | 범프, 부드러운 안착 |
| HE 리니어 | Lekker L60 V2 ✓, Magnetic Jade | 3.4–4.0 | **0.1–4.0 조절** | 0:40 → 4.0:60 | 작동점 통과(사용자 설정), 바닥 |

---

## 2. 키 입력 상태 머신

### 2.1 상태와 전이 (키별)

```
          pointerdown / keydown (holders 0→1)
IDLE ───────────────────────────────────────► PRESSING
 ▲                                              │  x 증가 (곡선 재생)
 │                                              ├─ x ≥ bumpStart ──► [BUMP]  (택타일·클릭: 걸림)
 │                                              ├─ x ≥ clickPt  ──► ★click  (클릭: 소리 레이어·재킷/바 시각)
 │                                              ├─ x ≥ actPt    ──► ★actuate (논리 입력, HE 표시등 ON)
 │                                              └─ x ≥ L        ──► ★bottom  → BOTTOMED
 │                                                                     │ (반발 미세 튕김 후)
 │                                                                     ▼
 │                                                                   HOLD (holders>0)
 │        pointerup/cancel/keyup (holders →0) — 어느 상태에서든 가능  │
 │                                                                     ▼
 │                                                                 RELEASING
 │                                              ├─ x ≤ resetPt  ──► ★reset (HE RT면 즉시)
 │                                              ├─ (클릭-바) x ≤ barReset ─► ★upClick
 │                                              └─ x ≤ 0        ──► ★topout
 │                                                                     ▼
 └──────────────────────────────── settle (|x|,|v| < ε) ◄──────────  SETTLING
  RELEASING/SETTLING 중 재입력 → PRESSING (현재 x, v에서 이어서)
```

★ = 이벤트(소리·시각·햅틱 트리거). **사운드 디스패치는 pointerdown이 아니라 이 이벤트에 묶는다**. 다만 지연 정책은 §2.3을 따른다.

### 2.2 이벤트 → 출력 매핑 [가설]

| 이벤트 | 소리 | 시각 | 햅틱(Android) |
|---|---|---|---|
| press 시작 | (정책 A: 합성 다운 샘플 즉시) | 곡선 재생 시작, 기울기 계산(기존) | — |
| bump | 택타일 마찰 "툭"(작게; 대부분은 다운 샘플에 이미 포함) | 걸림(속도 저하) | — |
| click | 클릭 레이어(재킷/바) | 투명 모드에서 재킷 낙하 / 바 회전 | 펄스 1(가설) |
| actuate | 없음 | HE: 키 밑 표시등 ON, 작동점 마커 | — |
| bottom | 바닥음(정책 B일 때만 여기서 예약) | 하드 스톱 + 미세 반발 / 저소음은 감속 안착 | 펄스(기존 6 ms) |
| reset | 없음 | HE 표시등 OFF | — |
| upClick | 클릭-바 상승 클릭 | 바 복귀 | — |
| topout | 업 샘플 | 상단 하드 스톱(반발은 아래 방향), 키캡 미세 흔들림(저소음 제외) | — |

### 2.3 터치와 매핑하기 — 힘을 알 수 없다는 전제

- pointerdown은 **"손가락이 키캡에 닿았고 누를 의도가 있다"**는 신호일 뿐이다. 힘·속도·깊이는 알 수 없다(Force Touch 없음, §6.3 결정 "압력 미사용"). 그래서 **행정은 손가락이 끄는 것이 아니라 재생되는 애니메이션**이다.
- 세기는 기획서 §6.3 모델(연타 간격 등)에서 하나의 스칼라 `intensity ∈ [0.6, 1.2]`로 받아 **곡선 시간 배율과 바닥 충돌 속도**에만 반영한다 [가설].
- **소리 지연 정책** [미결정, A/B 대상 — 기획서 이견 G5와 같은 축]
  - **A(현행, 추천 기본값)**: pointerdown 즉시 "다운 합성 샘플"(클릭→바닥 간격이 녹음에 자연히 들어 있음)을 재생한다. 그리고 **시각 곡선의 바닥 도달 시각을 샘플의 바닥 트랜지언트 오프셋에 맞춘다**(녹음에서 측정). 지연은 최소다.
  - **B(정밀)**: 곡선이 결정적이므로 pointerdown 시점에 click/bottom 도달 시각을 미리 계산한다. 그다음 `AudioContext.currentTime + Δ`로 레이어별로 예약한다. 소리와 화면이 정확히 맞지만 바닥음이 약 25~35 ms 늦어진다(실물도 접촉→바닥까지 비슷한 시간이 걸린다 [추정]).
  - 소리와 화면의 허용 어긋남: 소리가 앞설 때 약 45 ms, 늦을 때 약 125 ms가 검출 한계로 알려져 있다(ITU-R BT.1359 계열) [추정: 원문 미확인]. → **바닥 도달은 pointerdown 후 ≤40 ms**를 목표로 한다.
- 키보드(물리 키) 입력도 같은 상태 머신을 쓴다. `ev.repeat`는 무시한다(현행 유지).

---

## 3. 메커니즘별 모션 파라미터

### 3.1 기준 시뮬레이션 (오프라인, 근거용)

1D 힘곡선 모델로 계산했다: `m·x'' = F_finger(t) − F_switch(x) − c·x'`, 바닥·상단은 하드 스톱(반발계수 e), 저소음은 바닥 0.3 mm 구간에 강성+감쇠 댐퍼. 손가락 힘 `F0 + (Fmax−F0)(1−e^(−t/τ))`, F0 = 초기력+3 gf, Fmax 100 gf, τ 22 ms, 유효질량 10 g, c 0.45 N·s/m. **모든 값은 [가설]**이며 손가락 힘·유효질량은 측정값이 아니다. 스크립트: `…/scratchpad/kbsim/fsim2.py`

| 아키타입 | 바닥 도달 | 충돌 속도 | 60fps 샘플(행정 비율, 0·16.7·33 ms…) | 복귀: 상단 도달 | 상단 반발 |
|---|---|---|---|---|---|
| 리니어 4.0 | 24.7 ms | 313 mm/s | 0 → 0.43 → 1.0 | 19 ms | 0.06 mm |
| 택타일 3.3 | 25.0 ms | 317 | 0 → 0.34 → 1.0 | 18 ms | 0.05 mm |
| 클릭-재킷 4.0 | 27.6 ms | 295 | 0 → 0.35 → 1.0 | 18 ms | 0.10 mm |
| 저소음 리니어 3.7 | 24.2 ms (댐퍼 진입) | 144 | 0 → 0.47 → 0.91 → 0.94 | 16 ms | 0 |
| 저소음 택타일 3.3 | 23.0 ms | 226 | 0 → 0.45 → 0.96 | 17 ms | 0 |
| HE 리니어 4.0 | 25.4 ms | 321 | 0 → 0.39 → 1.0 | 19 ms | 0.04 mm |

**해석**
- 물리적으로 그럴듯한 타건은 **모두 약 25 ms**에 끝난다. 60fps에서 메커니즘 차이는 "첫 프레임의 진행률 0.34 vs 0.43" 정도뿐이다. 범프는 *보이지 않는다*.
- 상단 반발은 0.04~0.1 mm(1u가 화면에서 약 100 px일 때 0.3 px 미만 [추정])라 **안 보인다**. 저소음의 차이는 "바닥이 덜 내려가고(0.94) 튕김이 없음"만 남는다.
- 현재 `down {38, ζ1}`은 90% 도달이 약 16 ms이고(해석해 wt≈3.89), 충돌 없이 임계감쇠로 다가간다. "탁" 하고 부딪히는 순간이 없어 다소 "부드럽게 멈춘" 인상을 준다 [추정].

→ 결론: **런타임은 "물리 시뮬레이션"이 아니라 "구운(baked) 곡선 + 양식화"로 간다** [추천]. 오프라인 힘곡선 시뮬레이션으로 기본 형태를 만들고, 60fps에서 *읽히도록* 시간만 늘리고 걸림 프레임을 넣은 다음, LUT(키프레임)로 저장한다. 결정적이고 프레임 독립적이며, 소리 오프셋에 맞춰 튜닝할 수 있다.

### 3.2 런타임 모델 제안 [추천]

```
press:   x(t) = LUT_mech(t · intensityScale)   // 0 → 1(=L), 결정적
         바닥 도달 후: Spring(target=1, {freq: f_b, damping: ζ_b}), 초기 v = −e_b · v_impact
         (x ≤ 1로 클램프 → 튕김은 위쪽으로 아주 조금)
release: Spring(target = −overdrive, {freq: f_u, damping: ζ_u})
         x ≤ 0 도달 시 하드 스톱: x = 0, v = −e_t · v  → 이후 target = 0, {freq: 40, damping: 0.5}
         (튕김은 아래 = 행정 안쪽. 휴지 위치 위로 넘지 않음)
re-press (RELEASING/SETTLING 중): LUT에서 x_now에 해당하는 t*를 역탐색(단조 곡선) → t*부터 재생
         (x_now가 이미 범프·클릭점 아래면 그 이벤트는 다시 발생하지 않음)
```

- 기존 `Spring` API를 그대로 쓴다. 하드 스톱은 `step()` 뒤에 클램프와 속도 반전만 하면 된다(서브스텝 ≤2 ms 권장. 경계 교차 시점 오차를 줄이려면) [가설].
- LUT는 메커니즘당 8~12개 키프레임 + 단조 3차(Hermite) 보간이면 충분하다.

### 3.3 메커니즘별 시작값 [가설: 실기기·소리 맞춤 후 조정]

시간축 = pointerdown 기준 ms, x = 행정 비율(0~1, 1 = 해당 아키타입 총행정).

| 아키타입 | 누름 곡선 키프레임 (ms:x) | 바닥 | 복귀 (Spring) | 상단 | 기타 |
|---|---|---|---|---|---|
| 리니어 | 0:0 · 8:0.30 · 16:0.68 · 24:1.0 (등가속 느낌, 끝 기울기 최대) | 하드, e_b 0.12, 이후 {freq 45, ζ 0.4} | target −0.3, {freq 15, ζ 0.8} | 하드, e_t 0.12 | 연속 곡선(걸림 없음) |
| 택타일 | 0:0 · 5:0.13 · **5→19: 0.13→0.19 (1프레임 걸림)** · 26:0.62 · 31:1.0 (범프 뒤 가속) | e_b 0.12 | target −0.3, {14, 0.85} | e_t 0.10 | 범프 위치 = 0.5/3.3 ≈ 0.15 (상단 범프형). MX Brown형(중단 범프)은 위치 [미확인] → 0.4 [추정] |
| 클릭-재킷 | 0:0 · 9:0.36 · **9→21: 0.36→0.42 (걸림)** · ★click@21 · 25:0.72 · 29:1.0 (가장 빠른 충돌) | e_b 0.15 | target −0.3, {15, 0.8} | e_t 0.15 | 상승 클릭 없음. **재킷 리셋 전 재입력 → click 생략** |
| 클릭-바 | 위와 같은 형태, click@x≈0.45 | e_b 0.15 | 같음 | e_t 0.15 | ★upClick @ x≈0.5(상승) [위치 추정] |
| 저소음 리니어 | 0:0 · 8:0.32 · 16:0.72 · 22:0.90 · 32:0.94 (ease-out, 끝 기울기 0) | **반발 0**, 댐퍼 압축 0.94에서 정지 | target −0.2, {14, 0.9}, x<0.08에서 {10, 1.4} | **반발 0**, 감속 안착 | 흔들림(기울기 핑) 감쇠 강화 |
| 저소음 택타일 | 택타일 형태, 걸림 폭 절반 + 저소음 끝부분 | 반발 0 | 저소음과 같음 | 반발 0 | |
| HE 리니어 | 리니어와 같음(총행정 3.4~4.0 선택) | e_b 0.10 | 리니어와 같음 | e_t 0.10 | 작동점 마커(설정값/L), 표시등 |

- **세기 연동** [가설]: intensityScale 0.8~1.25로 시간축을 늘이고 줄인다. 충돌 속도 ∝ 1/scale로 바닥음 게인(±2 dB)과 반발 e(±0.03)를 조정한다.
- **키캡 흔들림(spring ping의 시각 대응)**: 진짜 "스프링 핑"은 수 kHz 소리라 눈에 보이지 않는다 [추정]. 대신 기존 기울기에 상단 도달 순간 작은 회전 임펄스(≤0.3°)를 주고 {freq 22, ζ 0.35}로 감쇠시킨다. 저소음은 ζ 0.8로 둔다. 이 이상은 과장이다.
- **현재 수치 처리**: 실물 4 mm = 1u(19.05 mm) 기준 0.21 단위인데, 현재 `vis.travel 0.13`은 약 2.5 mm에 해당한다 [확인: visual.ts]. 실제 비율 0.21까지 올리거나 현행을 유지한다 [미결정]. 시점이 위에서 약 57°라 수직 이동은 화면에서 약 0.54배로 줄어든다 [추정: 카메라 방향 (0,1.55,1)]. 메커니즘별 **총행정 비율(3.3/3.6/4.0)은 그대로 반영**해서 저소음·HE의 "짧은 행정"이 보이게 한다.

### 3.4 손가락 구동(스크럽) 모드 평가

- 방식: 키를 길게 누른 뒤(≥250 ms) 세로로 끌면 행정이 따라 움직인다. 범프는 화면 이동 대비 키 이동 비율(CD gain)을 떨어뜨렸다가 툭 넘기는 **유사 햅틱**으로 표현한다 [가설].
- 문제:
  1. pointerdown에서 이미 타건(소리)이 났으므로 제스처가 충돌한다.
  2. 손가락이 키를 가린다.
  3. 4 mm를 약 100 px 드래그에 매핑하면 25배 확대라 "실물 재현"이 아니다.
  4. 유리면에는 저항이 없어 힘곡선을 *느낄* 수 없다.
- 가치: HE의 Rapid Trigger(조금만 올려도 리셋)와 작동점 조절은 **이 모드에서만 의미 있게 보여줄 수 있다**. 탭 입력에서는 RT 차이가 몇 ms라 보이지 않는다.
- **판단: MVP 제외 [추천]**. v1.1+에서 "스위치 실험실"(키 하나를 확대한 단면도 + 힘곡선 그래프 + 작동/리셋 마커 + 슬라이더 스크럽)이라는 별도 화면으로 검토한다. 장난감 본 화면에는 넣지 않는다.

### 3.5 스페이스바·동시 입력·연타

- **스페이스바(스테빌라이저)** [가설]
  - 와이어가 양 끝을 수평으로 묶는다. 그래서 x축(좌우) 기울기는 지금(0.012 rad)보다 더 줄여 ≤0.006 rad로 하고, 앞뒤 기울기도 절반으로 한다.
  - 유효질량이 커서 곡선 시간 ×1.2, 복귀 freq ×0.8.
  - 상단 도달에 와이어 "틱"(사운드 레이어)을 추가하고, 시각적으로는 반발 e_t +0.03.
  - 덜 튜닝된 스테빌의 덜컹거림은 소리 프리셋 옵션으로만 둔다. 시각적 덜컹임은 과장이다.
  - 같은 스위치 메커니즘을 공유한다.
- **동시 입력**: 키별 상태를 독립으로 두고, 기존 holders 집합을 유지한다. 키끼리 시각적으로 엮지 않는다(케이스 흔들림 없음). 오디오는 기존 보이스 제한·덕킹으로 처리한다.
- **연타(같은 키, 상단 복귀 전 재입력)**: §3.2의 LUT 역탐색으로 현재 위치에서 다시 누른다. 남은 행정이 짧으니 충돌 속도와 바닥음 게인이 자동으로 줄어든다. 클릭-재킷은 리셋점 위로 돌아가지 않았으면 click을 생략한다(실물 거동 [추정: 재킷 리셋 히스테리시스]). 이를 위해 클릭 스위치는 **click/bottom 레이어 분리 샘플**이 필요하다 [가설].
- **현행 코드와의 차이**: `model.press()`는 holders 0→1일 때만 target을 바꾸고 Spring 상태(x, v)를 유지한다. 즉 "현재 위치에서 재시작"은 이미 성립한다 [확인: model.ts]. 바꿀 것은 곡선, 하드 스톱, 이벤트 발생 세 가지다.

---

## 4. 한계와 보정

### 4.1 화면이 재현할 수 없는 것 [확인: 하드웨어 사실]

- **힘·범프·클릭의 촉감**: 유리 화면은 저항이 0이고 압력을 모른다. 택타일·클릭 스위치의 정체성(손끝 걸림)은 **재현할 수 없다**. 리니어 대비 차이는 소리, 그리고 몇 프레임의 리듬으로만 전달된다.
- **iOS 웹 햅틱 없음**: Safari는 `navigator.vibrate`를 지원하지 않는다 [확인: MDN 호환표, 이번 조회에서 원문 재확인 안 함 → 검증필요]. `<input switch>` 햅틱 우회는 기획서 §10.3에서 이미 제외했다.
- **Android `vibrate(ms)`**: 지속시간과 패턴만 정할 수 있고 세기는 정할 수 없다. 모터 기동 지연(수십 ms 단위 [추정]) 때문에 10 ms 미만의 패턴 차이는 뭉개진다. → 메커니즘별 패턴 차등은 **대부분 체감되지 않을 것** [가설, 실기기 검증필요]. 제안: 바닥 1펄스(현행 6 ms)를 기본으로 하고, 클릭만 [5, 15, 5] 시험, 저소음은 4 ms 또는 끔. 기획서는 햅틱을 MVP 제외로 정했으나 코드에는 `ctx.haptic(6)`이 있다 → 정책 정합성 확인 [미결정].
- **60fps 시간 해상도**: §3.1처럼 실물 타건은 1~2프레임이다. 120 Hz 기기라도 Safari의 rAF가 60 Hz로 묶이는지는 [검증필요].

### 4.2 보정 수단과 "과장 경계선"

| 수단 | 쓰는 법 | 과장으로 넘어가는 지점 | 판단 |
|---|---|---|---|
| 리듬(곡선 양식화) | 걸림 1프레임, 클릭 후 빠른 충돌, 저소음 ease-out | 걸림 ≥2프레임 또는 바닥 도달 >45 ms → 굼뜨고 소리와 어긋남 | **채택** |
| 소리 | 주 채널. 클릭·바닥·복귀 레이어 | 실물보다 큰 클릭, 과한 잔향 | **채택**(오디오 에이전트 소관) |
| 접촉 그림자/AO | 키캡이 내려갈수록 키캡-플레이트 틈 어두워짐 | 없음(물리적으로 맞음) | **채택**, 비용 낮음 |
| 키캡 미세 흔들림 | 상단 도달 ≤0.3° | 눈에 띄는 흔들림, 위로 튀어오름 | 제한 채택 |
| 카메라 미세 흔들림 | — | 실물 키보드는 타건으로 화면이 흔들리지 않는다. 연타 시 멀미·피로 | **비채택** |
| 키캡 찌그러짐(squash) | — | 플라스틱은 변형되지 않는다 | **비채택** |
| 파티클/플래시 | — | 실사 방향과 충돌 | **비채택** |
| HE 표시등 | 키 아래 은은한 LED, 작동점 통과 시 ON | 강한 블룸·컬러 사이클 | 제한 채택(HE 선택 시만) |
| Android 진동 | 바닥 1펄스 | 메커니즘별 "다른 촉감"을 약속하는 문구 | 보너스, 차이 약속 금지 |

---

## 5. 3D 표현 권고

### 5.1 스위치를 보여줄 것인가

| 안 | 내용 | 비용 | 가치 | 판단 |
|---|---|---|---|---|
| A. 숨김(현행) | 키캡 아래 어두운 하우징 박스만 | 0 | 메커니즘은 소리와 리듬으로만 전달 | **MVP 기본 [추천]** |
| B. 모든 키 투명 하우징 | 반투명 PC 상판 + 색 스템 | 드로우콜 +3~4(인스턴싱 시), 반투명 정렬 문제. `transmission`은 추가 렌더 패스라 모바일에서 비싸다 | 시각 노이즈. 키캡이 대부분 가림 | 비추천 |
| C. 점검 키 1개 / "키캡 벗기기" 토글 | 키 하나의 키캡을 들어 올려(애니메이션) 스위치를 노출. 스템·스프링(y 스케일)·재킷/바가 행정에 연동 | 지오메트리 2~5k tri, 드로우콜 +4~5, 반투명은 `opacity`+`depthWrite:false`(transmission 금지) | **"이건 클릭 스위치다"를 눈으로 보여주는 유일한 정직한 방법**. 클릭 재킷 낙하·바 회전이 실제로 보인다 | v1.1 [추천] |
| D. 단면 실험실 화면 | §3.4와 결합 | 별도 화면 | 교육적 | v1.1+ |

- 스템 색은 일반 색상명(빨강·갈색·파랑 등)으로 쓴다. 다만 특정 회사의 색 코드 체계를 그대로 연상시키는 배색과 이름 조합은 피한다(§8.2 상표 정책) [검증필요: 법무].
- 클릭-재킷과 클릭-바 구분은 C안에서만 의미가 있다. A안에서는 소리(상승 클릭 유무)로만 구분된다.

### 5.2 키캡 재질과 소리 스타일

- 메커니즘(느낌)과 **소리 스타일(빌드: 키캡·보강판·흡음)**은 **직교하는 두 축**이다 [추천]. UI는 "스위치 5종 × 소리 톤 2~4종"이 된다. 단 샘플 수가 곱해지는 점이 비용 리스크다(§8.2의 프리셋당 55~70 샘플 × 메커니즘 수) [미결정: 오디오 에이전트와 합의].
- 재질 매핑(현행 유지 + 확장):
  - PBT 무광(roughness 0.55~0.65, clearcoat 0) ↔ 저음·둔탁(조약돌)
  - ABS 유광(0.25~0.35, clearcoat 0.45) ↔ 고음·밝음(까랑까랑)
  - 저소음 프리셋: PBT 무광 + 약간 어두운 톤(시각적으로 "조용함")
  - HE: 반투명 하우징 대신 키 밑 LED 띠 정도
- 저소음 스위치의 "짧은 행정(3.3~3.7)"은 메커니즘 축에서 반영한다. 키캡 재질과는 무관하다.

---

## 6. 열린 질문

1. **후보 모델 확정**: HMX 몽돌축, 키위치/레오폴드 개량 리니어, KTT 바다축/화이트축, Holy Panda "V2", Aqua Panda, "바나나축"(Gateron Jupiter Banana인지 Smoothie인지 Keychron K Pro인지)은 정확한 상품명이나 판매 URL이 필요하다. 나머지는 위 표의 출처로 충분하다.
2. "Kailh Box Blue"는 현재 리니어다. 클릭-바 대표는 Box White로 바꿔도 되는가?
3. Razer analog는 광학이다. "자석/HE" 메뉴를 "아날로그(작동점 조절)"로 이름을 바꿀 것인가, 아니면 Razer를 빼는가?
4. 소리 지연 정책 A(즉시) vs B(예약, 정확 동기): A/B 테스트 기준과 실기기 측정을 정해야 한다.
5. 시각 행정 0.13(현행) vs 0.21(실제 비율): 미관 우선인가, 실측 우선인가?
6. 걸림 1프레임 양식화가 실기기 60 Hz와 120 Hz에서 "걸림"으로 읽히는지 사용자 블라인드 테스트(리니어 vs 택타일 구분율)가 필요하다. 구분율이 우연 수준이면 **시각 차이는 포기하고 소리에만 맡긴다**.
7. 햅틱이 MVP 제외인데 코드에 `haptic(6)`이 있다. Android 메커니즘별 패턴을 시험할 것인가?
8. 메커니즘 × 소리 톤의 샘플 곱셈 비용: 메커니즘별 녹음을 할 것인가, 공통 바닥음 + 메커니즘 레이어(클릭·범프 마찰)로 합성할 것인가?
9. 클릭-재킷 리셋 히스테리시스(재입력 시 클릭 생략) 같은 실물 디테일을 넣을 것인가? 레이어 분리 샘플이 필요하다.
10. "스위치 실험실"(스크럽 + 단면 + 힘곡선)을 v1.1 범위에 넣을 것인가? HE Rapid Trigger를 보여줄 수 있는 유일한 경로다.
11. 사용자 앞에서 스위치 실명을 언급하지 않는다는 원칙(§8.2)을 이 기능에도 적용하는지 확인. 적용 시 이 문서의 표는 내부 근거로만 쓴다.

---

### 부록: 계산 근거 파일 (스크래치패드)
- `/private/tmp/claude-501/-Users-hgoose-mazizak/392c6c32-3088-4332-84e1-f457448c447f/scratchpad/kbsim/fsim.py`, `fsim2.py` — 1D 힘곡선 + 하드 스톱 시뮬레이션(§3.1 표의 출처)
- `sim.py`/`sim2.py`/`sim3.py` — 기존 Spring 해석해로 "구간별 목표 이동" 방식을 시험한 것. **실패 사례**: 운동량 때문에 범프 걸림이 거의 생기지 않거나, 강하게 걸면 역주행했다 → 구운 LUT 방식을 추천하는 근거
