# 신규 6종 로컬 실제 재생 — 2026-11-11

이 기록은 이전 영상 검증의 ‘미확보/pending-audio’ 결론을 **로컬 개발 범위에서 갱신**한다.
소리 없는 목록 UI는 제거했다. 기존 4종과 신규 6종을 실제 앱에서 선택·타건할 수 있다.

## 확보와 변환

- 정확한 제공 영상 `Ia83r5bt62U`(HMX Cheese), `uv47LMQMXn8`(기본형 Magnetic Jade)에 접근 성공.
  yt-dlp 2026.10.26, yt-dlp-ejs 0.8.0, Node 24를 사용했다. 브라우저 쿠키·로그인 우회는 사용하지 않았다.
- YouTube 제공 format 251 Opus/WebM을 `/private/tmp/manzizak-video-verification/audio/`에 저장했다.
  이는 무압축 제작자 master가 아니라 스트리밍 배포본이다.
- FFmpeg 7.1로 48kHz mono PCM 디코딩 후 타건 구간의 RMS 포락선으로 후보 이벤트를 선택했다.
  Cheese는 62–80초에서, Jade는 56–71초에서 각각 200ms 클립 10개를 만들었다.
  클립별 정확한 시각·입력 파일 해시·파형 수치는 [local-audio-manifest.json](./local-audio-manifest.json)에 기록했다.
- 원본을 보존한 채 선형 gain으로 두 새 영상 팩의 최대 피크를 약 0.35로 맞추고 1ms 경계 페이드를 적용했다.
  다른 스위치 음원, 합성음, 피치 변환, EQ로 대체하지 않았다.
- 기존 검토 후보 4종도 보존한 원 파일에서 별도 로컬 WAV+JSON으로 만들었다.
  Oil King CT 7개, Boba U4T CT 17개, Peach V3 CT 14개,
  BOX Jade 팩의 일반 3개 + Space/Enter/Backspace 첫 매핑 구간 3개다.
  K05·K09 CT는 사용자 요청에 따라 기존 검토 화면과 같은 +20dB 보정을 사용한다.
- 결과물은 `/private/tmp/manzizak-local-presets/`의 WAV 6개+JSON 6개다.
  저장소 `public/`에는 복사하지 않았으며 원본·후보 파일도 변경하지 않았다.

## 의미와 품질 제한

- 신규 6종은 `upMode: none`으로 **누를 때 녹음 클립을 재생**한다.
  영상 클립 안에 복귀·인접 타건 잔향이 포함될 수 있다. 독립 키업 녹음이나 키별 모델링이라고 주장하지 않는다.
- Cheese·Magnetic Jade의 실제 녹음 키가 확정되지 않아 Space/Enter/Backspace도 같은 모델의 일반 클립을 사용한다.
  BOX Jade의 전용 구간도 원 팩의 키 매핑을 따른 것이며 독립 실록 키 확인을 추가로 요구한다.
- 자동 이벤트 선택·피크/RMS·비영 신호 및 실제 Web Audio 재생은 확인했다.
  **사람의 청취는 수행하지 않았다.** BGM·음성·다른 소리 혼입 없음이나 감각 태그 부합을 확정하지 않는다.
  이번 결과는 사용자가 직접 누르며 청취·비교할 수 있는 개발 샘플이다.
- 공개 재사용 허락은 여전히 미확인이다. BOX Jade 팩은 Personal use only다.
  공개·상업 배포 승인이나 원 녹음 소유권을 획득한 것으로 해석하지 않는다.

## 앱 연결과 공개 빌드 분리

- `MANZIZAK_LOCAL_AUDIO_DIR`을 명시한 **Vite 개발 서버**에서만 신규 6종을 활성화한다.
  미들웨어는 고정된 6개 ID의 WAV/JSON만 외부 작업 폴더에서 전달한다.
- `build`와 `preview`는 해당 환경변수가 있어도 로컬 모드를 비활성화한다.
  공개 빌드에는 기존 4종만 선택 가능하며 신규 WAV는 포함되지 않는다.
- 로컬 팩은 실패 시 다른 프리셋이나 합성음으로 대체하지 않는다. 로딩/재시도 상태를 버튼에 표시한다.
  누른 상태의 프리셋은 기존 held 상태로 유지한다.
- 새로 선택한 로컬 팩은 자기 음원이 로드된 후 재생한다. 다른 소리로 전환을 감추지 않는다.
  idle에서는 기존 4종만 미리 읽고 신규 6종 전체를 선로딩하지 않는다.
- 기존 4종의 소리 파일·맵·원본 MP3·크레딧은 변경하지 않았다.

## 실행·검증

```sh
cd app
MANZIZAK_LOCAL_AUDIO_DIR=/private/tmp/manzizak-local-presets npm run dev -- --host 127.0.0.1 --port 4353 --strictPort
```

주소: http://127.0.0.1:4353/#/keyboard . 하단 프리셋 줄을 좌우로 밀어 10종을 선택한다.
화면 키·실제 키보드로 타건한다. 원영상 버튼이나 준비 중 목록이 아니라 실제 녹음 버퍼가 재생된다.

재생성: `FFMPEG=<실행파일 경로> python3 scripts/kbsamples/build-local-presets.py`.
입력 경로는 `MANZIZAK_VIDEO_AUDIO_DIR`, `MANZIZAK_REFERENCE_AUDIO_DIR`,
출력은 `MANZIZAK_LOCAL_AUDIO_DIR`로 바꿀 수 있다. 임시 폴더가 정리되면 파일을 다시 준비해야 한다.

검증 명령: `npm test`, `npm run build`, `node scripts/local-keyboard-check.mjs`.
브라우저 검사는 각 신규 팩의 등록 버퍼가 실제 AudioBufferSourceNode.start()에 전달되는지 확인하며,
데스크톱/모바일 입력·연속 타건·기존 4종·전환·실패 시 대체 금지·공개 모드 제외를 포함한다.
타입 검사와 빌드는 성공했다. 기존 번들 크기 경고는 남아 있다.

Push·Merge는 하지 않았다. 이전 미추적 조사 폴더와 다른 워크트리를 보존했다.
