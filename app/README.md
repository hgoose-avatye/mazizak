# 만지작 MANZIZAK — MVP (v0.1)

모바일 웹 실사형 3D 피젯 장난감. 말랑이(젤리형/TPR)와 9키+스페이스 키보드.

## 실행

```bash
cd app
npm install
npm run dev            # http://localhost:4319 (vite --host → 같은 Wi-Fi 휴대폰에서 http://<Mac IP>:4319)
npm run build && npm run preview   # 프로덕션 빌드 확인 (빌드 전에 check:sfx가 public/sfx가 원본과 일치하는지 검사)
npm run pack:sfx       # 효과음을 바꾼 뒤: audio-src/sfx(WAV 원본) → public/sfx(무손실 FLAC, 해시 파일명) + src/audio/sfxManifest.ts 다시 만들기
npm run check:dist && npm run check:load   # 배포 검사 · 브라우저 로딩 회귀 검사 (빌드 후)
npm test               # 단위 테스트 (스프링·모델·키캡 지오메트리·효과음)
node scripts/make-thumbs.mjs   # 메뉴 썸네일 다시 만들기 (장난감 모양을 바꾼 뒤; 로컬 폴더 없는 dev 서버 필요 — 스크립트 머리말 참고)
```

휴대폰 테스트: Mac과 같은 Wi-Fi에서 `http://<Mac의 IP>:4319` 접속. (`ipconfig getifaddr en0`)

## 화면

- `#/` 홈: 장난감 선택 카드(실제 3D 렌더 썸네일 — `public/thumbs/menu/<ID>.jpg`, `kb-<프리셋>.jpg`; 이미지가 없으면 CSS로 그린 모양이 대신 보임)
- `#/squishy` 말랑이(슬로우 라이징 폼): 누르면 즉시 들어가고, 놓으면 자국이 잠시 남았다가 1.4~3초에 걸쳐 천천히 복원(반동 없음) · 끌기 · 두 손가락 늘리기 · 색상 4종 · 초기화
- `#/keyboard` 키캡: 9키+스페이스, 동시 입력, 누른 위치에 따른 미세 기울기, 프리셋 10종(조약돌·얼음·크림·마시멜로·민트·타자기 + 몽돌·찌개·두부·복숭아), 물리 키보드(QWE/ASD/ZXC/Space).
- 모닝빵(S02)·찹쌀떡(S03)은 직접 만든 3D 모델(`public/models/`, 0.5MB로 재포장: `scripts/fidgets/pack-reference-models.mjs`)을 공개 빌드에서도 쓴다.. 불러오지 못하면 `visuals.ts`가 칠한 대체 모양이 보인다
- **모양·회복(2026-11-20)**: 말랑이 탭(슬랑이·모닝빵·찹쌀떡·망고·비누·레인보우·마시멜로)은 **메모리폼** — 눌린 채 0.4초 머물렀다 천천히 차오름(`catalog.ts` `plastic: MEMORY_FOAM`=2.5초). 왁뿌볼(청사과·초콜릿)은 만진 모양·깨진 채 그대로(`KEEP_SHAPE`), 누르는 곳마다 다 부서지고(25% 한계·섬 없음, 청사과 220조각) 앞을 누르면 뒷면도 같이 깨짐, 깨진 만큼 속과 마블처럼 섞임. 껍질은 손가락을 따라 눌림
- **뭉개기 탭(2026-11-20)**: 치즈·휘핑크림·토마토·딸기·푸딩·두부·버터 — 뭉갠 채 전혀 되돌아오지 않음(부피·겉면 힘 끔, `cage.ts` 뭉개기 프로필), 즙 방울·과육 조각·씨가 사방으로 튀어 바닥에 웅덩이로 남고, 문지르면 물감처럼 바닥에 펴 발림(`splatter.ts`). 초기화 버튼으로만 되돌림. 무료 3회는 따로(`gate.ts` 그룹 squash). 소리는 기존 장난감 것을 빌려 씀(`catalog.ts` `soundAs`)
- **효과**: 비누 만지면 비눗방울, 모닝빵·마시멜로는 김(`puffs.ts`). 비누 앞면 SOAP·버터 앞면 BUTTER 각인(`visuals.ts` stampTextures)
- 늘이는 범위는 `PLASTIC_BOUNDS`(가로 1.35배·위 2배·앞뒤 1.1배) 안이라 화면 밖으로 안 나감. 장난감별 화면 크기는 `viewScale`(레인보우·비누·청사과 작게)
- 설정 시트: 소리·볼륨·진동(Android)·화질(자동/고화질/절약)·움직임 줄이기·성능 정보
- `audio-test.html`: 모바일 오디오 활성화(pointerdown/pointerup/touchstart) 실기기 검증 도구

## 앱인토스 · 광고 (src/ads)

- **처음 뜨는 장난감은 무료(횟수 제외)**, 그 뒤로 다른 종류(서랍 카드 하나 = 피짓 1개 또는 키보드 프리셋 1개)를 고를 때마다 무료 3회에서 1회씩 차감(**말랑이와 키보드를 따로** 3회씩)(전에 봤던 종류로 돌아가도 차감, 고를 때마다 "말랑이(키보드) 남은 무료 N/3회" 알림, 서랍에 보고 있는 쪽의 "무료 N회", 다 쓰면 "오후 2시에 무료 3회"). 다 쓰면 고를 때마다 "광고 보고 열기" 시트 → 보상형 광고를 보면 그 방문만 열림 — **건너뛰거나 중간에 닫아도 연다**(2026-11-20 결정, 보상 신호 `userEarnedReward`를 기다리지 않음). **하루 세 번 06·14·22시(KST, SDK 20판 구간과 같음)에 다시 3회**(`resetPeriod`). 숫자는 `src/ads/gate.ts`의 `GATE_CONFIG`(`freePerDay`, `unlockSwitches`). **지금은 `pretendAds: true` — "광고 보고 만지기"를 누르면 광고를 띄우지 않고 바로 연다(본 셈 침, 2026-11-20). 실제 광고로 돌리려면 false**
- 정책(toss/apps-in-toss-examples · in-app-ads): 광고는 사용자가 버튼을 누를 때만, 앱 진입·링크로 들어올 때는 광고 없이 열려 있는 종류를 보여 줌. 광고가 없으면(재고 없음·오프라인) 그냥 열어 줌 — 광고 때문에 막히는 화면 없음
- 광고 SDK(`@apps-in-toss/web-framework`)는 첫 장난감이 뜬 뒤에 받고, 광고도 미리 불러 둠. 토스 앱 밖(일반 브라우저)에서는 광고가 지원되지 않아 잠금 없이 모두 열림
- 브라우저 확인: 개발 서버(`npm run dev`)를 사람이 열면 가짜 광고가 기본으로 켜짐(`?ads=off`로 끔, 자동 검사 브라우저는 꺼짐) · `?ads=mock`(가짜 동영상 광고: 캔버스 애니메이션 15초, 5초 뒤 건너뛰기(건너뛰어도 열림) · 짧게: `&adsec=3&adskip=1`) · `?ads=mock-fail`(광고 없음) · `BASE=http://127.0.0.1:<port> node scripts/ad-gate-check.mjs`
- 토스 상단: 토스는 페이지 오른쪽 위에 캡슐(⋯ ✕)을 겹쳐 그림 → 토스 빌드(`vite build --mode toss`, `<html data-platform="toss">`)에서만 `--safe-t` = 상태바(`SafeArea.get().top`, `src/core/tossShell.ts`) + **62px**. 웹 빌드는 그대로(0). 56px은 가로 화면에서 서랍 '접기' 버튼이 캡슐(✕)과 2px까지 붙어서 쓰지 않음(style.css 주석). Android 뒤로가기: 열린 시트 닫기 → 없으면 미니앱 닫기. 브라우저 미리보기: 개발 서버는 **기본으로 토스 상단 띠를 켬**(웹 배치는 `?platform=web`, 상태바까지 보려면 `?aitTop=47`), 검사: `QUERY='?platform=toss&aitTop=47' BASE=… node scripts/responsive-check.mjs`
- 빌드: `npm run build:ait` → `manzizak.ait` (설정: `apps-in-toss.config.ts`, `appName`은 콘솔 등록 이름으로 바꿔야 함). **실제 광고 그룹 ID는 `VITE_AIT_REWARDED_AD_ID=<콘솔에서 받은 ID> npm run build:ait`** — 없으면 토스 테스트 ID(`ait-ad-test-rewarded-id`)가 들어가므로 출시 빌드에 쓰면 안 됨

## SDK 미션 · 출석 (src/sdk, 2026-11-20)

GFactory 게임 SDK 0.38.18(`public/vendor/gf-sdk@0.38.18.js`, 애니멀팝·볼트팝과 같은 파일 — `test/sdk.test.ts`가 SHA 고정)로 토스포인트 미션과 7일 출석을 붙였다. 설정은 기존 토스 웹게임과 같음(`uxVersion:2`, `econ:5`, Normal 스킨 `src/sdk/skin` — 글꼴만 주아).

- **1판 = 장난감을 실제로 1분 만지기**(`src/sdk/playClock.ts`): 터치·끌기·키 입력 뒤 8초 안이면 노는 중, 설정·광고 시트·SDK 창이 덮거나 앱이 가려지면 멈춤. 1분이 찰 때마다 `gameEnd()` → 오늘 3판 · 20판(06·14·22시) · 5판마다. 30분 플레이는 SDK가 `setRoundActive` 시간으로 셈
- 출석: 2일차부터 SDK가 알아서 띄움. 1일차는 첫 1판을 마칠 때 `onboarding.tutorialComplete()`로 기록(만지작엔 튜토리얼이 없음)
- 아이템 보상: 하트(5판마다 +1, 30분 +10) → **무료 만지기 추가 횟수**(`gate.ts` `bonus`, 구간이 바뀌어도 남음, 왼쪽 위 칩에 `+N`). 그 밖의 아이템은 0으로 ack. **SDK 창의 보상 문구는 서버가 보내는 "하트 N개" 그대로** — 바꾸려면 SDK·서버 담당과 협의
- 안 쓰는 것: 랭킹(점수가 없고 토스 정책상 포인트를 점수·순위에 못 붙임), SDK 광고(보상형 광고는 `src/ads` 그대로), 결과 화면 훅
- **켜지는 조건: 토스 빌드 + `src/sdk/gf.ts`의 `GF_CONFIG.promotionCode`가 채워졌을 때.** 지금은 빈 값이라 꺼져 있음(동작 그대로). 켜기 전에 서버 쪽에서 할 일(SDK 저장소 `docs/GAME-INTEGRATION.md` §15):
  1. 토스 콘솔: 앱 등록(`appName` — `apps-in-toss.config.ts`와 `GF_CONFIG.appName` 같이 바꿈), 미션 포인트 프로모션 승인·예산 → `promotionCode`
  2. Guru: 토스 로그인 앱 · 아바티 앱 · Guru 게임 앱 연결 / Worker 비밀값 `GURU_TOSS_BASIC_<KEY>`·`AVATYE_BASIC_<KEY>`·`GURU_BASIC_<KEY>`(+`_TEST`), `GAMES_SPLIT_SESSION_GAMES`에 `manzizak@test|live`
  3. Edge `GF_REWARD_CAMPAIGNS`에 `manzizak: { test: { active, promotionCode: "TEST_…", rewardUxV2: true, econ5: true }, live: {…} }` (없으면 `ux_disabled`)
  4. (선택) 분석: Worker `GAME_ANALYTICS_DEPLOYMENTS`에 deploymentId → `GF_CONFIG.analyticsDeploymentId`
- 개발 모의(서버 없이 화면만): `npm run dev` + `?gfmock=missions` 또는 `?gfmock=attendance` (네트워크 전부 차단, 가짜 econ5 상태. 상태바까지 보려면 `&aitTop=47`). 빌드에는 들어가지 않음

## 화면 크기·방향 대응

- 기기 이름이 아니라 남은 공간의 모양으로 배치를 정함: 보통은 장난감 서랍이 아래, **3:2보다 넓고 높이 640px 이하, 또는 5:4보다 넓고 520px 이하**(가로 폰·낮은 창·분할 화면)이면 서랍이 오른쪽 레일이 되어 장난감이 화면 높이를 다 씀. 화면이 접힌 기기가 Viewport Segments를 알려 주면 장난감은 접힌 선 한쪽에만 놓임(지원 안 하는 브라우저는 무시)
- 좌표: 장난감 형상(월드) → 카메라(`Toy.resize`) → 캔버스 CSS px(`Runtime` 입력) — 변환은 `src/core/viewport.ts`. 화면 크기가 바뀌면 렌더·카메라만 다시 맞추고 장난감 상태(깨진 껍질·프리셋 등)는 그대로, 누르고 있던 손가락만 취소로 끝남
- 검사: `BASE=http://127.0.0.1:4362 node scripts/responsive-check.mjs [--seed N] [--random 24] [--quick]` (dev 서버 필요). 고정 샘플 18개 + seed로 만든 무작위 화면에서 DOM·장난감 상태·실제 CDP 터치로 확인하고, 실패하면 seed와 화면 크기를 출력함. 브라우저 에뮬레이션이라 실제 접힘·힌지·주소창·터치 하드웨어·GPU 성능은 실기기에서 따로 확인해야 함

## 구조

```
src/main.ts              앱 셸: 라우팅, 설정 시트, 오디오 활성화, 장난감 전환
src/core/runtime.ts      단일 WebGL 렌더러, 온디맨드 rAF 루프, 입력 큐, 프레임 측정, 자동 해상도 조절
src/core/audio.ts        Web Audio 엔진: 라운드로빈, 보이스 제한, 리미터, 연속음, 지연 재생 방지
src/core/spring.ts       감쇠 스프링 해석해(프레임레이트 독립) — 두 장난감 공통 물성 원시 요소
src/core/studio.ts       절차적 스튜디오 조명 환경(PMREM)
src/toys/squishy/        말랑이: 접촉 모델(model.ts) + 버텍스 셰이더 변형(material.ts) + 장난감(toy.ts)
src/toys/keyboard/       키보드: 키 모델(model.ts) + 절차적 키캡/케이스(keycap.ts) + 비주얼(visual.ts) + 장난감(toy.ts)
src/audio/keyboardSamples.ts / squishySamples.ts  CC0 실제 녹음 스프라이트 로더 (sfxManifest.ts의 해시 URL로 맵·FLAC 동시 요청)
audio-src/sfx/           효과음 원본 (16-bit WAV 스프라이트 + JSON 맵 + 출처). 제작 스크립트(scripts/kbsamples, scripts/fidgets, scripts/squishy)는 여기에 씀
public/sfx/              생성물 (scripts/audio/pack-sfx.mjs): 무손실 FLAC + 맵, 파일명에 내용 해시. 말랑이 스프라이트는 같은 토이 묶음끼리 쓰는 풀만 모은 조각으로 다시 묶음 — 토이는 자기 조각만 받음
src/audio/sfx.ts         이전 절차적 합성음 (A/B 비교·로드 실패 시 대체용)
scripts/                 shots.mjs(화면·조작 스모크), assets.mjs(썸네일·아이콘 렌더), bench.mjs, render-sfx.mjs
```

## 배포 시 캐시·압축 (호스트 미정 — 2026-11-16 기준 배포 환경 없음)

- 내용 해시가 붙은 파일은 바뀌면 이름이 바뀝니다: `assets/*-<hash>.js|css`, `sfx/**/<이름>.<10자리 hash>.flac|json` → `Cache-Control: public, max-age=31536000, immutable`
- 그 밖(`index.html`, `manifest.webmanifest`, `thumbs/`, `icons/` 등) → `Cache-Control: no-cache` (ETag로 304 재검증)
- gzip/brotli: HTML·JS·CSS·JSON·MD에 켜기. FLAC은 이미 압축돼 있어 압축하지 않아도 됨
- `scripts/bench-load.mjs`의 로컬 서버가 이 정책 그대로 응답합니다(측정 기준).

## 에셋 출처

- 3D 형상·텍스처: 코드로 직접 생성 (썸네일·아이콘은 앱의 실제 3D 렌더 캡처)
- 효과음: Freesound CC0 1.0 실제 녹음을 가공 — 상세 출처·가공 내역은 각 JSON의 `sources`/슬라이스별 `src`
- 개발용 A/B 비교: `lab-sound.html` (합성 A vs 녹음 B, 블라인드 투표) · 앱에서 `?sfx=synth` 로 합성음 강제
