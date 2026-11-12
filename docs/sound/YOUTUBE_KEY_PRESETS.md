# YouTube 키보드 프리셋 3종 (몽돌 · 찌개 · 도자기) — 로컬 전용

| 프리셋 id | 이름 | 영상 | 사용 구간 |
|---|---|---|---|
| `mongdol-pl87w` | 몽돌 (SPM PL87W) | https://www.youtube.com/shorts/BgO3pE7VnI8 (세계 SEGYE, 8초) | 전체 |
| `jjigae-topre` | 찌개 (RealForce R2 Topre EC 30g, Krytox 105) | https://www.youtube.com/watch?v=TTfTCiwA38c (쟈글링-KeyboardHolic, 2시간, "No Talking"; 같은 녹음이 약 5분 주기로 반복됨) | 30~1735초 |
| `dojagi-space65` | 도자기 (SPACE65 BSUN RAW) | https://www.youtube.com/watch?v=Ry1DJ2xzg6Q&t=10s (tadadak ASMR, 1시간) | 10~130초 |

상태(2026-11-12): 세 영상의 필요한 구간만 공식 `yt-dlp`(PyPI 2026.10.26, `uv` 가상환경, JS 런타임은 설치된 Node.js `--js-runtimes node`)로 받아 `/private/tmp/manzizak-yt-audio/` 에 두고 아래 스크립트로 빌드했다. 몽돌 7타, 찌개 16타, 도자기 16타. 다른 스위치 음원은 쓰지 않는다(음원이 없으면 무음).

```
yt-dlp --js-runtimes node -f bestaudio --download-sections "*0-600" -o "p1.%(ext)s" https://www.youtube.com/watch?v=TTfTCiwA38c
yt-dlp --js-runtimes node -f bestaudio --download-sections "*600-1200" -o "p2.%(ext)s" https://www.youtube.com/watch?v=TTfTCiwA38c
ffmpeg -f concat -safe 0 -i list.txt -ac 1 -ar 48000 jjigae.wav   # list.txt: p1, p2 (YouTube serves this video at ~36 KB/s: 10-minute pieces)
yt-dlp --js-runtimes node -f bestaudio --download-sections "*0-140" -o "dojagi.%(ext)s" https://www.youtube.com/watch?v=Ry1DJ2xzg6Q
yt-dlp --js-runtimes node -f bestaudio -o "mongdol.%(ext)s" https://www.youtube.com/shorts/BgO3pE7VnI8
```

품질 게이트(객관 수치만, 청취 미검증): 원본 클리핑·파일 끝 잘림·두 번째 타격(−12 dB 이상)·타격 직전 배경(−28 dB 초과)·과도한 증폭(+20 dB 초과)·감쇠 없음을 제외하고, 가장 큰 타격이 아니라 **중앙값에 가까운 전형적인 타격**을 고른다. 빠른 타건 영상 몽돌(8초 Shorts)은 주변 타건이 깔려 있어 배경 −18 dB·감쇠 −20 dB 기준을 쓰고, 찌개는 처음 기준(−18 dB)에서 주변 타건 잡음이 들려(청취 의견 2026-11-12) 20분 구간에서 엄격 기준(배경 −30 dB·감쇠 −30 dB·두 번째 타격 −15 dB)으로 다시 골랐다. 이어 "지속적인 히스" 의견에 따라 찌개만: 클립을 히스 +6 dB 지점에서 끝내고(−40 dB 기준은 히스보다 아래라 220 ms 끝까지 히스 꼬리가 붙었음), 히스 근처 구간만 2:1로 낮추는 완만한 익스팬더를 걸고, 히스 대비 38 dB 미만 타격과 끝까지 울리는(−24 dB 초과) 타격을 뺐다. 영상이 같은 녹음을 반복해 같은 타격이 여러 번 뽑혀서, 파형 상관 0.9 초과는 중복으로 제외한다(찌개 10타, 도자기 중복 2개 교체). 이후 "누를 때마다 아주 짧은 히스" 의견: 이 소리는 녹음의 정상 히스보다 약 20 dB 커서(타격 꼬리의 고역 — 방 울림이나 증폭된 코덱 잡음) 스펙트럼 차감으로는 줄지 않았다. 그래서 찌개는 타격 첫 8 ms를 그대로 두고 그 뒤 2.5 kHz 이상만 빠르게(τ 5 ms, −26 dB까지) 줄인다. 타격 뒤 6 kHz 이상 에너지 −22.2 → −31.7 dB, 저역 몸통은 유지. 클립은 히스 +12 dB에서 끝나고 45 ms 미만은 제외(9타). 도자기(세라믹 키캡)는 10 ms 안팎으로 끝나는 날카로운 소리가 정상이라 짧은 감쇠를 허용한다. 클립별 수치는 각 JSON의 `qc` 에 있다.

## 음원 넣는 법 (직접 다운로드한 파일 사용)
1. 위 영상의 오디오를 직접 내려받아 `/private/tmp/manzizak-yt-audio/` 에 `mongdol.<확장자>`, `jjigae.<확장자>`, `dojagi.<확장자>` 로 저장한다(ffmpeg가 읽는 형식이면 된다).
2. `cd app && FFMPEG=/path/to/ffmpeg node scripts/kbsamples/build-youtube-presets.mjs`
3. 결과는 `/private/tmp/manzizak-local-presets/<id>.{wav,json}` (git 제외). 개발 서버를 `MANZIZAK_LOCAL_AUDIO_DIR=/private/tmp/manzizak-local-presets` 로 띄우면 키보드 칩에 나타난다.

타건은 파형에서 강하고 고립된 타격을 자동으로 고른다(키다운만, 키업 없음). 청취하지 않았고, 어떤 키를 친 소리인지도 알 수 없다. 영상 권리는 확인되지 않았으므로 서비스 빌드에는 들어가지 않는다(`check-dist` 검사).
