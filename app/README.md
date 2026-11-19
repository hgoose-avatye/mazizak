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
- 설정 시트: 소리·볼륨·진동(Android)·화질(자동/고화질/절약)·움직임 줄이기·성능 정보
- `audio-test.html`: 모바일 오디오 활성화(pointerdown/pointerup/touchstart) 실기기 검증 도구

## 앱인토스 · 광고 (src/ads)

- **처음 뜨는 장난감은 무료(횟수 제외)**, 그 뒤로 다른 종류(서랍 카드 하나 = 피짓 1개 또는 키보드 프리셋 1개)를 고를 때마다 오늘의 무료 3회에서 1회씩 차감(전에 봤던 종류로 돌아가도 차감, 고를 때마다 "남은 무료 N/3회" 알림, 서랍에 "오늘 무료 N회"). 다 쓰면 고를 때마다 "광고 보고 열기" 시트 → 보상형 광고를 끝까지 보면(`userEarnedReward`) 그 방문만 열림. 날짜가 바뀌면 다시 3회. 숫자는 `src/ads/gate.ts`의 `GATE_CONFIG`(`freePerDay`, `unlockSwitches`)
- 정책(toss/apps-in-toss-examples · in-app-ads): 광고는 사용자가 버튼을 누를 때만, 앱 진입·링크로 들어올 때는 광고 없이 열려 있는 종류를 보여 줌. 광고가 없으면(재고 없음·오프라인) 그냥 열어 줌 — 광고 때문에 막히는 화면 없음
- 광고 SDK(`@apps-in-toss/web-framework`)는 첫 장난감이 뜬 뒤에 받고, 광고도 미리 불러 둠. 토스 앱 밖(일반 브라우저)에서는 광고가 지원되지 않아 잠금 없이 모두 열림
- 브라우저 확인: 개발 서버(`npm run dev`)를 사람이 열면 가짜 광고가 기본으로 켜짐(`?ads=off`로 끔, 자동 검사 브라우저는 꺼짐) · `?ads=mock`(가짜 동영상 광고: 캔버스 애니메이션 15초, 5초 뒤 건너뛰기 = 보상 없음, 끝까지 = 보상 · 짧게: `&adsec=3&adskip=1`) · `?ads=mock-fail`(광고 없음) · `BASE=http://127.0.0.1:<port> node scripts/ad-gate-check.mjs`
- 토스 상단: 토스는 페이지 오른쪽 위에 캡슐(⋯ ✕)을 겹쳐 그림 → 토스 빌드(`vite build --mode toss`, `<html data-platform="toss">`)에서만 `--safe-t` = 상태바(`SafeArea.get().top`, `src/core/tossShell.ts`) + **62px**. 웹 빌드는 그대로(0). 56px은 가로 화면에서 서랍 '접기' 버튼이 캡슐(✕)과 2px까지 붙어서 쓰지 않음(style.css 주석). Android 뒤로가기: 열린 시트 닫기 → 없으면 미니앱 닫기. 브라우저 미리보기: `?platform=toss&aitTop=47`, 검사: `QUERY='?platform=toss&aitTop=47' BASE=… node scripts/responsive-check.mjs`
- 빌드: `npm run build:ait` → `manzizak.ait` (설정: `apps-in-toss.config.ts`, `appName`은 콘솔 등록 이름으로 바꿔야 함). **실제 광고 그룹 ID는 `VITE_AIT_REWARDED_AD_ID=<콘솔에서 받은 ID> npm run build:ait`** — 없으면 토스 테스트 ID(`ait-ad-test-rewarded-id`)가 들어가므로 출시 빌드에 쓰면 안 됨

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
