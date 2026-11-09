# 만지작 MANZIZAK — MVP (v0.1)

모바일 웹 실사형 3D 피젯 장난감. 말랑이(젤리형/TPR)와 9키+스페이스 키보드.

## 실행

```bash
cd app
npm install
npm run dev            # http://localhost:4319 (vite --host → 같은 Wi-Fi 휴대폰에서 http://<Mac IP>:4319)
npm run build && npm run preview   # 프로덕션 빌드 확인
npm test               # 단위 테스트 (스프링·모델·키캡 지오메트리·효과음)
```

휴대폰 테스트: Mac과 같은 Wi-Fi에서 `http://<Mac의 IP>:4319` 접속. (`ipconfig getifaddr en0`)

## 화면

- `#/` 홈: 장난감 선택 카드(실제 3D 렌더 썸네일)
- `#/squishy` 말랑이(슬로우 라이징 폼): 누르면 즉시 들어가고, 놓으면 자국이 잠시 남았다가 1.4~3초에 걸쳐 천천히 복원(반동 없음) · 끌기 · 두 손가락 늘리기 · 색상 4종 · 초기화
- `#/keyboard` 키보드: 9키+스페이스, 동시 입력, 누른 위치에 따른 미세 기울기, 프리셋 조약돌/까랑까랑, 물리 키보드(QWE/ASD/ZXC/Space)
- 설정 시트: 소리·볼륨·진동(Android)·화질(자동/고화질/절약)·움직임 줄이기·성능 정보
- `audio-test.html`: 모바일 오디오 활성화(pointerdown/pointerup/touchstart) 실기기 검증 도구

## 구조

```
src/main.ts              앱 셸: 라우팅, 설정 시트, 오디오 활성화, 장난감 전환
src/core/runtime.ts      단일 WebGL 렌더러, 온디맨드 rAF 루프, 입력 큐, 프레임 측정, 자동 해상도 조절
src/core/audio.ts        Web Audio 엔진: 라운드로빈, 보이스 제한, 리미터, 연속음, 지연 재생 방지
src/core/spring.ts       감쇠 스프링 해석해(프레임레이트 독립) — 두 장난감 공통 물성 원시 요소
src/core/studio.ts       절차적 스튜디오 조명 환경(PMREM)
src/toys/squishy/        말랑이: 접촉 모델(model.ts) + 버텍스 셰이더 변형(material.ts) + 장난감(toy.ts)
src/toys/keyboard/       키보드: 키 모델(model.ts) + 절차적 키캡/케이스(keycap.ts) + 비주얼(visual.ts) + 장난감(toy.ts)
src/audio/keyboardSamples.ts / squishySamples.ts  CC0 실제 녹음 스프라이트 로더 (public/sfx/*)
src/audio/sfx.ts         이전 절차적 합성음 (A/B 비교·로드 실패 시 대체용)
scripts/                 shots.mjs(화면·조작 스모크), assets.mjs(썸네일·아이콘 렌더), bench.mjs, render-sfx.mjs
```

## 에셋 출처

- 3D 형상·텍스처: 코드로 직접 생성 (썸네일·아이콘은 앱의 실제 3D 렌더 캡처)
- 효과음: Freesound CC0 1.0 실제 녹음을 가공 — 상세 출처·가공 내역은 `public/sfx/keyboard/CREDITS.md`, `public/sfx/squishy/CREDITS.md`, 각 JSON의 `sources`/슬라이스별 `src`
- 개발용 A/B 비교: `lab-sound.html` (합성 A vs 녹음 B, 블라인드 투표) · 앱에서 `?sfx=synth` 로 합성음 강제
