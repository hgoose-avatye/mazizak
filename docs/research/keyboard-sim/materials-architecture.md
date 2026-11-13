# MANZIZAK 재질·콘텐츠 아키텍처 설계안 (분석·설계 전용, 코드 변경 없음)

> 작성 2026-11-09 · 기준 코드: `/Users/hgoose/mazizak-fix/app` (v0.2 스냅샷 `decfea1`) · 기준 문서: 통합 보고서 v0.1, `MVP_STATUS.md` v0.2, `RECORDING_SPEC_*.md`, §18 키보드 추가안(`/Users/hgoose/mazizak-design/docs/`)
> 태그: **[확인: 파일:줄]** 코드·문서에서 직접 확인 · **[추정]** 근거 있는 추론 · **[가설]** 검증 전 설계값 · **[추천]** 권고안 · **[계산]** 산술 결과
> 아래 줄 번호는 모두 `app/` 기준이다. 문서 줄 번호는 `docs/MANZIZAK_기획_기술설계_v0.1.md` 기준이다.

## 0. 결론 요약

1. **TPR 구현 코드는 git에 남아 있지 않다** [확인]. `dcf253e`(baseline)도 이미 슬로우 라이징 폼 모델이다. `dcf253e→decfea1` 사이 `model.ts` 변경은 파라미터 7개 재튜닝뿐이다(아래 1.2). 그래서 TPR 동작은 `MVP_STATUS.md:5`, 기획서 §6.2·§7.2, `spring.ts`의 언더댐핑 분기, `sfx.ts`의 TPR 합성음, `dcf253e` 시점의 `toy.ts` 사운드 훅으로 **재구성**했다 [추정].
2. **두 재질은 같은 코어를 쓸 수 있지만, "복원 곡선만 다르다"(기획서 §11.1)는 말은 틀리다** [추천]. 공유하는 것은 다음과 같다.
   - 공유: 접촉 모델(앵커·자국 슬롯·재누름 연속성), 입력, 셰이더 골격, 오디오 엔진.
   - 재질별로 갈라야 하는 것: 복원 법칙(점탄성 vs 스프링), 부피 거동(압축성 폼 vs 비압축 젤), 주름(폼 전용), 표면 셰이딩, **사운드 이벤트 구성 자체**.
3. **최소 설계** [추천]
   - `SquishyModel`에 `recovery: 'foam' | 'spring'` 분기 하나를 추가하고, `SquishyMaterialPreset` 데이터 객체를 만든다.
   - 셰이더는 `#define`으로 두 프로그램을 만들고, 사운드 뱅크는 재질별 이름공간으로 나눈다.
   - 폼 경로는 **바이트 단위로 그대로** 두고, 기존 테스트를 회귀 잠금으로 쓴다.
4. **콘텐츠 아키텍처는 3층 구조다** [추천].
   - L0 공용 런타임 서비스: 입력, 오디오, 렌더, 설정, 지표, 출처 관리.
   - L1 패밀리 코어: 키보드, 말랑이(TPR·폼·음식·크런치), 왁뿌볼, 슬랑이. 각 코어는 전용 코드다.
   - L2 품목 프리셋: 데이터.
   - **범용 ToyDefinition DSL, 패밀리 간 물리 공유, 범용 프랙처 시스템은 만들지 않는다.**
5. **음원은 출처 등급제로 관리한다** [추천].
   - 예산 0원에서 25종 스위치를 실제 녹음으로 채우는 길은 "보유하거나 빌린 스위치를 같은 보드에서 녹음"하는 것뿐이다.
   - 나머지는 "소리 스타일 프리셋"으로 정직하게 표기한다.
   - 해당 스위치 모델을 실제로 녹음하지 않았다면 "재현"이나 메커니즘 라벨을 붙이지 않는다.
6. **기획서 v0.1과 충돌하는 항목은 14건이다**(§4). 핵심은 "MVP 제외 목록"과 "제품 카테고리"를 분리하는 것이다. 모든 카테고리는 1급으로 두고, 출시 순서는 웨이브로 관리한다.

---

## 1. 말랑이 TPR vs 슬로우 라이징 폼

### 1.1 v0.2 폼 구현 해부 [확인]

| 구성 | 위치 | 내용 |
|---|---|---|
| 모델 개념 | `src/toys/squishy/model.ts:4-22` | 2항 점탄성. `remaining(t) = a·e^(−t/τf) + (1−a)·e^(−u(t)/τs)`, `u(t)=t−δ(1−e^(−t/δ))`. "잠깐 머무르다 천천히 단조 상승"하고 오버슈트가 없다 |
| 파라미터 | `model.ts:23-62` | `pressDepth .16`, `holdDepth .42`, `holdTau .9`(크리프), `pressFreq 7`(임계감쇠 추종), `elasticFrac .12`, `elasticTau .07`, `slowTau{Base .33, Hold .19, Depth .15}`, `delay{Base .22, Hold .3}`, `squashGain .22`, `bulge .07` |
| 해석해 | `model.ts:87-103` | `remainingFraction`, `recoveryTime`(이분법, 3% 잔류 기준 `DONE_FRACTION`, `:67`) |
| 접촉 슬롯 | `model.ts:64-65,106-132` | `MAX_DENTS 6`(복원 중인 자국 포함), `MAX_TOUCH 2` |
| 누름·재누름 | `model.ts:160-193` | 반경 0.45R 안에서 복원 중인 자국을 다시 누르면 현재 깊이부터 이어 누른다. 크리프 시계를 등가 hold 시간으로 되돌린다(`:186-187`) |
| 끌기 | `model.ts:195-201` | 접선 슬라이드에 `tanh` 소프트 클램프를 건다 |
| 놓기 | `model.ts:203-219` | hold 시간과 깊이로 `τs`와 `δ`를 늘린다. 예측 복원시간을 저장한다 |
| 프레임 갱신 | `model.ts:263-342` | 누르는 중에는 스프링 추종과 크리프(`:272-284`)를 쓴다. 놓은 뒤에는 **스프링 상태를 곡선이 덮어쓴다**(`depth.v=0`, `:285-292`). 늘림 복원도 같은 점탄성 곡선이다(`:319-333`). 전역 납작해짐은 1차 추종이다(`:335-340`) |
| 셰이더 변형 | `src/toys/squishy/material.ts:40-73` | 2스케일 딤플(손끝 코어 + 넓은 어깨), 슬라이드, 약한 bulge(`uBulge`), 전역 squash(부피 근사), 2점 늘림 + 넥킹 `s^-0.35` |
| 노멀 | `material.ts:76-88` | 유한차분(정점당 `mzkDeform` 3회) |
| 프래그먼트 | `material.ts:98-110` | 바닥 차폐, 가짜 SSS, **"압축된 폼 셀이 더 조밀하고 어둡게"** 보이는 `uPressTint`(`:106-107`) |
| 표면 재질 | `material.ts:133-143,155` | roughness .62, sheen .7, clearcoat .22(PU 스킨 느낌). 캐시 키는 `'mzk-squishy-foam-v1'` |
| 사운드 로드 | `src/toys/squishy/toy.ts:149-177` | 샘플을 우선 쓰고, 실패하거나 `?sfx=synth`이면 합성으로 간다. 이벤트 이름은 `sq:touch / sq:compress / sq:recover` + 루프 `rub / stretch` |
| 사운드 훅 | `toy.ts:194-203` | 손가락 닿음 → `sq:touch`(핸들러 즉시, 두 번째 손가락 −4 dB), 햅틱 8 ms |
| | `toy.ts:236-248` | 놓기 → 강도 > 0.5이거나 hold > 0.3 s일 때만 `sq:recover`. **지연 = `c.delay×0.6`, 재생속도 = 예측 복원시간 기반**. 모델이 소리 타이밍을 결정하는 구조다 |
| | `toy.ts:251-258` | 깊이가 `holdDepth`의 55%를 넘으면 `sq:compress`(누름당 1회) |
| | `toy.ts:293-303` | 마찰 루프(히스테리시스 0.03/0.008), 늘림 루프 |
| 샘플 뱅크 | `src/audio/squishySamples.ts:8-26,99-107` | touch 5, compress 6, rub, stretch, recover 2(**파생음**, `:14-15,57`), `compressGel` 5는 로드되지만 **`toy.ts`에서 쓰지 않는다**(grep 결과 0건) |
| 테스트 | `test/models.test.ts:23-125` | 누름 120 ms 이내, 복원 1.3~3.2 s, **오버슈트 0·단조감소**, 길게 누를수록 느림, 해석해 일치, 60/120 Hz 일치, 재누름 연속, 다중 자국, 늘림 무반동 |

**잔재와 불일치** [확인]
- `material.ts:4`의 주석은 "2 contacts"인데 실제 슬롯은 6개다(`:26-29`).
- `model.ts:137`의 이름은 `jiggle`이지만 1차 추종이다.
- `toy.ts:324-327`의 "entry bounce"는 반동 없이 가라앉기만 한다.
- `sfx.ts:6,32,445,472-500`의 합성음은 TPR용이다("rubbery partials", 흔들림 있는 "탱"). 그런데 폼 이벤트 이름(`sq:recover`)에 그대로 매핑된다(`toy.ts:153-157`). 합성 폴백으로 가면 **폼 말랑이에서 TPR "탱" 소리가 난다**.

### 1.2 이전 TPR 동작 (재구성)

`git -C /Users/hgoose/mazizak-fix log -p --follow`를 squishy 파일에 돌려 본 결과는 다음과 같다.

- `dcf253e:app/src/toys/squishy/model.ts`의 헤더가 이미 "Slow-rising FOAM squishy"다. `dcf253e→decfea1` 사이 `model.ts` diff는 `elasticFrac .18→.12`, `slowTauBase .38→.33`, `slowTauHold .22→.19`, `slowTauDepth .20→.15`, `delayBase .12→.22`, `delayHold .25→.30` 6개 값 변경뿐이다 [확인].
- 다른 브랜치(`design/keyboard-sim`, `sound/recorded-ab`, `fix/*`)와 `/Users/hgoose/mazizak-sound/app/dist` 번들(`elasticFrac:.18`)에서도 폼만 나온다 [확인].
- 결론: **TPR 코드는 baseline 커밋 전에 작업 트리에서 덮어써져 사라졌다** [확인]. 아래는 재구성한 내용이다 [추정].

| 측면 | TPR v0.1 (재구성) | 근거 |
|---|---|---|
| 복원 | 언더댐핑 감쇠 스프링 해석해. ζ≈0.3~0.5, 1~2회 출렁인다 | `MVP_STATUS.md:5` "놓으면 출렁(감쇠 스프링 해석해)"; 기획서 §6.2 7행(문서 줄 211); `core/spring.ts:60-71`(언더댐핑 분기); `test/spring.test.ts:41-43` |
| 누름 | 길게 누를수록 깊게, 끌기 | `MVP_STATUS.md:5` |
| 늘림 | 두 손가락 늘리기·오므리기, 넥킹 | `MVP_STATUS.md:5`, 기획서 §7.2(문서 줄 277) |
| 입장 | 입장 바운스(실제 반동) | `MVP_STATUS.md:5`. 현재 `toy.ts:324-327`에는 이름만 남아 있다 |
| 사운드 | 누름 `sq:press`, 두 번째 손가락 `sq:pressHard`. **놓는 순간 `sq:release`("탱")**, 강도 = 깊이 + 늘림 | `git show dcf253e:app/src/toys/squishy/toy.ts` 149-151, 167, 183줄 |
| 합성음 성격 | 누름 = 처지는 저음 + 고무 배음 + 끈적한 버블 칩 + 마이크로 크래클. 놓기 = 피치가 떨어지는 "탱" + 12~18 Hz 흔들림 + 흡착 팝 | `src/audio/sfx.ts:438-470`(renderPress), `:472-500`(renderRelease) |

### 1.3 비교표

| 축 | TPR(젤리) | 슬로우 라이징 폼(v0.2) | 공유 가능? |
|---|---|---|---|
| 누름 반응 | 즉시. 추종 주파수 높음(제안 9~12 Hz, ζ 0.8~1). 크리프 작음 | 즉시(`pressFreq 7`, ζ=1) + 길게 누르면 크리프 큼(`holdTau .9`) | 구조 공유, 값만 다름 |
| 부피 거동 | **비압축**. 눌린 만큼 주변이 불룩해진다(bulge 큼, 제안 .18~.25). 전역 squash 시 옆으로 퍼짐 | **압축성**. 부피가 줄어든다(bulge .07, 압축부가 어두워짐) | 셰이더 항 공유, 계수와 의미가 다름 |
| 복원 모델 | 2차 스프링(언더댐핑): x'' = −ω²x − 2ζωx' | 2항 점탄성 + "머무름" δ (스프링 아님, 상태를 곡선이 덮어씀) | **분리 필수** |
| 복원 시간 | 0.3~0.8 s, 오버슈트 1~2회 [가설] | 1.3~3.2 s, 오버슈트 0 [확인: 테스트] | — |
| 늘림 | 핵심 제스처. 상한 근처 로그 저항, 놓으면 튕겨 돌아와 살짝 짧아졌다 복귀 | 가능하지만 점탄성으로 천천히 돌아옴(`model.ts:319-333`). 실물 PU는 거의 안 늘어남(§6.2 5행) | 제스처 인식은 공유, 응답 법칙은 분리 |
| 주름 | 없음. 대신 하이라이트 왜곡과 투과 변화 | **있어야 함**. 깊은 압축 시 PU 스킨 버클링. 현재 미구현 | 폼 전용 셰이더 기능 |
| 감쇠 | ζ 0.3~0.5 | 과감쇠 등가(곡선) | — |
| 다중 자국 | 의미 작음. 출렁임이 빨리 끝나서 자국이 남지 않음 | 핵심. 자국 6개가 각자 시계를 가짐 | 슬롯 구조 공유 |
| 전역 흔들림 | 놓을 때 몸통 젤로 진동(진짜 스프링) | 1차 추종, 반동 금지 | 분리 |
| 표면 | 반투명(가짜 SSS 강함), 반광택, clearcoat↑, roughness↓ | 불투명, sheen, roughness↑, 압축부 어두워짐 | 같은 셰이더 골격, 값과 define이 다름 |
| 사운드 이벤트 | 닿음(끈적 "칙"), 누름 soft/hard(속도), **놓을 때 "탱/뽁"**, 출렁임 제로크로싱 미세음, 마찰 스퀵, 늘림 고무 삐걱 | 닿음, 깊은 압축 1회, **지연된 "스으" 복원 속삭임**, 마찰, 늘림 | 엔진 공유, 이벤트 세트는 재질별 |
| 소리 타이밍의 주인 | 놓는 순간(핸들러 즉시) + 모델 진동 위상 | 모델의 `delay`와 예측 복원시간(`toy.ts:245-246`) | 분리 |
| 제스처 매핑 | 탭 = 딤플 + 튕김, 길게 = 조금 더, 벌리기 = 늘림(주), 오므리기 = 압축 | 탭 = 얕은 자국 + 느린 복원, 길게 = 깊게(시간 = 세기, 주), 벌리기 = 제한적 | 인식기 공유, 반응 표는 프리셋 |
| 햅틱 | 놓을 때 짧은 이중 펄스(출렁임) [가설] | 닿을 때 1회만(`toy.ts:202`) | 서비스 공유, 패턴은 프리셋 |

### 1.4 공유 vs 재질별

**공유한다 (L0/L1 코어)** [추천]
- 입력: `core/runtime.ts`의 `InputEvt`, 픽킹(`toy.ts:121-147`), 드래그 투영, 두 손가락 늘림 인식(`toy.ts:261-274`).
- 접촉 슬롯: `Dent`, `press()` 재사용 규칙, 크리프, `drag()`, `writeUniforms()`, `ReleaseRecord` 계측.
- 셰이더 골격: `mzkDeform`의 딤플 프로필, 슬라이드, 늘림·넥킹, 유한차분 노멀, 바닥 차폐, 가짜 SSS.
- 오디오: `AudioEngine`(라운드로빈, 지연, stop 핸들, 밀도 덕킹, 리미터), 루프(`ContinuousSound`), 히스테리시스 규칙.
- 지표·테스트 하네스: `pressHoldRelease` 유형의 시뮬레이터.

**재질별로 둔다 (프리셋 + 분기)**
- 복원 법칙(`foam` 곡선 vs `spring`), 늘림 복원, 전역 흔들림 법칙.
- bulge 계수와 의미, 주름 유무, 표면 로브와 `pressTint`.
- 사운드 뱅크 **그리고 이벤트 규칙 코드**: 폼의 "지연 복원음"과 TPR의 "출렁임 제로크로싱음"은 파라미터가 아니라 로직이다.
- 판정 테스트: 폼 = 오버슈트 0, TPR = 오버슈트 ≥1.

### 1.5 최소 설계: 재질 프리셋으로 두 재질 지원 [추천]

**원칙**: v0.2 폼 경로의 코드·값·테스트는 그대로 둔다. TPR은 "추가 분기"로만 들어간다. 추상 클래스나 전략 패턴 계층은 만들지 않는다. 분기가 3개를 넘으면 그때 다시 검토한다.

#### (a) 데이터 형태

```ts
// src/toys/squishy/presets.ts (신규)
type RecoveryLaw =
  | { kind: 'foam' }                                    // 기존 remainingFraction 경로 (SquishyParams의 elastic*/slowTau*/delay* 사용)
  | { kind: 'spring'; freq: number; damping: number;    // 자국 복원 스프링
      bodyFreq: number; bodyDamping: number;            // 전역 젤로 흔들림
      stretchFreq: number; stretchDamping: number; maxUndershoot: number };

interface SquishyMaterialPreset {
  id: 'foam' | 'tpr';                    // 이후 'foam-food-bun' 등은 L2 품목이 이 재질을 참조
  label: string;                         // '슬로우 폼' / '젤리 TPR'
  params: SquishyParams;                 // 기존 타입 그대로. foam = DEFAULT_PARAMS 객체 자체
  recovery: RecoveryLaw;
  surface: { roughness: number; clearcoat: number; sheen: number; sssAmt: number;
             transmissionFake: number; wrinkle: boolean; pressDarken: number };
  sound: { bank: 'squishy-foam' | 'squishy-tpr'; rules: 'foam' | 'tpr' };   // rules = toy.ts 안의 이벤트 로직 선택
  haptic: { touchMs: number; releasePattern?: number[] };
}

export const FOAM: SquishyMaterialPreset = { id: 'foam', params: DEFAULT_PARAMS, recovery: { kind: 'foam' }, /* v0.2 값 그대로 */ };
export const TPR: SquishyMaterialPreset = {
  id: 'tpr',
  params: { ...DEFAULT_PARAMS, pressDepth: .14, holdDepth: .24, holdTau: .35, pressFreq: 10, bulge: .2, maxSlide: .36 },   // [가설]
  recovery: { kind: 'spring', freq: 4.5, damping: .38, bodyFreq: 6, bodyDamping: .3, stretchFreq: 3.5, stretchDamping: .45, maxUndershoot: .06 }, // [가설]
  /* ... */
};
```

#### (b) 모델: 분기 3곳

- `release()`(`model.ts:203-219`): `spring`이면 `tauS`, `delay`, `predicted` 계산을 건너뛴다. 현재 `depth.x`와 `depth.v`를 유지하고 `depth.target=0`, `depth.params={freq,damping}`로 바꾼다. 놓는 속도를 전역 흔들림 스프링(`jiggle`, 이번에는 진짜 언더댐핑)에 임펄스로 넣는다.
- `update()` 놓은 뒤 분기(`:285-315`): `spring`이면 `c.depth.step(dt)`로 해석해를 진행한다. 제로크로싱을 `overshoots`에 센다. 정착 조건은 `|x|<3%·x0 && |v|<ε`(`spring.ts:36-38` `isSettled` 재사용)이다.
- 늘림 복원(`:319-333`)과 전역 squash(`:335-340`): `spring`이면 `stretch.params`와 `jiggle.params`를 스프링 값으로 두고 `step()`한다. 늘림이 1 아래로 내려가는 언더슈트는 `maxUndershoot`로 소프트 클램프한다.
- 음수 depth(바깥으로 튀어나옴)는 TPR에서만 허용한다. 셰이더는 이미 `-uCNormal*uDepth*w`라서 바깥으로 밀린다. bulge 항은 `max(uDepth,0)`이라 문제없다(`material.ts:54-58`). 다만 진폭은 `0.35×depthAtRelease`로 상한을 둔다 [가설].
- 재누름 연속성: 출렁이는 자국을 다시 누를 때 `keep`에 **속도도 넣는다**(`model.ts:174`는 현재 위치만 보존한다). 폼 경로는 `v=0`이라 결과가 같다.

#### (c) 셰이더

- `createSquishyMaterial(color, sss, variant)`. `variant`에 따라 `#define MZK_TPR` 또는 `MZK_FOAM`을 앞에 붙이고 캐시 키를 `'mzk-squishy-foam-v1'`(**유지**) / `'mzk-squishy-tpr-v1'`로 둔다.
- `MZK_FOAM` 전용: 기존 `pressTint`(어두워짐), **주름**(신규, 선택). 주름은 `vPress`가 큰 링 영역에서 각도 방향 sin 노멀 섭동(프래그먼트, 정점 변위 없음)으로 만든다. 비용은 프래그먼트 sin 몇 개 수준이다 [추정].
- `MZK_TPR` 전용: wrap 조명 + 두께 근사 투과 강화. 압축부는 **밝아지게**(두께 감소 → 투과 증가) 한다. clearcoat↑, roughness .25 내외 [가설].
- 두 프로그램은 로딩 중에 `renderer.compile`로 미리 컴파일한다. 전환 순간의 끊김을 막기 위해서다. 키보드 C3(§18.9)과 같은 유형의 위험이다.

#### (d) 사운드

- 뱅크를 나누고 이름공간을 둔다: `sq:foam:touch|compress|recover`, `sq:tpr:touch|press|pressHard|release|wobble`, 루프 `rub/stretch`는 뱅크별로 둔다.
- 폼 뱅크는 현재 `squishy.wav`를 그대로 쓴다. 합성 폴백은 **폼 전용 합성을 따로 만들 때까지** TPR 합성음을 폼에 매핑하지 않는다. 대신 무음 + HUD 경고로 처리한다. 현재 `toy.ts:153-157`의 교차 매핑이 문제를 일으키고 있다 [추천].
- TPR 뱅크 1차는 `sfx.ts` 합성(원래 TPR용) + 이미 받아 둔 CC0 `compressGel`(#575333, 실제 젤 녹음) 5개다. 놓을 때 "탱"은 합성이다. 라벨은 "젤리 스타일 사운드"로 붙인다(§3 규칙).
- 이벤트 규칙은 `toy.ts` 안에서 `rules` 값으로 갈라지는 함수 2개로 둔다.
  - `foamRules`: 현 `toy.ts:236-258`을 이동만 한다.
  - `tprRules`: 놓을 때 즉시 `release`(게인 ∝ 놓는 속도와 깊이)를 낸다. 제로크로싱마다 `wobble`을 −8 dB씩 감쇠시키며 최대 2회 낸다. 누를 때는 속도에 따라 soft/hard로 나눈다.

#### (e) 전환 UX

- `settings.squishyMaterial: 'foam' | 'tpr'`, 기본값은 `'foam'`(v0.2 유지). 전환은 하단 칩 2개로 한다(색 스와치 위). 전환할 때 `model.reset()`, 프리셋 교체, 머티리얼 교체, 뱅크 교체, 시연 1회 자동 눌림 순서로 진행한다.
- 손가락이 닿아 있으면 칩을 비활성화한다. 진행 중인 복원음은 `stopRecover()`로 끊는다.
- 홈에서 재질별 카드를 따로 둘지(같은 장난감 2장 vs 1장 + 칩)는 [미결정]이다. 추천은 1장 + 칩이다. 비교 행동이 곧 손맛 체험이기 때문이다.

#### (f) 테스트

| 테스트 | 내용 |
|---|---|
| 폼 회귀 잠금 | 기존 `models.test.ts:23-125`를 그대로 두고 `new SquishyModel(FOAM.params)` 경로로 실행한다. `FOAM.params`가 v0.2 `DEFAULT_PARAMS`와 **깊은 동일**인지 스냅샷 테스트를 추가한다 |
| TPR 거동 | 놓은 뒤 오버슈트 1~3회, 정착 0.3~0.9 s, 최대 언더슈트 ≤ 35%·x0, 늘림 언더슈트 ≤ `maxUndershoot` |
| 프레임 독립 | 60/120 Hz에서 정착 시간 차 < 1프레임, 피크 깊이 차 < .01. 해석해 스프링이라 성립해야 한다 |
| 재누름 연속 | 출렁이는 자국 재누름 시 위치 차 < .03, 속도 부호 보존 |
| 전환 | 전환 후 `inUse` 자국 0, 이전 뱅크 이벤트가 재생되지 않음(`playLogs` 검사), 셰이더 캐시 키 2개 |
| 사운드 규칙 | TPR: 놓을 때 `release` 1회 + `wobble` ≤2. 폼: `recover` 지연 = `delay×0.6` 유지 |
| 브라우저 | `scripts/foam-check.mjs`를 복제해 `tpr-check`를 만든다. 놓은 뒤 0/80/160/320 ms 프레임을 캡처해 출렁임을 시각으로 확인한다 |

#### (g) 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| `overshoots`, `DONE_FRACTION`의 의미가 재질마다 뒤집힘 | 계측과 HUD 오독 | `ReleaseRecord`에 `law` 필드 추가, HUD 표기 분리 |
| TPR이 "고무공 CG"로 보임(§1 위험②) | 품질 | 투과와 하이라이트 왜곡을 먼저 만든다. 실물 영상 나란히 비교(S1)를 재질마다 따로 한다 |
| 음수 depth 진폭 과다로 메시 자기교차 | 시각 결함 | 진폭 상한, 유한차분 노멀 뒤집힘 검사(`material.ts:85`) |
| 셰이더 2개 컴파일 | 첫 전환 끊김 | 사전 컴파일, 저사양에서 측정 |
| 뱅크 2개 메모리 | 폼 스프라이트 1.03 MB WAV → 디코드 시 대략 2배 이상(ctx 48 kHz float32) [계산: 1,027,938 B / 2 B × 4 B × 48/32 ≈ 3.1 MB] | 재질 전환 시 이전 뱅크 해제(현재 캐시는 WeakMap 영구 보존, §18.9 C7) |
| 파라미터 커플링 | 폼 튜닝 시 TPR이 덩달아 바뀜 | TPR은 `{...DEFAULT_PARAMS, ...}` 대신 **전체 값을 명시**한다 [추천] |
| 재질 2개가 "같은 장난감 두 번"으로 느껴짐 | 제품 | 사운드와 제스처 주역을 다르게 둔다. 폼 = 길게 누르기, TPR = 놓기·늘리기 |

---

## 2. 콘텐츠 아키텍처

### 2.1 현재 `Toy` 인터페이스 평가 (`src/core/toy.ts:5-30`)

**좋은 점** [확인]
- 작다.
- 장난감이 scene과 camera를 소유하고 런타임이 입력과 프레임을 몬다.
- 지연에 민감한 소리를 위한 `inputImmediate`(`:21`)와 계측 훅 `stats/report`가 있다.

**확장 시 부족한 점**

| # | 부족한 점 | 증거 |
|---|---|---|
| 1 | 비동기 로딩, 준비 상태, `dispose`가 없다. 샘플 캐시가 영구 보존된다 | `toy.ts:24-27`에는 enter/leave만 있음, `keyboardSamples.ts:40`, `squishySamples.ts:59` |
| 2 | 변형(variant) API가 없다. `setColor`와 `setPreset`을 교차 타입 캐스트로 붙였다 | `main.ts:105` |
| 3 | 메타데이터(제목, 힌트, 썸네일)가 하드코딩돼 있다 | `main.ts:106-110` |
| 4 | 장난감 생성이 `if/else`다 | `main.ts:111-117` |
| 5 | 변형 UI가 장난감마다 하드코딩돼 있다 | `main.ts:119-155` |
| 6 | 설정 타입이 품목에 묶여 있다. 25종이나 6패밀리로는 확장되지 않는다 | `settings.ts:10-11` `squishyColor`, `keyPreset: 'pebble' \| 'clack'` |
| 7 | 스프라이트 로더 2개가 거의 같은 일을 하면서 JSON 스키마는 서로 다르다 | `keyboardSamples.ts:19-37` `entries/offset/duration/gain`, `squishySamples.ts:28-44` `slices/start/end/cat` |
| 8 | 출처 정보가 JSON과 CREDITS에 흩어져 있다. UI로 노출되지 않고 sha256도 없다 | `grep sha256` 결과 0건 |
| 9 | 품질 등급 훅(`setQuality`)이 없다. 기획서 §11 다이어그램과 다르다 | — |

### 2.2 카테고리별 요구 [추천 / 일부 추정]

| 카테고리 | 본질 | 코어 | 상태 | 에셋 | 사운드 구조 | 공통화하면 안 되는 이유 |
|---|---|---|---|---|---|---|
| 기계식 스위치(장기 25) | 이산 타건, 키별 스프링 | `KeyboardCore`(현행 `toys/keyboard/*`) | 키별 스프링 + holders | 키캡·케이스 외형 2~3종(녹음 보드 결) | down/up/space 원샷, 프리믹스 | 품목이 **순수 데이터**다(§18.4 `KeyboardPreset`). 반대로 키보드 코드를 말랑이와 섞을 이유가 없다 |
| 일반 말랑이(TPR/폼) | 연속 변형 | `SquishyCore` | 자국 슬롯 + 복원 법칙 | 메시 1, 재질 2 | 재질별 규칙(1.5) | 복원 법칙과 사운드 규칙은 코드 분기다 |
| 음식형 스퀴시 | 형태와 피부가 다른 말랑이 | `SquishyCore` + 형태 메시, 표면 텍스처 | 같음 | **아트 병목**(빵 기공, 과일 껍질). 메시별 픽킹 프록시가 필요(현재 단위구 픽킹 `toy.ts:121-136`) | 재질 뱅크 + 표면 마찰 변주 | 픽킹, 카메라 맞춤, 바닥 처리가 구(sphere) 전제(`toy.ts:47-70`)라서 코어 일반화가 처음 필요한 지점이다. 형태 데이터(메시 + 프록시 SDF)만 일반화한다 |
| 크런치 말랑이 | 말랑이 + 내부 알갱이 파쇄. 누를수록 바삭 → 점점 둔해짐 | `SquishyCore` + **Crunch 모디파이어** | 품목별 "남은 알갱이" 상태(초기화로 복구) | 파티클(표면 아래 비침 또는 갈라짐) | **그레인 스케줄러**: 압축 속도 × 남은 알갱이 → 이벤트 밀도. 짧은 원샷 다수 + 합성 타이밍 | 그레인 밀도와 소리 동기화는 고유 로직이다. "말랑이 사운드 프리셋"으로 처리할 수 없다 |
| 슬랑이(슬라임형) | 점성·소성, 놓아도 안 돌아옴, 늘어나 끊어짐 | `SlimeCore`: 접시 위 하이트필드(CPU 그리드 또는 GPU 텍스처) + 가닥 스플라인(선택) | **레스트 형상이 변한다**(소성) | 하이트필드 메시, 접시 | 분리 속도 → "쩍", 버블 팝, 늘림 루프, 끊김 | 셰이더 해석적 변형은 상태가 없어서 맞지 않는다(기획서 §11.1 Plastic 행). `SquishyCore`에 억지로 넣지 않는다 |
| 왁뿌볼 | 취성 껍질 + 속(점토 또는 젤) | `WaxBallCore`: **상태 머신**(무결 → 균열 n단계 → 파열 → 조각 박리 → 속 노출) + 사전 프랙처 조각 + 균열 마스크. 속이 젤이면 `SquishyCore` 재질 프리셋을 재사용 | 파손 상태(세션 내 유지, 초기화 = 역재생) | **프랙처 에셋 패키지**(조각 20~40, 단면, 마스크) [가설 §7.3] | 단계별 크랙클(밀도↑), 파열 3레이어, 파편 그레인 | 파손 시퀀스는 품목마다 연출이 다르다. 범용 "부서짐 엔진"을 만들지 않는다 |

### 2.3 계층 구조 [추천]

```
L0  공용 런타임 서비스 (src/core/*, 패밀리 무관)
    Runtime(입력 버퍼·rAF·pointercancel)  AudioEngine(보이스·리미터·언락·stop)
    SoundBank 로더(통합 스프라이트 스키마 v2, load/unload, 출처 레지스트리)
    Render 셸(renderer, studio env, 사전 컴파일, 품질 등급)  Settings(패밀리별 네임스페이스)
    Metrics/HUD/report  Haptics(패턴 API)  ContentRegistry(manifest 읽기, 지연 import)

L1  패밀리 코어 (src/families/<family>/*, 전용 코드, 서로 import 금지)
    keyboard/   KeyboardCore + KeyboardPreset 스키마
    squishy/    SquishyCore(자국 슬롯·셰이더 골격) + 재질 분기(foam|tpr) + 형태(구/음식 메시)
                └ modifiers/crunch (그레인 스케줄러·파티클) — 말랑이 전용 모디파이어
    waxball/    상태 머신 + 프랙처 재생기 + (속: squishy 재질 프리셋 참조)
    slime/      하이트필드 + 소성 레스트 + 가닥(후순위)

L2  품목 프리셋 (content/<family>/<item>.json + 에셋, 코드 없음 또는 최소 훅)
    switches/*.json (장기 25) · squishy/{foam,tpr,food-*,crunch-*}.json · waxball/*.json · slime/*.json
```

**Toy 인터페이스 확장(최소)** [추천]: 아래 항목을 **선택 필드로** 추가한다. 기존 두 장난감은 그대로 컴파일된다.

```ts
interface Toy {
  /* 기존 필드 유지 */
  load?(signal: AbortSignal): Promise<void>;          // 뱅크·메시·셰이더 사전 준비
  dispose?(): void;                                    // 뱅크 해제, GPU 리소스 해제
  variants?(): VariantGroup[];                         // 칩/스와치 목록 → main.ts 공통 UI
  setVariant?(group: string, id: string): void;        // setColor/setPreset 대체
}
interface ToyManifest { id: string; family: string; title: string; hint: string; thumb: string; entry: () => Promise<{ create(ctx: ToyContext, item: unknown): Toy }>; }
```

### 2.4 일반화하지 말아야 할 곳 (명시) [추천]

1. **범용 `ToyDefinition` DSL을 만들지 않는다.** 데이터는 L2 품목 값까지만 둔다. 법칙, 이벤트 규칙, 상태 머신은 코드로 둔다(기획서 §10.3 "선행 일반화 제외"의 정신은 유지한다).
2. **키보드와 변형계 사이에 물리를 공유하지 않는다.** 공유하는 것은 `Spring`(`core/spring.ts`)뿐이다.
3. **사운드 이벤트 이름을 패밀리 사이에서 통일하지 않는다**("press"가 키보드와 말랑이에서 뜻이 다르다). 엔진과 로더만 공유한다.
4. **왁뿌볼 파손과 크런치 파쇄를 하나의 "Fracture 시스템"으로 묶지 않는다.** 앞은 거시 조각 연출이고 뒤는 미시 그레인 소리다.
5. **슬라임을 SquishyCore 모디파이어로 만들지 않는다.** 소성은 레스트 상태 저장이 필요해서 구조가 다르다.
6. **재질 프리셋에 "복원 곡선 커브 에디터"를 넣지 않는다.** 법칙은 2종(foam/spring)으로 고정하고 파라미터만 데이터로 둔다.
7. **품질 훅을 남겨 둔다.** 품목 하나가 공통 경로로 품질이 안 나오면 `families/<f>/items/<id>.ts` 전용 훅을 허용한다(§11.1 마지막 줄과 같은 취지).

### 2.5 사운드 콘텐츠 매니페스트와 출처 구조 [추천]

기존 자산을 확장한다. `squishy.json`의 슬라이스별 `src`, `srcUrl`, `srcStart/End`, `processing`, `recorded`와 `clack.json`의 `sources{title, author, url, license, licenseUrl, retrieved, file}`을 하나의 스키마 v2로 합치고, `CREDITS.md`는 **이 매니페스트에서 생성**한다.

```jsonc
// public/sfx/<bank>/<bank>.json  (sprite schema v2)
{
  "schema": 2,
  "bank": "kb-linear-heavy",                 // 프리셋 id와 분리
  "family": "keyboard",
  "file": "kb-linear-heavy.wav",
  "fileSha256": "…",                         // 배포 스프라이트 해시 (빌드 시 계산, CI 검증)
  "sampleRate": 48000, "channels": 1, "bitDepth": 16,
  "sources": {
    "self:2026-12-kb01": {
      "kind": "self-recorded",               // self-recorded | cc0 | cc-by | synth | derived
      "license": "proprietary-inhouse",      // 또는 "CC0-1.0" / "CC-BY-4.0"
      "licenseUrl": null,
      "attributionRequired": false,          // cc-by → true, attributionText 필수
      "attributionText": null,
      "author": "MANZIZAK",
      "sourceUrl": null,                     // CC 계열 필수
      "downloadUrl": null,
      "retrieved": "2026-12-03",
      "originalSha256": "…",                 // 원본(다운로드 MP3·녹음 WAV) 해시 — 출처 증빙
      "pageSnapshot": "provenance/freesound-815614.html",  // CC 계열: 라이선스 표기 페이지 사본 (저장소 밖 보관 가능)
      "capture": { "device": "iPhone 13 (기본 마이크, 음성처리 OFF 앱)", "distanceCm": 15, "room": "옷장+이불", "date": "2026-12-03" },
      "subject": {                            // 무엇을 녹음했나 — 내부 기록, UI 비노출
        "board": "hotswap-A(보유)", "plate": "PC", "keycap": "PBT 체리",
        "switchModel": "Gateron Oil King",   // 실물 확인(구매 영수증/박스 사진 경로)
        "switchEvidence": "provenance/kb01-switch-photo.jpg"
      },
      "aiGenerated": false,
      "notes": ""
    }
  },
  "verification": {
    "level": "verified-switch",              // 아래 등급표
    "sameBoardGroup": "hotswap-A",           // 같은 그룹끼리만 메커니즘 비교 라벨 허용
    "humanListened": true,                   // 사람 청취 검수 여부 (현재 전부 false)
    "blindTest": { "id": "T2-2026-12", "accuracy": 0.86 }
  },
  "slices": [ { "name": "down_01", "role": "down", "offset": 0.01, "duration": 0.18, "gain": 0.92,
                "src": "self:2026-12-kb01", "srcStart": 12.31, "srcEnd": 12.49,
                "processing": "hp75, expander −12 dB, onset trim 0.5 ms",
                "proxy": false } ]           // spaceDown 대체 등은 proxy:true
}
```

**검증 등급(`verification.level`)과 허용 라벨**

| 등급 | 조건 | UI에 허용되는 것 | 금지 |
|---|---|---|---|
| `verified-switch` | 해당 스위치 모델을 **직접 녹음**, 실물 증빙 있음, 사람 청취 통과 | 소리 결 이름 + 느낌 보조 라벨("리니어 · 묵직"). 같은 `sameBoardGroup` 안에서 비교 문구 허용 | 제품명·상표 노출(§8.2), "똑같은", "재현" |
| `same-board-style` | 같은 보드에서 녹음했지만 스위치 모델 미상이거나 개조품 | 소리 결 + 느낌 라벨(그룹 내) | 모델 암시 |
| `style-preset` | CC0나 CC-BY 실제 녹음, 보드·방·마이크가 제각각(현 조약돌·까랑까랑) | **소리 결 이름만**("조약돌") + "ASMR 스타일 사운드" | 메커니즘 라벨(§18.0-4와 일치) |
| `proxy` | 역할 대체(스페이스바 = 무거운 일반 키 등) | 내부 표기만, HUD에 `proxy` | 사용자 문구에서 "스페이스바 녹음" |
| `derived` | 실제 녹음을 늘림·역재생 등으로 가공(현 `recover`) | 일반 이용 가능 | "실제 ○○ 소리" |
| `synth` | 사내 합성 | 폴백, 그레인 타이밍 | "녹음" 표기 |

**빌드 및 CI 규칙** [추천]
- `scripts/provenance-check.mjs`를 만들어 다음을 검사한다. 하나라도 어기면 빌드를 실패시킨다.
  1. 모든 슬라이스의 `src`가 `sources`에 존재한다.
  2. `kind`가 cc0 또는 cc-by이면 `sourceUrl`, `license`, `retrieved`, `originalSha256`이 있다.
  3. cc-by이면 `attributionText`가 있고, 그 문구가 생성된 CREDITS와 앱 "만든 사람들" 화면에 실제로 나온다.
  4. 라이선스 허용 목록은 CC0-1.0, CC-BY-3.0/4.0, proprietary-inhouse다. **NC, ND, SA, Sampling+는 거부한다.**
  5. `fileSha256`이 실제 파일과 일치한다.
  6. 프리셋 `subLabel`이 있으면 `verification.level ∈ {verified-switch, same-board-style}`이다.
  7. `humanListened=false`인 뱅크는 출시 빌드에서 경고를 낸다.
- 품목 매니페스트(`content/keyboard/switches/*.json`)는 `bank` id만 참조한다. 같은 녹음을 여러 품목이 공유할 수 있기 때문이다. 그런 경우 라벨은 더 낮은 등급을 따른다.
- 현재 상태: `SQUISHY_SAMPLES_ARE_RECORDED=false`(`squishySamples.ts:57`) 같은 코드 상수는 매니페스트 등급으로 대체한다.

---

## 3. 예산 0원 음원 확보 비교

| 기준 | 자체 녹음(보유 폰·장비) | CC0(Freesound 등) | CC-BY(표시 필요) | 사내 합성 |
|---|---|---|---|---|
| 품질 | 중~상. 폰 마이크는 AGC와 노이즈 억제를 꺼야 한다(음성 처리 없는 녹음 앱, Android `UNPROCESSED` 소스 지원은 기종 편차 [추정]). 노이즈 플로어가 병목이다. 옷장과 이불로 보완 | 편차 큼. 미리듣기 MP3 128 kbps(현재 사용, CREDITS)라 프리에코와 대역 손실이 있다. 원본 WAV는 로그인 후 받을 수 있다 | CC0와 같다. 후보 풀이 더 넓다 | 키보드 타건 사실감은 하. 버블, 마찰, 크랙클 타이밍은 중~상 |
| 비용 | 0원(보유 장비 전제). **시간 비용 큼**: 이벤트당 20~30 테이크 + 편집(`RECORDING_SPEC_*`) | 0원. 탐색과 검수 시간 | 0원 + 표시 의무 관리 | 0원. 개발 시간 |
| 법적 위험 | 최저(권리 100% 보유). 녹음 대상 장난감의 디자인 노출 문제는 소리에는 해당 없음 [추정] | 낮음. 단 ① 업로더가 권리자가 아닐 위험 ② AI 생성물 혼입 ③ 페이지 표기 변경 → `pageSnapshot`과 `originalSha256`으로 대비 | 낮음~중. 표시 누락이 곧 위반이다. **SA는 파생물 전체(스프라이트)에 같은 조건 승계 위험, NC는 상업 불가라 제외** | 없음 |
| 25종 스위치 확장성 | **물리 스위치가 있어야만 가능.** 핫스왑 보드 1대 + 보유·대여 스위치 수가 상한이다. 같은 보드라 프리셋 간 일관성은 최고 | 낮음. 스위치 모델이 명시된 단일 키 녹음은 드물다. 보드, 마이크, 방이 제각각이라 "25종 비교"가 성립하지 않는다 | CC0와 같다 | 무제한이지만 "스위치 소리"로서 신뢰도가 없다. §8.6은 키보드 사용을 금지 |
| "실제 스위치" 라벨 자격 | 있음(`verified-switch`) | 업로더가 모델을 밝히고 단일 키 분리가 가능해도 **보드 차이** 때문에 최대 `style-preset` [추천] | 같음 | 없음 |
| 말랑이와 기타 카테고리 | 실물 장난감 구매가 필요하다. 0원 원칙에서는 보유품만 가능. 폼 `recover`, TPR "탱", 왁스 크랙클은 사실상 자체 녹음만 길이 있다 | 대체 재질(쿠션, 스펀지, 장갑)은 확보 가능(현 뱅크) | 같음 | 크런치 그레인 밀도, 출렁임 미세음, 폴백 |

**추천 조합** [추천]
1. **키보드**
   - 단기 4종은 `style-preset`으로 구성한다. 현 조약돌·까랑까랑 2종에 CC0 2종을 더한다. 이때 "서로 다른 소리 결"만 약속한다.
   - 장기 25종은 **보유하거나 빌린 스위치를 같은 핫스왑 보드로 녹음한 `verified-switch`**만 메커니즘 라벨을 단다.
   - 스위치를 구하지 못한 슬롯은 만들지 않는다. 같은 소리를 이름만 바꿔 늘리지 않는다.
   - 25는 목표 상한이지 약속이 아니다.
2. **말랑이·왁뿌볼·크런치**
   - 보유 실물을 폰으로 자체 녹음한다. 이것이 주력이고, 실물이 없는 이벤트만 CC0 대체 재질로 메운다.
   - 크런치와 출렁임의 **타이밍·밀도**는 합성 스케줄러가 맡는다. 음색은 녹음 그레인을 쓴다.
3. **CC-BY**는 매니페스트 자동 표시가 동작한 뒤에만 허용한다. SA, NC, ND는 금지한다.

**라벨 규칙(사용자 문구)** [추천]
- 해당 모델을 실물로 녹음하지 않았다면 "○○ 스위치 소리", "재현", "똑같은", "실제 ○○"을 쓰지 않는다. 녹음했더라도 상표는 쓰지 않는다(§8.2).
- 느낌 라벨(리니어/택타일/클릭/저소음)은 `verified-switch`나 `same-board-style`일 때만 붙이고, 같은 보드 그룹 안에서만 비교 문구를 쓴다.
- `style-preset`은 의성어 이름과 짧은 결 설명("묵직하고 둥근 저음", 현 `keyboard/toy.ts:13-16` 수준)만 쓴다.
- 설정 하단 고지는 등급에 따라 자동으로 고른다.
  - verified: "직접 녹음한 스위치 소리입니다. 화면 터치는 실제 키감을 전달하지 않습니다."
  - style: "공개 녹음(CC0)을 편집한 ASMR 스타일 사운드이며 특정 제품의 소리를 재현하지 않습니다."
- 앱 "만든 사람들" 화면은 매니페스트에서 생성한다. CC0도 저자를 표기한다(현 CREDITS 관행 유지).

---

## 4. 기획서 v0.1과의 정책 충돌

| # | 위치(문서 줄) | v0.1 내용 | 사용자 새 결정과의 충돌 | 수정 문구 제안 |
|---|---|---|---|---|
| 1 | §1-3(19), §10.2-1(416), §17.3-1(640), §16 G1(604) | 말랑이 1종·재질 1가지, TPR 추천, PU는 음식 스킨으로 이동 | TPR과 폼 **둘 다** 지원 | "말랑이는 **TPR(젤리)과 슬로우 라이징 폼 두 재질을 1급으로 지원**한다. v0.2 폼 구현은 유지하고 TPR을 재질 프리셋으로 추가한다. 기본 진입 재질은 [미결정]이며, 추천은 폼(v0.2 유지) + 칩 전환이다." |
| 2 | §1-6①(27), §1-7(30), §12 P−1(498), §17.6-1(665) | 재질을 하나로 확정하는 것이 선행 조건 | 확정 대상이 "하나"가 아니게 됨 | "P−1 완료 조건: 재질 **2종 각각의** 골든 레퍼런스 영상과 판정 기준(폼 = 오버슈트 0·복원 1.3~3 s, TPR = 1~2회 출렁임·0.3~0.9 s) 확정." |
| 3 | §11.1 표(476), §1-5(25) | "Elastic / Soft Foam은 같은 코어에 복원 곡선만 다르게" | 실제로는 부피 거동, 주름, 사운드 규칙까지 다르다 | "같은 **DeformCore를 공유**하되, 복원 법칙(점탄성/스프링), 부피 거동, 표면, 사운드 이벤트 규칙은 **재질 프리셋 + 코드 분기**로 분리한다." |
| 4 | §11.1 적용 시점(484-486) | 공통화는 두 번째 연속변형 장난감을 착수할 때 | TPR 추가가 곧 두 번째다 | "공통화 시점 = **지금(TPR 추가 시)**. 단 범위는 `SquishyMaterialPreset` + Toy 선택 필드(load/dispose/variants)로 제한하고, 범용 ToyDefinition은 계속 금지한다." |
| 5 | §10.3(426), §17.5(661), §17.1(625) | 슬라임, 왁뿌볼, 음식 스킨, ToyDefinition 일반화를 MVP와 P0에서 제외. "슬라임·슬랑이 MVP 제외"를 확정 결정으로 기재 | 6개 카테고리 모두 1급 | "**제품 카테고리**(1급): 키보드 스위치, 일반 말랑이(TPR·폼), 음식형 스퀴시, 슬랑이, 왁뿌볼, 크런치 말랑이. **출시 웨이브**는 별도로 관리한다: W1 = 말랑이 2재질 + 키보드 4소리 / W2 = 음식형·크런치(SquishyCore 재사용) / W3 = 왁뿌볼(상태 머신 + 프랙처) / W4 = 슬랑이(하이트필드). 웨이브 순서는 '카테고리 제외'가 아니라 기술 위험 순서다." §17.1의 해당 줄은 삭제한다 |
| 6 | §10.2-3~7(418-422), §7.3 제목(282), §7.4 제목(289), §18.8(§18 문서 293-304) | 음식 v1.1, 왁뿌볼 "차별 확인 시만", 슬랑이 장기, 키보드 비주력 | 모두 1급, 키보드 스위치는 핵심 콘텐츠 | 각 절 제목의 "(v1.1 후보)"·"[추천: MVP 제외]"를 "(W3)"·"(W4)"로 바꾼다. 왁뿌볼 조건 문구 "차별 가능성이 확인될 때만"은 "**차별 포인트(실물 일회성 vs 무한 재파손, 사운드 품질)를 W3 게이트로 검증**"으로 바꾼다 |
| 7 | (해당 항목 없음) §6.1, §7.6 | 크런치는 "슬랑이·비누 크런치"로만 존재 | "크런치 말랑이"가 독립 카테고리 | §6에 "크런치 말랑이 = SquishyCore + Crunch 모디파이어(남은 알갱이 상태, 압축 속도 비례 그레인)" 행을 추가한다. §17.3-7의 비누 크런치 선택과 분리한다 |
| 8 | §8.2(326-336), §18.6.1(§18 문서 241-252), §18.11-1 | 4종은 [가설], MVP는 2종이고 같은 보드 녹음 게이트 뒤 4종 | 초기 4종 이상, 장기 25종 | "초기 키보드 **4소리**를 출시한다. 같은 보드 녹음이 없으면 4종 모두 `style-preset` 등급(소리 결 이름만, 메커니즘 라벨 없음). 메커니즘 라벨과 장기 25종 확장은 §18.6.2 게이트(G3~G6)를 통과한 `verified-switch` 세트에만 적용한다." |
| 9 | §18.7 상시(§18 문서 289), §1-2(18) | "개수로 경쟁하지 않는다" | 장기 25종 | "개수는 목표가 아니라 **결과**다. 25종은 상한 목표이고, 각 추가분은 '기존 프리셋과 블라인드 구별 ≥ 80%'(§18.6.2 G5)를 통과해야 한다." |
| 10 | §8.6(373-379) [결정됨] | 직접 폴리 녹음이 주력, CC0는 보조 | v0.2 현실은 CC0 주력(`MVP_STATUS.md:24`), 예산 0원 | "음원은 **출처 등급제**로 관리한다(self-recorded > cc0 > cc-by(SA·NC 금지) > derived > synth). 실물을 보유한 품목은 자체 녹음(폰 포함)을 우선한다. 등급과 라벨 허용 범위는 매니페스트로 강제한다." |
| 11 | §8.6(377) | 절차적 합성은 키보드에 쓰지 않는다 | 현 코드는 샘플 로드 실패 시 키보드 합성 폴백(`keyboard/toy.ts:108-111`) | "키보드 합성음은 **로드 실패 폴백 전용**으로 허용하고, HUD와 report에 `synth` 표기를 남긴다. 사용자 노출 프리셋의 정식 음원으로는 쓰지 않는다." |
| 12 | §10.3(426), §17.5(661), §5.5(168) vs 코드 | 햅틱은 MVP에서 제외(Android 보너스도 v1.1) | `settings.ts:21` 기본 `haptics: true`, `toy.ts:202`·`keyboard/toy.ts:126` 호출(§18.11-2) | [미결정]. 추천안: "햅틱은 **Android 전용, 기본 ON**, iOS는 항목을 숨긴다(현행 `main.ts:78-82`). 패밀리별 패턴(키 = 6 ms, 폼 = 닿을 때 8 ms, TPR = 놓을 때 이중 펄스, 왁뿌볼 = 단계별)은 각 코어가 정의한다." 기획서 §10.3에서 '햅틱'을 삭제한다 |
| 13 | §6.2 음식형 열(205) | 음식형 = PU 스킨 | §6.1에는 TPR 음식(망고)도 있다 | "음식형 스퀴시 = **형태 + 표면 스킨 × 재질 프리셋(폼 또는 TPR)**." |
| 14 | §17.3-6(645) | 경쟁 앱과 겹치는 레퍼런스(청사과·계란형·감자빵·망고·복숭아)를 바꾸자 | 음식형과 왁뿌볼이 1급이 되면서 다시 중요해짐 | 유지하되 W2 착수 전 결정으로 격상: "음식형·왁뿌볼 품목명과 형태는 경쟁 앱 목록과 겹치지 않게 정한다(W2 게이트)." |

**덧붙임: 문서 상태 정리가 필요한 곳** [확인]
- `MVP_STATUS.md:5`는 아직 "말랑이(젤리/TPR)"이고 `:18`은 "합성음"이다(§18.9 C9와 같은 문제).
- 두 재질 지원을 반영해 "v0.2 = 폼, TPR = 재구성 예정"으로 갱신해야 한다.

---

## 5. 다음 단계 (구현 승인 시 순서) [추천]

1. 폼 회귀 스냅샷 테스트를 추가한다(코드 무변경 상태에서 먼저).
2. `SquishyMaterialPreset` + 모델 분기 + TPR 테스트를 만든다.
3. 셰이더 define과 사전 컴파일을 넣는다.
4. 사운드 이름공간을 나누고 폼 합성 폴백 교차 매핑을 바로잡는다.
5. 스프라이트 스키마 v2, provenance-check, CREDITS 생성을 만든다.
6. Toy 선택 필드(load/dispose/variants)와 ContentRegistry로 `main.ts` 하드코딩을 제거한다.
7. 키보드 4소리(style 등급)를 넣는다.
8. W2 이후 코어 착수.
