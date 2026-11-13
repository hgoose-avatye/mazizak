# 키보드 타건 시뮬레이터 — 오디오 기술 설계 (Audio agent, 계획 전용)

작성: 2026-11-09 · 범위: 설계/계획만. 코드·저장소 파일은 수정하지 않음.
태그: [확인] 코드·문서·출처로 확인 / [추정] 근거 있는 추산 / [가설] 검증 전 설계 가정 / [검증필요] 실측·청취로 확인해야 함 / [추천] 이 문서의 권고

---

## 0. 현재 상태 요약 (읽은 것)

- **프리셋**: `KeySwitchPreset = 'pebble' | 'clack'` 2종(조약돌/까랑까랑). 역할(role)은 `down / up / spaceDown / spaceUp` 4개뿐이며 velocity layer는 없음 [확인: `src/toys/keyboard/toy.ts`].
- **선택 로직**: `soundDown`은 키가 스페이스면 `kb:{preset}:spaceDown`, 아니면 `kb:{preset}:down`. 키별 고정 detune `((i*37)%31)-15` cent, 랜덤 detune ±12 cent, gain jitter ±1.2 dB, 직전 down과의 간격 < 85 ms면 −2 dB, 팬 = x·0.22, 녹음 샘플이면 +6 dB makeup. `soundUp`은 **누를 때의 프리셋을 기억**(`heldPreset`)해서 같은 프리셋의 up을 재생 [확인].
- **엔진**: `AudioBufferSourceNode` 원샷, `Bag`(shuffle-bag, 직전 2개 회피), 전역 보이스 20개(초과 시 가장 오래된 것 3 ms 시상수 페이드), 30 ms 창 안의 동시 시작은 1–6 ms 흩뿌림 + 약 −8·log10(n+1) dB, 리미터(−8 dB, 20:1) + tanh 소프트클립, `latencyHint:'interactive'`, suspended 중 요청은 80 ms 안에 resume되면 재생·아니면 폐기 [확인: `src/core/audio.ts`]. **키당 보이스 제한은 없음** [확인].
- **샘플**: `public/sfx/keyboard/pebble.wav`(Rainy 75, 가스켓·윤활 리니어, Freesound 815614, CC0) — down 10 / up 7 / spaceDown 4 / spaceUp 3, 총 2.36 s(디코딩 후 약 0.45 MB). `clack.wav`(WhiteFox, Hako Violet 택타일, Freesound 546045·546167, CC0) — down 10 / up 8 / spaceDown 4 / spaceUp 3, 총 3.27 s(약 0.63 MB) [확인: JSON 계산]. **스페이스바는 둘 다 대체(proxy)**, 조약돌 up은 추정된 복귀음 [확인: CREDITS.md, RECORDING_SPEC_keyboard.md].
- **병렬 브랜치**(`/Users/hgoose/mazizak-sound`): B 뱅크 = Gateron Yellow 윤활(665075, 조약돌, down 중심주파수 약 1.7 kHz) / Gateron Blue 클릭(755222, 까랑까랑, 약 4.6 kHz). 블라인드 A/B 페이지(`sound-ab.html`)가 이미 있음 [확인]. 주목할 점: **clack(Blue) down의 onset→최대 프레임이 28 ms**(pebble 8 ms) — 클릭이 먼저 나고 더 큰 바닥 충격이 뒤에 오는 2-이벤트 구조일 가능성 [추정, 파형 확인 필요].
- 기획서 §8.2의 "서각서각 = 2–8 kHz 마찰음이 주인공", "보글보글 = 무접점(돔+스프링)" 설정은 [가설] 상태. §8.6: 직접 폴리 녹음이 주력, CC0는 보조 [확인].

---

## 1. 타건음 해부: 레이어와 소유권

### 1.1 레이어 목록

| # | 레이어 | 물리적 원인 | 발생 시점(실물) | 소유 | 비고 |
|---|---|---|---|---|---|
| L1 | 스템/스프링 마찰(scratch) | 스템-하우징 레일 마찰, 스프링 긁힘 | 누름·복귀 전 구간 | **메커니즘**(윤활이 크게 좌우 → 스타일과 공동) | 윤활하면 줄어듦 [확인: 출처 S6, S7] |
| L2 | 택타일 범프 틱 | 스템 다리가 리프를 넘어감 | 프리트래블 ~1–2 mm 지점 | **메커니즘** | 비클릭 택타일은 대체로 작음 [추정] |
| L3 | 클릭 | 클릭 재킷이 하우징에 스냅 / 클릭바(금속)가 하우징 타격 | **바닥 전** 작동점 부근, 바: 복귀 때도 | **메커니즘** | 재킷: 주로 누를 때만, 바: 누름·복귀 모두 [확인: S1, S2]. 재킷의 복귀 클릭은 약하게 들린다는 사용자 보고가 있으나 리뷰(RTINGS)는 "다운스트로크만"으로 기술 → 녹음으로 확인 [검증필요] |
| L4 | 바닥 충격(bottom-out) | 스템→하우징 바닥, 키캡 스커트→스위치 상단, 이 진동이 플레이트·케이스·흡음재로 전달 | 이동 끝 | **스타일**(키캡·플레이트·케이스·폼) × 메커니즘 감쇠(저소음 패드) | 사운드 "캐릭터"의 대부분 [추정: S6에서는 스위치가 가장 크다고 보지만 커뮤니티 블로그 수준] |
| L5 | 복귀 충격(top-out) | 스템이 상부 하우징에 부딪힘 | 손 뗀 뒤 수 ms | **스타일 몸체** × 메커니즘(저소음 패드, 스프링 세기) | 저소음 스위치는 패드로 top/bottom 둘 다 줄이거나 한쪽만 줄임 [확인: S4] |
| L6 | 스프링 핑 | 스프링 공진(금속 케이스/플레이트에서 두드러짐) | 충격 직후 꼬리 | **스타일**(윤활·케이스) | 결함음으로 취급, 기본 OFF [추천] |
| L7 | 스테빌라이저 덜컹(rattle) | 와이어·하우징 유격 | 스페이스 down/up | **스타일**(클리핑·윤활) + 키그룹 | 스페이스 전용 |

### 1.2 합성식

```
sound(event, key) = Σ_layer  gain_l · sample_l( shufflebag ) @ t0 + offset_l
                   = mechanismLayer(event) ⊕ styleBody(event, keyGroup) ⊕ keyGroupExtras(stab)
```

**터치스크린 특유의 시간 기준** [추천]: 실물은 "손가락 접촉 → 2 mm 이동(클릭) → 바닥" 순서지만, 유리 화면에서 `pointerdown`은 손가락이 **이미 멈춘 순간**이고 여기에 입력·출력 지연(§4)이 이미 쌓여 있다. 그러므로 **첫 가청 트랜지언트를 t=0에 두고, 그 뒤 레이어는 짧게만 늦춘다.** 마찰(L1)처럼 바닥보다 앞서야 하는 소리는 pre-roll이 불가능하므로 바닥 샘플 onset 앞 0–3 ms에 낮게 섞거나 생략한다.

| 이벤트 | 메커니즘 | 레이어 타이밍(t0 = 이벤트 처리 시각) |
|---|---|---|
| down | Linear / HE | L4 @0 (+L1 −18 dB @0, 선택) |
| down | Tactile | L2 @0 (−10~−14 dB) → L4 @+4~8 ms |
| down | Clicky | L3 @0 → L4 @**+6~12 ms** (MVP 기본 8 ms) |
| down | Silent | L4(감쇠형) @0, L1 상대적으로 크게(−8~−12 dB) |
| up | Linear/Tactile/HE | L5 @0 |
| up | Clicky-bar | L3(복귀 클릭) @0 → L5 @+4~8 ms |
| up | Clicky-jacket | L5 @0 (+재킷 복귀 클릭 −15 dB 이하, 녹음 확인 후) |
| up | Silent | L5(감쇠형, 매우 작음) @0 + L1 |
| space down/up | 공통 | 위 + L7 @+2~6 ms |

- 클릭→바닥 간격 근거 [추정]: 클릭 지점(약 2 mm)에서 바닥(약 4 mm)까지 2 mm, 타건 시 손가락 속도 0.1~0.3 m/s를 가정하면 약 7~20 ms. 그러나 위 이유(이미 지연 누적)로 **하한 쪽 6~12 ms**를 기본으로 쓰고, 강도(velocity)가 클수록 간격을 줄인다(세게 = 빨리 내려감). Blue 녹음의 28 ms 피크 지연은 저속 타건이었을 가능성 [추정]. 최적값은 청취 테스트 T10 [검증필요].

### 1.3 레이어 조합 vs 조합별 프리믹스

| 기준 | A. 조합별 프리믹스(프리셋 = 녹음 1세트) | B. 레이어 조합(메커니즘 ⊕ 스타일) |
|---|---|---|
| 사실감 | **높음** — 실제 결합 진동(클릭이 같은 키캡·플레이트를 울림)이 그대로 [추정] | 중 — 클릭 샘플이 다른 보드의 공간감을 갖고 있으면 "두 소리가 따로 논다" 위험 [가설] |
| 일관성(코히어런스) | 높음 | 레이어 녹음 환경을 맞춰야 함(같은 마이크·거리·방). 맞추지 못하면 낮음 |
| 지연 | 소스 1개 → 최소 | 소스 2~3개, `start(t)` 오프셋만 다르므로 CPU 지연 영향은 무시 가능 [추정]. 단 보이스 수 2~3배 |
| 메모리 | 프리셋 4종 ≈ 5.9 MB(아래 §2.3) — 조합 수에 선형 | 스타일 4 + 메커니즘 공용 ≈ 6.0 MB로 **20조합** 커버 |
| 녹음 비용 | 조합마다 보드 구성 + 전체 테이크 | 스타일 몸체(리니어로) + 메커니즘 레이어(지그로 분리 녹음). 레이어 분리 녹음은 기술적으로 더 어려움 |
| 확장성 | 낮음(사용자 조합 선택 불가) | 높음(스위치×스타일 선택 UI 가능) |

**[추천] MVP = A(프리믹스) 4프리셋.** MVP 프리셋은 고정 조합이고, 사실감이 최우선 리스크(§17.3 킬 기준)이므로.
- 단, 녹음 세션에서 **B를 위한 재료를 함께 수집**한다(같은 핫스왑 보드에서 스위치만 교체한 리니어/택타일/클릭 테이크, 클릭만 나도록 바닥 직전까지 지그로 누른 테이크, 스테빌 단독 테이크). 추가 비용은 세션당 30~60분 수준 [추정].
- **[추천] 후속(v1.x) = 하이브리드 B**: 스타일 몸체는 "리니어 기준 프리믹스", 메커니즘은 L2/L3 오버레이 + 저소음은 몸체의 별도 감쇠형 뱅크. 블라인드 테스트 T1에서 "프리믹스 클릭형 vs 리니어몸체+클릭 오버레이"가 구분되지 않거나(정답률 ≤ 60%) 선호 차이가 작을 때만 전환.

---

## 2. 프리셋별 샘플 세트 명세

### 2.1 메커니즘별 실제 소리 [추정 + 출처]

- **Linear**: 바닥·복귀 충격 + (미윤활 시) 마찰. 캐릭터 대부분은 키캡·플레이트·케이스가 결정 [추정, S6/S7].
- **Tactile(비클릭)**: 리니어와 비슷하되 범프 틱이 약간, 복귀음이 리니어보다 뚜렷한 제품이 있음 [추정]. **리니어와 귀로 구분이 안 될 수 있음** → T2로 확인 [검증필요].
- **Clicky**: 재킷형(예: Cherry MX Blue 계열)은 주로 누를 때 클릭, 클릭바형(Kailh Box Jade 계열)은 누름·복귀 모두 크고 "바삭한" 클릭 [확인: S1, S2, S3]. 클릭이 바닥 전에 발생 [확인: 메커니즘 구조].
- **Silent**: 스템/하우징의 실리콘 등 댐퍼로 바닥·복귀 충격을 줄임. 설계에 따라 복귀만 조용해지고 바닥은 그대로인 제품도 있음 [확인: S4]. 결과적으로 "툭툭/서각" — 저역의 둔탁한 짧은 충격 + 상대적으로 드러나는 마찰. 세게 치면 댐핑 효과가 줄어듦 [확인: S4]. 윤활은 마찰·긁힘에 효과, 바닥/복귀 소음엔 효과 적음 [확인: S4].
- **Magnetic/HE**: 감지 방식만 다르고 기계적으로는 대부분 **리니어** [추정]. 소리는 하우징·스템 재질에 좌우되어, 밝은 "clacky" HE도 있고 조용한 HE도 있음 — 출처끼리 상충 [확인: S5(Tom's Guide "대체로 조용"), S8(Milktooth "Magnetic Jade는 밝고 clacky")]. **[추천] HE는 소리 카테고리로 만들지 않는다.** 소리는 Linear 메커니즘과 동일하게 처리하고, HE는 시각/기능(예: 래피드 트리거 연출) 차별화로만 다룬다. 만든다면 "HE = Linear + 스타일 아무거나"로 매핑.

### 2.2 MVP 4프리셋 매핑 [추천]

| 프리셋(의성어 이름) | 메커니즘 | 스타일 | 키다운:키업(기획 §8.2) | 음원 확보 |
|---|---|---|---|---|
| 묵직한 리니어 (도각·조약돌) | linear | 조약돌(thocky) | 1 : 0.5~0.6 | 현 CC0(Rainy 75 / Gateron Yellow 윤활)로 임시. 스페이스·up은 **자체 녹음 필수** |
| 경쾌한 택타일 (또각·타각) | tactile | 까랑까랑(clacky) 쪽 | 1 : 0.8~1.0 | 현 CC0 WhiteFox(Hako Violet 택타일)가 이미 이 조합에 가까움 [확인: CREDITS]. 스페이스 자체 녹음 |
| 클릭형 (찰칵·딸깍) | clicky (bar 또는 jacket 1종 선택) | 중립~밝음 | 1 : 0.6~1.0 (바형은 up 클릭 때문에 큼) | CC0 Gateron Blue(755222, 재킷형) 존재 [확인: mazizak-sound]. 바형은 자체 녹음 |
| 저소음 리니어 (서각·툭툭) | silent-linear | 서각서각(soft) | 1 : 0.2~0.3 | CC0 미확인 → **자체 녹음 필수** [검증필요: Freesound 검색] |

- **보글보글(creamy)** 은 MVP에서 제외 [추천]: 기획서의 "정전용량 무접점" 레퍼런스는 상표·제품 재현 리스크가 있고(§8.2 상표 정책), 리니어+조약돌과의 청각적 구분이 T3에서 확인되기 전까지 4번째 스타일로 두지 않는다.
- 프리셋 이름은 의성어 + 성질(묵직한/경쾌한)만, 스위치·보드 제품명은 내부 기록에만 [확인: §8.2 정책].

### 2.3 이벤트 × 변형 × velocity (프리믹스, 프리셋 1개 기준) [추천, 수치는 추정]

| 역할 | velocity layer | 라운드로빈/layer | 평균 길이 | 합계 길이 |
|---|---|---|---|---|
| down (일반키) | 3 (살살/보통/세게) | 8 | 120 ms | 2.88 s |
| up (일반키) | 2 (짧은 탭 / 보통 유지 후) | 6 | 100 ms | 1.20 s |
| spaceDown | 2 | 5 | 220 ms | 2.20 s |
| spaceUp | 2 | 4 | 180 ms | 1.44 s |
| **합계** | | 54개 | | **7.72 s ≈ 1.48 MB** |

- 메모리 = 길이 × 48000 × 1ch × 4 B(기획 §8.4 공식, 디코딩 후 Float32). 4프리셋 = **약 5.9 MB**, 활성 프리셋만 디코딩·나머지는 지연 로드 시 **상주 약 1.5 MB** [추정]. 기획서의 "2종 6.7 MB"는 샘플당 평균 약 0.3 s 꼬리를 가정한 값이라 더 보수적 [추정].
- 현재 대비: 현 스프라이트는 프리셋당 24~25개, 0.45~0.63 MB [확인].
- 클릭형은 별도 "click"/"bump" 역할을 두지 않는다(프리믹스에 포함). 단 클릭바형 up은 클릭 포함 테이크를 사용.
- 레이어 방식(후속) 추정: 메커니즘 공용(클릭 down 8×40 ms, 클릭 up 6×40 ms, 범프 6×30 ms, 마찰 4×80 ms, 핑 4×150 ms, 스테빌 down/up 4+4×120 ms ≈ 2.6 s ≈ 0.5 MB) + 스타일 몸체(≈7.2 s ≈ 1.37 MB/스타일) → 4스타일 ≈ **6.0 MB로 20조합** [추정].
- 녹음: 이벤트당 20테이크 이상 → 6~10개 선별(§8.6) [확인]. velocity 3단계 × 키 5종(위치별 음색차 확보) × 6회, 스페이스 중앙·좌·우 × 8회(RECORDING_SPEC 확장) [추천].

### 2.4 CC0 vs 자체 녹음

| 항목 | CC0로 가능? | 판단 |
|---|---|---|
| 리니어/택타일/클릭(재킷) 일반키 down | 예 — 이미 확보 [확인] | 프로토타입·A/B용. 출시 전 자체 녹음으로 교체 [추천, §8.6] |
| 일반키 up(진짜 복귀음) | 부분적(WhiteFox만 press→release 쌍 확인) [확인] | 자체 녹음 |
| 스페이스바(스테빌 포함) | 확보 못 함 — 전부 proxy [확인] | **자체 녹음 필수** |
| velocity 3단계 | 연속 타이핑 클립에서 강도 분류는 불확실 | 자체 녹음 |
| 저소음 리니어 전체 | 미확인 [검증필요] | 자체 녹음 |
| 클릭바 down/up | 미확인 | 자체 녹음 |
| 레이어 분리음(클릭 단독, 범프, 핑, 스테빌 단독) | 사실상 없음 [추정] | 자체 녹음(지그 사용) |

---

## 3. 빠른 타이핑과 자연스러운 반복

1. **Shuffle-bag 강화** [추천]: 현재 `avoid=2`. 변경안 — (a) avoid = min(3, n/2), (b) **"재생 중 버퍼 제외"**: 최근 40 ms 안에 시작된 같은 버퍼는 후보에서 제외(화음에서 동일 샘플 중첩 방지). (c) velocity layer 별로 별도 bag.
2. **키별 개성** [가설]: 실물은 키 위치(플레이트 중앙/가장자리)마다 음색이 조금씩 다르다. 현재의 키별 고정 detune(±15 cent)에 더해 **키별 고정 EQ 틸트**(±1 dB 하이셸프)와 **키별 선호 RR 부분집합 가중치**(예: 키마다 8개 중 5개에 가중 2배)를 둔다. "같은 키를 연타하면 비슷하고, 다른 키는 다르다"는 실물 감각을 노림 → T4.
3. **런타임 미세 변주**: 현재 ±12 cent/±1.2 dB 유지. 기획서 범위(±20~50 cent)는 타건음에선 과할 수 있음 [추정] → T5.
4. **강도 추정(압력 없음)** — down 시점에 알 수 있는 정보만 사용: 직전 down과의 간격(IOI)의 지수이동평균, 동시에 눌린 손가락 수, (선택) 접촉 반경. [가설] 규칙: IOI > 350 ms → 보통/세게 (60:40), 150~350 ms → 보통, < 150 ms → 살살/보통 (60:40), 가중 랜덤으로 선택. 누른 시간(hold)은 up에서만 사용(짧은 탭 < 60 ms → "짧은 탭 up" layer).
5. **연타 덕킹**: 현재 IOI < 85 ms면 −2 dB 계단. → **연속형**: `duckDb = −clamp(3 · (1 − IOI/200ms), 0, 3)` + velocity layer를 낮추는 쪽을 우선(게인만 낮추는 것보다 스펙트럼까지 바뀌어 자연스러움) [가설].
6. **top-out 전 재트리거 / 짧은 탭** [추천]: 터치에서는 같은 포인터로 같은 키를 다시 누르려면 먼저 떼야 하므로 진짜 재트리거는 (a) 물리 키보드 입력 (b) 다른 손가락으로 같은 키를 누르는 경우뿐. 규칙 — down→up 간격 < 40 ms면 up은 "짧은 탭" layer, −3 dB, 시작을 `max(now, downStart + 15 ms)`로 미뤄 바닥음 트랜지언트와 겹치지 않게. 같은 키에 새 down이 오면 그 키의 이전 보이스를 5 ms 페이드로 정리.
7. **보이스 제한** [추천]: 키당 최대 2(직전 down 꼬리 + up), 스페이스는 3(스테빌 꼬리), 전역 16~24(기획 §8.4). 현재 엔진은 전역 20만 있고 키당 제한이 없음 [확인] → 추가 필요.
8. **화음 1/√N**: 현재 30 ms 창 밀도 감쇠(약 −8·log10(n+1) dB ≈ 1/(n+1)^0.4)는 1/√N(= −10·log10 N dB)과 비슷한 의도 [확인]. 5키 동시면 1/√5 ≈ −7 dB. 유지 [추천].
9. **콤 필터링 회피** [추천]: 동일 버퍼가 1~10 ms 차이로 겹치면 콤 필터가 생김(엔진의 1~6 ms 흩뿌림은 **같은 버퍼라면 오히려 콤을 만든다** [추정]). → 위 1(b)로 동일 버퍼 중첩을 금지하고, 불가피하면 detune을 25 cent 이상 벌리거나 0.6~0.8 ms 이상의 비정수배 오프셋 대신 서로 다른 RR을 쓰는 것이 원칙. 화음 테이크 RR 수 ≥ 6이면 5키 화음도 서로 다른 버퍼로 충당 가능.

---

## 4. 지연(latency)

### 4.1 구성 요소와 추정치 [추정 — 실측 전]

| 구간 | 추정 | 비고 |
|---|---|---|
| 터치 패널 스캔 + OS·브라우저 이벤트 전달 → `pointerdown` | 15~40 ms | 기기 의존 [추정] |
| JS 핸들러 → `src.start(0)` | < 2 ms | 현재 `inputImmediate`에서 rAF를 기다리지 않고 바로 재생 [확인] |
| 렌더 퀀텀 | 128 frames ≈ 2.7 ms @48 kHz | [확인: Web Audio 사양] |
| `baseLatency` + `outputLatency` | iOS 수~20 ms대, Android 20~50 ms, 일부 Android 100 ms 이상 [추정] | Chromium은 outputLatency를 플랫폼 콜백 버퍼 크기로 보고(예: Android 96 frames) [확인: S9]. Safari 지원은 18.4부터 [확인: S10]. 값이 실제 출력 지연을 다 포함한다는 보장은 없음 [검증필요] |
| 블루투스 출력 | +100~300 ms [추정] | 웹에서 제어 불가(§8.5). `outputLatency`가 BT를 반영하는지는 브라우저별 [검증필요] |

- **목표 예산** [추천]: 유선/내장 스피커에서 touch→sound **p50 ≤ 50 ms, p95 ≤ 80 ms(iPhone 기준), Android ≤ 100 ms p95**. 측정은 기획 §17.4의 240 fps 카메라 방식 + `latencyInfo()` 기록을 병행.
- **pointerdown에서 바로 재생** [확인: 현재 구조]. 미리 예약(look-ahead)은 지연만 늘리므로 쓰지 않고, 레이어 오프셋(§1.2)만 `currentTime + offset`으로 예약.
- **활성화 제약**(§8.5): 터치에서 `pointerdown`은 사용자 활성화가 아님 [확인: 기획서 인용 MDN]. 현재는 홈 탭(pointerup)에서 미리 언락하므로 키보드 진입 시점엔 대개 running [확인: MVP_STATUS]. 딥링크로 키보드에 바로 들어온 경우: 첫 down은 suspended → 80 ms 안에 resume 안 되면 폐기(현재 동작) [확인]. [추천] 첫 down은 폐기하고, 첫 pointerup에서 언락과 동시에 up 소리를 내 "첫 소리 = 복귀음"(§8.5 원칙)을 유지 + 비주얼은 즉시 반응.
- **BT 안내** [추천]: `outputLatency > 0.08 s`가 읽히면 1회 비모달 안내("무선 이어폰은 소리가 늦을 수 있어요"). 보정(오디오를 앞당기기)은 불가능하고, 비주얼을 늦추는 보정은 손맛을 해치므로 하지 않음.

---

## 5. 프리셋 데이터 모델 (TypeScript 스케치) [추천]

```ts
type SwitchMechanism = 'linear' | 'tactile' | 'clicky-jacket' | 'clicky-bar' | 'silent-linear' | 'magnetic-linear';
type KeyGroup = 'alpha' | 'space';
type KeyEvent = 'down' | 'up';
type Layer = 'scratch' | 'bump' | 'click' | 'bottom' | 'top' | 'ping' | 'stab';
type Velocity = 0 | 1 | 2;                      // 살살 / 보통 / 세게 (up은 0=짧은탭, 1=보통)

interface SampleBank {                          // 스프라이트 내 엔트리 id들
  byVelocity: Partial<Record<Velocity, string[]>>;
  provenance: 'self-recorded' | 'cc0' | 'proxy' | 'derived' | 'synth';
}

interface LayerRule {
  bank: SampleBank;
  offsetMs: [number, number];                   // [세게일 때, 살살일 때] 보간
  gainDb: number;
  events: KeyEvent[];
}

interface MechanismProfile {
  id: SwitchMechanism;
  layers: Partial<Record<Layer, LayerRule>>;    // 메커니즘 소유: scratch, bump, click
  bodyMod: { bottomDb: number; topDb: number; lowpassHz?: number }; // 저소음 등: 스타일 몸체를 얼마나 누르는가
  soundsLike?: SwitchMechanism;                 // magnetic-linear → 'linear'
}

interface SoundStyle {
  id: 'pebble' | 'clack' | 'creamy' | 'soft';   // 조약돌/까랑까랑/보글보글/서각서각
  body: Record<KeyGroup, Record<KeyEvent, SampleBank>>; // bottom/top
  extras?: Partial<Record<'ping' | 'stab', SampleBank>>;
  upToDownRatioDb: number;                      // §8.2의 키다운:키업 비
  recordedWith: SwitchMechanism;                // 몸체에 이미 섞인 메커니즘(보통 linear)
}

interface KeyboardPreset {
  id: string; label: string;                    // 의성어 이름만
  mechanism: SwitchMechanism;
  style: SoundStyle['id'];
  premixed?: Record<KeyGroup, Record<KeyEvent, SampleBank>>; // MVP: 있으면 이것만 사용
  premixedIncludes?: Layer[];                   // 프리믹스에 이미 포함된 레이어(중복 오버레이 금지)
  tuning: { detuneCents: number; gainJitterDb: number; keyTiltDb: number; duckMaxDb: number };
}
```

**바인딩 규칙**: `premixed`가 있으면 그것만 재생(+ `premixedIncludes`에 없는 메커니즘 레이어만 오버레이 허용). 없으면 `style.body` + `mechanism.layers`를 합성하고, `style.recordedWith === mechanism`이면 메커니즘 레이어 중복을 끈다(예: 리니어로 녹음한 몸체에 클릭만 추가).

**폴백 순서** [추천] (각 단계 `provenance`를 HUD/리포트에 기록):
1. velocity layer 누락 → 가장 가까운 layer + 단계당 ±3 dB, 약한 쪽은 lowpass 0.7배 [가설].
2. space 누락 → alpha 뱅크 rate 0.85~0.9 + 1 dB + `stab` 레이어(있으면). provenance='proxy' (현재 방식과 동일 [확인]).
3. up 누락 → down의 가장 약한 layer, −8 dB, lowpass. provenance='derived'.
4. clicky-bar up 클릭 누락 → down 클릭 −4 dB, +30 cent.
5. 저소음 스타일 누락 → 가장 가까운 스타일 몸체에 `bodyMod`(bottom −10 dB, top −16 dB, lowpass 2.5 kHz) 적용. **사실감 낮음** — 출시용 아님 [가설].
6. 샘플 로드 실패 → 기존 절차적 합성(`sfx.ts`) [확인: 현재 동작].

---

## 6. 정직한 한계와 청취 테스트

### 6.1 한계
- 위 레이어 소유권 표, 타이밍, velocity 규칙은 **녹음·청취 전 설계 가정**이다. 이 문서 작성자는 어떤 소리도 직접 들을 수 없었다.
- 출처(S1~S8)는 대부분 리뷰·벤더 블로그로, 통제된 음향 측정이 아니다. "스위치가 소리를 가장 크게 좌우한다" vs "키캡·케이스가 좌우한다"는 출처끼리도 엇갈린다 [확인: S6].
- 휴대폰 스피커는 저역(약 300 Hz 이하)을 거의 재생하지 못해 **조약돌의 "도각" 저역 캐릭터가 사라질 수 있음** [추정]. 병렬 브랜치 녹음의 중심주파수(1.7 kHz vs 4.6 kHz) 차이가 스피커에서 구분 근거가 될 가능성이 큼 [추정].
- 레이어 합성의 코히어런스(다른 보드의 클릭+몸체)는 녹음 전에는 판단 불가.
- 지연 수치는 전부 추정. 실기기 측정 전엔 목표치일 뿐.
- 상표: 의성어 프리셋명이라도 "특정 스위치 소리 재현" 마케팅 금지. 법무 확인 [검증필요].

### 6.2 청취 테스트 목록 (기존 `sound-ab.html` 블라인드 A/B 재사용) [추천]

| ID | 질문 | 방법 | 판정 기준(제안) |
|---|---|---|---|
| T1 | 프리믹스 클릭형 vs (리니어 몸체 + 클릭 오버레이) 구분되나 | ABX, 20회 × 8명+ | 정답률 ≤ 60%면 레이어 방식 채택 가능 |
| T2 | 같은 스타일에서 리니어/택타일/클릭을 구분하나 | 3지선다 식별 | 택타일-리니어 혼동 > 40%면 택타일을 별도 소리 카테고리로 두지 않음 |
| T3 | 4스타일(조약돌/까랑까랑/보글보글/서각서각) 구분 | 4지선다 + 이름 매칭 | 보글보글이 조약돌과 혼동되면 MVP 제외 확정 |
| T4 | 반복 감지: RR 4 / 8 / 12, 키별 개성 on/off | 30초 자동 타이핑 재생, "기계 같다" 지적 시점 | 8에서 감지율이 12와 유의차 없으면 8 고정 |
| T5 | 미세 변주 폭 ±10 / ±25 / ±50 cent | 선호 A/B | 가장 자연스러운 폭 |
| T6 | 강도: IOI 기반 vs 무작위 velocity | 선호 + "손맛과 맞는다" 평가 | IOI 기반 선호 ≥ 60% |
| T7 | 지연 임계: 인위 지연 0/20/40/60/80 ms 추가 | 실기기 탭, "늦다" 응답 | 허용 한계 → 예산 확정 |
| T8 | 스페이스 proxy vs 실제 녹음 | ABX + 선호 | 자체 녹음 우선순위 근거 |
| T9 | 저소음 프리셋 음량: "조용하지만 들린다" | 음량 3단계 선호 | 피로·만족 균형점 |
| T10 | 클릭→바닥 오프셋 0/6/12/20 ms | 선호 + "늦다" 응답 | 기본 오프셋 확정 |
| T11 | 5키 화음: 동일 버퍼 허용 vs 금지 | ABX | 콤 필터 가청 여부 |
| T12 | 휴대폰 스피커 vs 이어폰에서 프리셋 구분도 | T3을 두 조건으로 | 스피커에서 구분 안 되면 스타일 EQ 재조정 |

---

## 7. 결론 (권고 요약)

1. MVP는 **4 프리믹스 프리셋**(묵직한 리니어/경쾌한 택타일/클릭형/저소음 리니어), 프리셋당 54샘플·약 1.5 MB, 4종 약 5.9 MB, 활성 1종만 상주.
2. 녹음 세션에서 레이어 재료를 함께 수집 → v1.x에 **메커니즘 오버레이 ⊕ 스타일 몸체** 하이브리드(T1 통과 시).
3. HE는 소리 카테고리가 아니라 linear로 매핑. 보글보글은 T3 전까지 보류.
4. 엔진 변경점(구현 시): 재생 중 버퍼 제외 shuffle-bag, 키당 보이스 제한, 연속형 덕킹 + velocity 하향, 짧은 탭 up 규칙, 레이어 오프셋 예약, provenance 기록.

---

## 출처

- S1: RTINGS, Kailh Box Jade review — https://www.rtings.com/keyboard-switch/reviews/kailh/box-jade
- S2: RTINGS, Cherry MX Blue vs Kailh Box Jade — https://www.rtings.com/keyboard-switch/tools/compare/cherry-mx-blue-kailh-box-jade/42097/42910
- S3: Drop, Clicky switch mechanisms: a starter — https://drop.com/talk/129151/clicky-switch-mechanisms-a-starter
- S4: Kinetic Labs, What makes a silent switch silent — https://kineticlabs.com/blog/what-makes-a-silent-switch-silent ; Gateron, lubed silent switches — https://www.gateron.com/blog/detail/lubed-silent-switches
- S5: Tom's Guide, Hall effect vs mechanical (2026) — https://www.tomsguide.com/computing/keyboards/im-sick-of-pretending-hall-effect-keyboards-are-the-end-all-be-all-heres-why-id-still-pick-a-mechanical-deck-in-2026
- S6: KeebsForAll, Switch sound variations — https://keebsforall.com/blogs/mechanical-keyboards-101/switch-sound-variations-why-keys-sound-different
- S7: Tom's Hardware, Mechanical keyboard tuning guide — https://www.tomshardware.com/features/mechanical-keyboard-tuning-guide
- S8: Milktooth, Magnetic Jade comparisons — https://milktooth.com/comparisons/magnetic-jade-vs-sunset-gleam
- S9: Chromium blink-dev, Intent to Ship: AudioContext.outputLatency — https://groups.google.com/a/chromium.org/g/blink-dev/c/dTQniJNVVMY
- S10: web.dev, Synchronize audio and video playback (outputLatency 지원 표) — https://web.dev/articles/audio-output-latency
- 내부: `docs/MANZIZAK_기획_기술설계_v0.1.md` §6.2/6.3/8/10/17, `docs/MVP_STATUS.md`, `docs/RECORDING_SPEC_keyboard.md`, `app/src/core/audio.ts`, `app/src/toys/keyboard/toy.ts`, `app/public/sfx/keyboard/CREDITS.md`, `/Users/hgoose/mazizak-sound/app/SOUND_AB.md`, `sound-src/ab-metrics.md`
