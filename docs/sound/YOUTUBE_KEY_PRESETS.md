# YouTube 키보드 프리셋 3종 (몽돌 · 찌개 · 도자기) — 로컬 전용

| 프리셋 id | 이름 | 영상 | 사용 구간 |
|---|---|---|---|
| `mongdol-pl87w` | 몽돌 (SPM PL87W) | https://www.youtube.com/shorts/BgO3pE7VnI8 (세계 SEGYE, 8초) | 전체 |
| `jjigae-topre` | 찌개 (RealForce R2 Topre EC 30g, Krytox 105) | https://www.youtube.com/watch?v=TTfTCiwA38c (쟈글링-KeyboardHolic, 2시간) | 30~150초 |
| `dojagi-space65` | 도자기 (SPACE65 BSUN RAW) | https://www.youtube.com/watch?v=Ry1DJ2xzg6Q&t=10s (tadadak ASMR, 1시간) | 10~130초 |

프리셋은 코드에 등록돼 있고(키보드 칩, 색상 팔레트, 개발 서버 전용 경로) **음원 파일만 비어 있다**. 자동 다운로드는 YouTube가 막아서(봇 확인) 하지 못했다.

## 음원 넣는 법 (직접 다운로드한 파일 사용)
1. 위 영상의 오디오를 직접 내려받아 `/private/tmp/manzizak-yt-audio/` 에 `mongdol.<확장자>`, `jjigae.<확장자>`, `dojagi.<확장자>` 로 저장한다(ffmpeg가 읽는 형식이면 된다).
2. `cd app && FFMPEG=/path/to/ffmpeg node scripts/kbsamples/build-youtube-presets.mjs`
3. 결과는 `/private/tmp/manzizak-local-presets/<id>.{wav,json}` (git 제외). 개발 서버를 `MANZIZAK_LOCAL_AUDIO_DIR=/private/tmp/manzizak-local-presets` 로 띄우면 키보드 칩에 나타난다.

타건은 파형에서 강하고 고립된 타격을 자동으로 고른다(키다운만, 키업 없음). 청취하지 않았고, 어떤 키를 친 소리인지도 알 수 없다. 영상 권리는 확인되지 않았으므로 서비스 빌드에는 들어가지 않는다(`check-dist` 검사).
