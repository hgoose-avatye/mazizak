# 신규 키보드 6종 — 음원 조사와 구현 준비

조사일: 2026-11-11 KST. 조사 기준 커밋: `main` / `5a668a2`.
**앱 포함 승인 가능한 신규 음원: 현재 0종. 대상 6종은 모두 유지한다.**
실제 후보 파일 확보와 원 녹음 재배포 허락을 구분했다. 사람의 청취는 수행하지 않았다.

## 작업 보호와 기존 4종 확인

- 시작 시 워크트리는 깨끗했고 untracked `app/`, `docs/`는 없었다.
- 기존 5개 외부 워크트리 및 모든 기존 브랜치·커밋을 변경하지 않았다.
- 기존 코드·음원 변경, 신규 프리셋 연결, 합성 대체, Push·Merge·커밋을 하지 않았다.
- 이 조사 폴더만 새로 추가했다. 후보 바이너리는 앱과 저장소 밖 임시 폴더에 보관했다.
- `keyPresets.ts`에 pebble / clack / creamy-thocky / topre 4개가 실제 등록되어 있다.
- Topre는 `public/sfx/keyboard/topre.wav`·`topre.json`, 원본 MP3 12개, MIT 고지뿐 아니라
  `keyboardSamples.ts`의 rowDown/전용 역할 로딩과 `toy.ts`의 등록·재생·선택 UI 연결까지 존재한다.
  R0~R4, 공통 키업, Space/Enter/Backspace 전용 다운·업을 지원한다.
- 현재 커밋에서 `npm test -- test/topre.test.ts`: **20/20 통과**.
  이는 현재 코드·파일 검증이며, 신규 청취 평가나 모바일 실기기 검증을 의미하지 않는다.
- Topre의 원 녹음 권리 출처 미확인 표기는 기존 CREDITS에 유지되어 있다.

## 확보·사용 가능성 요약

여기서 ‘후보 확보’는 표시 모델과 연결된 배포 파일을 실제 저장·디코딩했다는 뜻이다.
제작자 원본 세션/WAV와 동일성, 녹음 장비·버전, 권리 사슬까지 확정했다는 뜻은 아니다.

| ID / 정확한 대상 | 확보 파일 | 라이선스·모델 확인 | 키별 사운드 | 현재 앱 포함 |
|---|---|---|---|---|
| K05 Gateron Oil King 기본 Linear | ThockHub OGG 7개 + Mechvibes ZIP(6 MP3) | ThockHub 재배포 허락 미확인. ZIP 상세 페이지는 MIT이나 원제작자는 Beaver_XD로 별도 표시됨. ZIP에는 MIT 전문 없음. config의 `switch_type: tactile`도 실제 리니어와 불일치 | MIT 표시 팩은 행별 매핑 및 Space 파일 있음. Enter/Backspace는 일반 파일 재사용. 일부 2구간 정의는 있으나 진짜 독립 키업인지 미확인 | 보류: 원제작자 허락·정확한 녹음 확인 필요 |
| K06 HMX Cheese | 정확한 모델의 제작자 영상 레퍼런스만 확인; 음원 파일 미확보 | 우선 조사 3개 서비스에서 정확 모델의 허가된 팩을 찾지 못함. 다른 HMX로 대체하지 않음 | 분리 파일·키업·특수키 메타데이터 없음 | 보류: 원본·사용 허락 필요 |
| K07 Gazzew Boba U4T | ThockHub OGG 17개(62g 표기) + Mechvibes ZIP(WAV 1개) | CT 원제작자 설명은 Boba U4T 62g black housing과 일치. OGG 재배포 허락 미확인. ZIP 내부 `LICENSE.txt`: Personal use only. ZIP의 스프링·세부 버전 미확인 | CT 클립은 키/다운·업 라벨 없음. ZIP의 일반·Space·Enter·Backspace는 모두 같은 262.7ms 구간 | 보류: 62g/68g 및 리비전 확정·허락 필요 |
| K08 Kailh BOX Jade 기본형 | Mechvibes ZIP(WAV 1개) | ZIP 상세 페이지는 NK65 Entry Edition + BOX Jade + 원 영상 링크를 명시. 원 영상의 직접 대조는 완료하지 못함. ZIP 내부 Personal use only | 일반 3구간과 Space/Enter/Backspace 별도 구간 있음. 대부분 한 구간이며, 진짜 독립 키업은 미확인 | 보류: 원 녹음자 허락 및 대조 필요 |
| K09 Outemu Silent Peach V3 | ThockHub OGG 14개 | 로컬 CT 경로는 V3이며 원제작자 페이지도 V3를 명시. 재배포 허락·개별 녹음 키 라벨 미확인 | 일반 후보 클립만 확보. 다운·업/특수키 독립 여부 미확인 | 보류: V3 원본·허락·구간 라벨 필요 |
| K10 Gateron Magnetic Jade 기본형 | 정확한 기본형의 제작자 영상 레퍼런스만 확인; 음원 파일 미확보 | ThockHub에는 Pro/Ultra가 있으나 기본형과 다름. Mechvibes의 Pro 팩과 `Wooting 80HE Gateron Jade 70g`은 변형/개조 가능성이 있어 기본형으로 확정하지 않음 | 원본 분리 파일·키업·특수키 메타데이터 없음 | 보류: 기본형 원본과 허락 필요 |

## 우선 사이트별 근거

### ThockHub

[시뮬레이터](https://thockhub.com/simulator/)와 공개 로더
[`index-nYgKLO3l.js`](https://thockhub.com/assets/index-nYgKLO3l.js)를 확인했다.
로컬 `/audio/ct/<slug>/<index>.ogg` 경로는 Oil King 7개, Boba U4T 62g 17개,
Silent Peach V3 14개이며 모두 실제 다운로드·디코딩했다.

- 원 녹음자의 설명과 모델명을 대조한 페이지:
  [Oil King](https://www.clickandthock.com/linear-switches-1/gateron-oil-king),
  [Boba U4T](https://www.clickandthock.com/tactile-switches-1/gazzew-boba-u4t),
  [Peach V3](https://www.clickandthock.com/silent-switches-1/outemu-silent-peach-v3).
- CT 설명은 GMK/MT3/SA 키캡의 전체 키보드 테스트를 명시한다.
  이번에 확보한 개별 OGG의 키캡·키 위치·다운/업·녹음 장비·마이크 거리·추출 시각은 확인되지 않았다.
  전체 영상의 모든 키캡 조건이 각 OGG에 포함되었다고 추정하지 않는다.
- Peach V3의 메타데이터 `audioFile`은 Ocean을 가리키지만, **현재 로더는 로컬 CT V3 목록을 우선**한다.
  따라서 현재 V3가 Ocean 파일로 재생된다고 단정하지 않는다. 확보한 것은 로컬 V3 경로뿐이다.
- 로더에 합성 폴백도 존재한다. 사이트에서 소리가 난다는 것만으로 실제 모델 녹음이라고 판단하지 않는다.
- HMX Cheese 정확 모델은 확인한 목록에 없고, Magnetic Jade는 Pro/Ultra이므로 기본형으로 사용하지 않는다.
- BOX Jade에 연결된 외부 KeebSound 경로는 찾았지만 다운로드하지 않았다.
  [KeebSound 약관](https://www.keebsound.com/terms)은 오디오 권리를 유보하고 자동 수집에 서면 허락을 요구한다.
- 공개 접근 가능한 파일이라는 사실은 게임 내 포함·가공·재배포 허락을 의미하지 않는다.

### Mechvibes

[라이브러리](https://mechvibes.com/sound-packs?type=keyboard)의 검색·상세 페이지와 실제 ZIP을 확인했다.
일부 페이지는 웹 도구에서 열리지 않아 공개 HTML을 curl로 확인했다. 로그인·접근 제한을 우회하지 않았다.

| 팩 | 상세·실물 확인 | 판정 |
|---|---|---|
| [gmk67 oil kings](https://mechvibes.com/sound-packs/gmk67-oil-kings) | 업로더 Laika/Raika, Recorded By Beaver_XD, [원 영상](https://youtu.be/Amw7Jz1GFmA), MIT 표시. `1.mp3`~`5.mp3`, `spacebar.mp3`, `config.json` | 패키지 표시상 허용 후보이나 원제작자 권리 사슬·모델 대조는 미완료. 원 녹음자 허락 확인 전 앱 사용 보류 |
| [gateron oil king](https://mechvibes.com/sound-packs/gateron-oil-king) | QK65, 개인 사용, 원 영상 링크. ZIP은 내려받지 않음 | 레퍼런스만 |
| [MonsGeek M1 Oil King](https://mechvibes.com/sound-packs/monsgeek-m1-with-gateron-oil-king-switches) | 개인 사용, 원 영상 링크. ZIP은 내려받지 않음 | 레퍼런스만 |
| [Boba U4T](https://mechvibes.com/sound-packs/boba-u4t) | Matthew Osias/Fweaken, 영상에서 키 소리를 녹음·편집했다고 설명. ZIP은 WAV 1개·config·개인사용 LICENSE | 레퍼런스만. 모든 키를 별도로 녹음한 팩 아님 |
| [Gazzew Boba U4T](https://mechvibes.com/sound-packs/gazzew-boba-u4t) | Squashy Boy 빌드/폼 개조 영상, 개인 사용. 다운로드하지 않음 | 레퍼런스만. 개조·키보드 영향 큼 |
| [Kailh Box Jade](https://mechvibes.com/sound-packs/kailh-box-jade) | NK65 Entry Edition, [원 영상](https://www.youtube.com/watch?v=kye-K-RHFL8), 개인 사용. ZIP은 44.1kHz stereo WAV 1개·config·LICENSE | Space 2670.3–3088.3ms / Enter 2322.0–2670.3ms / Backspace 1602.2–1950.5ms 매핑. 녹음의 실제 키·다운/업은 추가 대조 필요 |
| [BOX Jades Novix](https://mechvibes.com/sound-packs/kailh-box-jades-novix), [KBD67 Lite R3](https://mechvibes.com/sound-packs/kbd67-lite-r3-with-kailh-box-jade-switches) | 각각 Tofu96 / KBD67 Lite R3, 개인 사용, 원 영상 링크. 다운로드하지 않음 | 레퍼런스만 |
| [Wooting Jade 70g](https://mechvibes.com/sound-packs/wooting-80he-gateron-jade-70g), [Magnetic Jade Pro](https://mechvibes.com/sound-packs/novix-56-gateron-magnetic-jade-pro-he) | 개인 사용. 전자는 스프링 개조 가능성, 후자는 다른 버전. 다운로드하지 않음 | K10 기본형 대체 불가 |

중요: config에 2개 타이밍이 있어도 각각의 소리가 실제 다운/업이라는 증거는 아니다.
Oil King 팩에는 겹치는 타이밍과 동일 구간 재사용도 있다. 듣지 않고 분리 녹음이라고 표시하지 않는다.

### kbs.im / kbsim

[README의 지원 스위치](https://github.com/tplai/kbsim#currently-supported-switches) 및
기확보 소스 `src/features/audioModules`을 확인했다. 신규 6종의 정확한 음원은 확인되지 않았다.
BOX Navy를 BOX Jade로, Black Ink를 Oil King으로, Cream을 Cheese로 바꾸어 표시하지 않는다.
기존 Topre의 MIT가 다른 사이트의 음원에 적용되는 것도 아니다.

## 실제 확보 파일

앱 포함 가능 파일은 **없다**. 아래는 전부 검토용이며 저장소에 바이너리를 추가하지 않았다.

- 위치: `/private/tmp/manzizak-six-research/reference-only/` (임시 보관, 자동 정리될 수 있음).
- ThockHub: K05 `0.ogg`~`6.ogg` / K07 `0.ogg`~`16.ogg` / K09 `0.ogg`~`13.ogg`: **38 OGG**.
- Mechvibes: K05 `mv-9dbc3ddcabc444dba7ba2a584ba2c8ea`, K07 `mv-1921cd45c1ae414fb8a98210671c63c4`,
  K08 `mv-37918613073f4a61b78bce2801940f0f`: **ZIP 3개**, 각각의 원본 파일을 같은 디렉터리에 풀어 보관.
- ZIP 내부 오디오: **MP3 6개 + WAV 2개**. 원 세션 master가 아니라 배포용·가공된 샘플이다.
- 총 **오디오 46개 디코딩 성공**, 무신호 파일 0개, 디코딩 기준 합계 약 11.85초.
  별도 권리·모델·키 라벨 검증 또는 사람의 음질 검증을 통과했다는 뜻은 아니다.
- 파일별 URL·바이트·SHA-256: [download-manifest.json](./download-manifest.json).
  파형 수치: [audio-inspection.json](./audio-inspection.json).
  config 매핑: [pack-analysis.json](./pack-analysis.json).
- HMX Cheese와 기본형 Magnetic Jade: 현재 확보 음원 파일 **0개**. 영상 링크만 확보했다.

## 실존·외형·구조·반응 조사

수치는 보편적 실측값이 아니라 해당 제품/판매자 문서의 명시값이다.
작동압과 바닥압, HE 초기압을 서로 같은 수치로 취급하지 않는다.

| 대상 | 외형·스템·하우징 | 압력 / 이동 거리 | 구조와 다운·업 반응의 연결 |
|---|---|---|---|
| Oil King | 검정 MX 십자 스템·하우징. POM 스템, PA66 상부, INK blend 하부 | 공식 작동 55±5gf, 전진 2.0±0.6mm, 총 4.0mm max. 바닥압은 자료 불일치로 확정하지 않음 | 범프·클릭기구 없는 리니어. 소리는 주로 바닥 충돌·상부 복귀·키보드 공진. 윤활은 마찰/스프링 잡음을 줄이나 저음을 보장하지 않음 |
| HMX Cheese | 황색 계열 MX 롱폴 LY 스템, PA12 상부/PA-2 하부 | 작동 43gf, 바닥 46gf, 전진 2.0mm, 총 3.5mm. 스프링 길이 20/22mm 자료 차이는 미확정 | 가벼운 리니어와 짧은 롱폴 충돌로 선명한 다운을 기대. 복귀는 별도 상부 충돌이며 다운 복제로 대체 불가 |
| Boba U4T | 기본 pearl/black 등 변형 존재. 이번 CT 레퍼런스는 black 62g. mustard/gold POM 롱폴, Boba 계열 하우징 | 62g/68g은 **바닥압**. CT 62g 자료의 총 이동 4mm; 작동압 수치 미확정 | D형 택타일 범프의 저항 변화와 롱폴 바닥 충돌. 클릭바가 없으므로 BOX Jade의 클릭을 섞으면 안 됨. 복귀 충돌도 별도 |
| BOX Jade | 투명 상부·백색 하부·녹색 BOX형 MX 스템, PC 상부/PA66 하부 | 공식 작동 50±20gf, 택타일 75±15gf, 전진 1.8±0.4mm, 총 3.6±0.3mm | 굵은 클릭바가 눌림과 복귀 중 별도 클릭을 만들 수 있음. 단순 바닥음만으로 충분하지 않으며 실제 다운·업 녹음 확보 우선 |
| Silent Peach V3 | 복숭아빛 반투명 하우징·황색 계열 MX 스템과 디퓨저. PA66/POM, 실리콘 댐퍼 | 작동 40gf, 전진 2mm, 총 3.3mm. 바닥 45/50gf 자료 차이; 샘플 로트 확인 필요 | 양 끝 충격을 댐핑해 바닥과 복귀를 모두 조용하게. 일반 스위치 파일의 볼륨만 낮추는 것과 다른 기계적 경험 |
| Magnetic Jade 기본형 | 공식 제품 사진에서 투명 상부·옥색 하부·백색 MX 스템 확인. 내부 자석과 스프링, 닫힌 하부 구조 | 공식 **초기압** 30±7gf, 총 3.5±0.2mm. 입력점은 호환 HE 키보드에서 설정. 초기압을 작동압으로 표기하지 않음 | 자석/센서는 감지 방식. 소리는 바닥·복귀 충돌, 하부 구조·키보드 공진에서 생김. HE 자체의 고유 음색이나 물리적 빠른 복귀를 가정하지 않음 |

사양·제품 사진 근거:
[Oil King 공식](https://www.gateron.co/collections/gateron-switches/products/gateron-oil-king-switch-set),
[Cheese 판매 제품](https://ktechs.store/products/hmx-cheese-linear-switch),
[Cheese 제품 사진](https://www.mechmods.co.uk/products/hmx-cheese-switches),
[Boba 제품·스템](https://stupidbulletstech.com/products/gazzew-boba-u4t-black-with-slot),
[Boba 재질](https://deltakeyco.com/products/gazzew-boba-u4t),
[BOX 공식 구조·사양](https://www.kailh.net/blogs/news/kailh-box-switches-buying-guide),
[Peach V3 제품](https://neomacro.in/products/outemu-peach-v3-silent),
[Peach V3 댐퍼](https://www.mecha.com.my/products/outemu-silent-peach-v3),
[Magnetic Jade 공식](https://www.gateron.com/products/gateron-magic-jade-switch?VariantsId=10767).

불일치 주의: ThockHub의 임의 force/db/hz 메타데이터를 제조사 규격이나 실제 음압으로 사용하지 않는다.
CT Oil King 페이지의 재질·이동 거리 일부도 공식과 불일치하므로 공식 사양을 우선했다.
Peach V3 판매점 중 4mm/다른 제조사로 기재된 상충 목록도 있어 채택하지 않았다.

## 음향 차별성과 녹음 환경

아래는 구조·제작자 설명에 따른 **설계 가설**이며 직접 청취로 입증한 평가가 아니다.

| 대상 | 기존 4종과 구별할 목표 / 겹칠 위험 | 확인한 레퍼런스 환경 |
|---|---|---|
| Oil King | 깊은 저음 리니어. 조약돌/크리미와 가장 겹칠 위험이 큼 | CT는 GMK/MT3/SA 비교, MV는 GMK67/QK65/MonsGeek 등 서로 다른 보드. 원 마이크/게인/개별 샘플 조건 미확인 |
| HMX Cheese | 클릭 없는 밝고 짧은 고음. 까랑까랑의 Gateron Blue 클릭과 구분 | [CarnellBoards 원 제작자 영상](https://www.youtube.com/watch?v=Ia83r5bt62U): Mode Envoy, FR4, GMK Serika, foam 없음, TX AP. [alexotos 영상](https://www.youtube.com/watch?v=l5lV3Vgiz6Y)은 silver Harbour + Cheese를 설명. 둘 다 파일 재사용 허락 미확인 |
| Boba U4T | 단단한 택타일 범프와 롱폴 충돌. 저음만 강조하면 조약돌과 겹침 | CT black 62g, GMK/MT3/SA. MV 단일 키 편집본은 보드/키캡/로트 미확인 |
| BOX Jade | 클릭바의 굵은 다운/업 클릭. 기존 까랑까랑의 클릭 재킷과 구분 | NK65 Entry Edition 팩, 다른 팩은 Tofu96/KBD67 Lite. 보드별 차이와 스테빌라이저 영향 분리 필요 |
| Peach V3 | 양 끝을 댐핑한 작은 충격음. Topre의 무접점/돔 반응과 구별 | CT V3의 GMK/MT3/SA 테스트. 마이크·게인 불명으로 타 사이트보다 ‘몇 dB 조용하다’는 비교 금지 |
| Magnetic Jade | 정돈된 리니어 충돌·복귀. 센서가 만드는 전자음이 아님 | [Eric Miller 원 제작자 영상](https://www.youtube.com/watch?v=uv47LMQMXn8): Wooting60HE, TOFU60 Redux brass weight, FR4, 3층 tape, burger mount, foam, 윤활 스테빌라이저. 키캡/마이크 조건은 확보 설명에서 미확인 |

키캡의 재질·프로파일, 보드 케이스·보강판·마운트·폼, 스테빌라이저, 데스크와 마이크/자동게인은 모두 음색·음량을 바꾼다.
이들이 다른 녹음을 스위치만의 차이로 설명하지 않는다. 특히 저소음 프리셋을 다른 프리셋과 같은 RMS로 증폭하면
정숙성 차이를 지울 수 있으므로 같은 녹음 체인의 원 레벨 비교와 별도 음량 보정 청취를 분리해야 한다.

## 최소 구현 변경 제안 — 아직 미구현

1. **6종 카탈로그와 음원 준비 상태 분리.** K05~K10 고정 ID·정확한 모델/버전·source/license/capabilities를 기록한다.
   최종 10종 UI에 들어갈 메타데이터와 실제 playable preset을 구분한다. 미확보 모델은 ‘음원 준비 중’으로 표시하고 선택 불가;
   합성음을 재생하면서 해당 모델의 녹음인 것처럼 보이지 않게 한다. 이번에는 카탈로그도 앱에 연결하지 않았다.
2. **기존 로더 유지, 신규 스키마만 명시적 capability 추가.** WAV+JSON, 캐시·동일 음원 슬라이스를 재사용한다.
   신규 팩에는 down/up/spaceDown/spaceUp/enterDown/enterUp/backspaceDown/backspaceUp 지원 여부와
   ‘전용 녹음/일반음 재사용/없음’을 기록한다. 기존 4종 맵과 폴백 의미는 그대로 둔다.
   현재 `upMode: none`은 이미 있으나 spaceDown 등의 자동 대체는 ‘전용 녹음’이 아니다.
   신규 맵에서 누락된 키업을 down으로 자동 대체하지 않도록 명시적 정책이 필요하다.
3. **Topre 전용 분기를 capability 기반으로 최소 일반화.** `roleName`과 실제 키보드 전체 행 입력이 현재 `p === 'topre'`로 묶여 있다.
   새 팩도 Enter/Backspace와 키별 다운/업을 사용하려면 이 분기를 metadata 기준으로 바꿔야 한다.
   행별 팩은 현 rowDown을 재사용하고, 정확한 개별키 녹음이 있으면 선택적 code→entry 매핑을 추가한다.
   미니 화면은 여전히 Q/A/Z+Space이므로 터치로 특수키를 쓰려면 별도 패드 또는 비교 화면이 필요하다.
4. **입력과 전환.** 기존 모델·멀티터치·heldPreset의 누른 프리셋 보존·오디오 엔진의 동시 재생 제한은 재사용한다.
   다만 현재 ‘로딩 중 소리’는 마지막으로 선택한 프리셋이 아니라 ready 배열의 마지막 항목일 수 있다.
   신규 6종은 마지막 활성 프리셋을 유지하고, 준비 완료 후 다음 down부터 전환하도록 명시한다.
   같은 화면 키를 물리키·터치로 함께 누르는 경계, cancel/blur와 전환 중 release도 검증한다.
5. **프리셋별 loading/ready/error·미지원 표시.** 현재 soundSource는 내부 상태/진단용이며 UI의 개별 상태는 없다.
   신규 음원 실패 시 다른 축의 합성음을 대신 틀지 않고 이전 정상 프리셋과 ‘불러오기 실패’를 유지한다.
   재시도 버튼/상태와 실제 미지원 키업·특수키 표시를 추가한다. 기존 4종 실패 동작은 보존한다.
6. **모바일 성능.** 현재 idle 선로딩은 4종 모두이며 10종 전체로 그대로 확대하지 않는다.
   선택 팩+인접 1종 정도만 제한된 동시 fetch/decode로 준비하고, 해제 가능한 캐시와 등록된 AudioBuffer 참조도 함께 관리한다.
   현재 WeakMap만으로 컨텍스트가 살아 있는 동안 프리셋 메모리가 해제되지는 않는다.
   mono48k Float32는 1초당 약192KB이며 sprite와 슬라이스 사본도 고려한다. 실제 승인 파일 길이를 기준으로 메모리 상한을 정한다.
7. **외형·반응 확장은 후속.** 기존 키캡 외형을 보존한 채 switchHousingColor/stemColor/stemShape,
   forceKind/travelMm/actuationKind/damping 같은 메타데이터를 제안한다. 이후 스위치 단면/노출 옵션에 적용한다.
   tactile 범프, click-bar 이벤트, silent 댐핑과 HE 입력점을 별도로 표현하되 이동·센서·충돌을 혼동하지 않는다.
   화면 터치에서 실제 압력 측정이나 HE 입력 장치의 아날로그 이동을 얻는다고 주장하지 않는다.
8. **검증.** 승인된 팩의 원본 해시·모델·라이선스, 모든 실제 지원 role, 미지원 무음,
   연속 입력/멀티터치/빠른 전환/지연·실패/저사양 모바일 메모리, 기존 4종 회귀·타입·빌드를 확인한다.
   동일 패턴 비교 화면을 10종으로 확장하고, 각 팩의 출처와 녹음 환경을 표시해 사람 청취를 따로 진행한다.

## 다음 단계와 필요한 승인

- **기술 난도:** 허락·라벨 있는 다운 전용 팩 변환은 낮음, 전용 특수키/행 매핑 연결은 중간,
  10종 상태·로딩/메모리·미지원 표시까지는 중간. 원본 없는 모델을 실제 녹음으로 만드는 일은 구현으로 해결할 수 없다.
- 먼저 Oil King MIT 표시 팩의 원제작자 허락과 CT의 Oil King/Boba62g/PeachV3 원본 사용 허락을 확인한다.
  BOX Jade는 원 녹음자에게 게임 내 상업/비상업 사용·가공·웹 전달·재배포 범위를 확인한다.
- Cheese와 기본형 Magnetic Jade는 링크의 원제작자에게 원본·사용 조건을 요청하거나 직접 녹음한다.
  Jade Pro/Ultra/70g 개조판이나 다른 HMX로 대체하는 계획은 없다.
- 사용자 승인 필요: 원제작자 연락 수행 여부(이번에는 연락 안 함), 라이선스 취득/직접 녹음 비용,
  Boba62g 및 각 모델 로트 선택, 실제 사용할 허락된 파일, 이후 구현 범위.
  사용자 승인만으로 타인의 음원 재사용 권리가 생기지는 않는다.
- 전용 다운·업이 필수인 완성형 10종을 목표로 한다면 일반 여러 키 + Space/Enter/Backspace를
  긴 홀드 간격으로 분리 녹음하고 같은 마이크/게인/거리·보드·키캡 조건을 기록하는 방식이 가장 확실하다.
  모든 모델을 정확히 유지하며, 파일과 허락이 준비된 모델부터만 후속 구현할 것을 제안한다.


## 사용자 청취 피드백 및 태그 확정 — 후속 반영

- 사용자 지시: 권리 확인 후 완료된 모델을 기존 앱에 추가한다. 현재는 앱 포함 가능한 후보가 없어 기존 4종과 앱 코드를 유지한다.
- 6종의 ID·정확한 스위치명·분류는 [sensory-catalog.json](./sensory-catalog.json)에 유지했다.
  `sensoryExpression`, `onomatopoeia`, `tags`를 독립 필드로 저장하고, 기술명과 감각 표현을 함께 표시하는 `labelTemplate`을 기록했다.
  감각 태그는 사용자 경험용 표현이며 실측·정확한 소리의 확정 결과가 아니다. 청취 후 수정 가능하다.
- HMX Cheese·기본형 Magnetic Jade는 `audioStatus: pending-audio`, 나머지 4종은 `reference-only`다.
  모든 신규 후보의 `approvedForApp`은 false이며, 합성 대체 프리셋을 추가하지 않았다.
- 임시 청취 서버 http://localhost:4352/ 에서 확보된 4종 버튼과 2종 pending 카드에 확정 태그를 표시한다.
- 사용자 피드백에 따라 K05·K09의 CT 후보만 재생 게인을 +20dB로 보정한다. K05의 Mechvibes 팩은 이미 충분한 레벨이므로 0dB를 유지한다.
  이는 감각 태그에 따른 변형이 아니라 청취 편의를 위한 재생 음량 보정이다. 원본 파일·피치·EQ·타이밍은 변경하지 않았다.
- 재생 설정은 [audition-playback.json](./audition-playback.json)에 태그와 별도로 저장했다.
  클립당 peak ceiling 0.8과 동시 입력용 compressor를 임시 화면에 적용했다. 이 보정 후 모델 사이의 절대 정숙성 비교는 불가하다.
- 원 녹음의 다운/업이 확인되지 않아 임시 화면에서 별도 키업은 만들지 않는다. 기존 앱 연결·Push·Merge는 하지 않았다.
