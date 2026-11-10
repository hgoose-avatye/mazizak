# My Sound Pack 분석 및 creamy-thocky 프리셋 (2026-11-10)

- 원본: https://mechvibes.com/sound-packs/my-sound-pack-5 — 제작자 Chevy, 표시 라이선스 CC BY 4.0, 다운로드 283회(조사 시점)
- 프리셋: `creamy-thocky` ("크리미"). 특정 스위치 모델이 아닌 독립 Creamy/Thocky ASMR 프리셋
- **청취 검증 없음.** 아래 수치는 파일 분석값이고, 음색·키 역할은 모두 추정/미검증이다.
- 분석 도구: ffmpeg 7.1(격리 virtualenv의 imageio-ffmpeg 정적 빌드). 원본 OGG는 `app/scripts/kbsamples/source/creamy-thocky/`에 그대로 보존

## 파일 구성
`config.json`(multi, 정의 87키) + OGG 5개(Vorbis 48 kHz 모노, 각 5~6 KB, 총 25 KB). 5개 모두 한 번의 키 입력 길이(0.16~0.24 s).

## 정규화 전후 (build-creamy.mjs)
| 클립 | 원본 길이 | 원본 피크 | 원본 RMS | 증폭 | 처리 후 길이 | 처리 후 피크(gain 적용) | 처리 후 RMS(전체 클립) | 맵 gain |
|---|---|---|---|---|---|---|---|---|
| OtherKeys | 0.157 s | −21.7 dBFS | −45.6 | +20.7 dB | 135 ms | −3.4 | −26.6 | 0.760 |
| 2 | 0.184 s | −4.0 | −25.5 | +3.0 dB | 156 ms | −5.9 | −26.6 | 0.568 |
| BackSpace | 0.198 s | −22.1 | −48.6 | +21.1 dB | 162 ms | −1.0 | −26.6 | 1.000 |
| Shift | 0.236 s | −22.2 | −46.9 | +21.2 dB | 148 ms | −4.0 | −26.6 | 0.711 |
| Space | 0.228 s | −25.0 | −48.2 | +24.0 dB | 169 ms | −4.7 | −26.6 | 0.655 |

- 원본 편차: `2.ogg`만 피크 −4 dBFS이고 나머지 4개는 −22~−25 dBFS(약 18~21 dB 작음). 클리핑(0 dBFS 근처) 없음.
- 처리: 스프라이트 안에서 클립별 피크 −1 dBFS 정규화 → 맵 gain(≤1)으로 RMS를 같게 맞춤. 최대 증폭 +24 dB(스크립트 상한 +26 dB). 무음 구간 잡음은 피크 대비 약 −63 dB 이하(증폭 후에도 −64 dBFS 안팎).
- 무음 제거: 피크 −45 dB 미만의 앞부분, −50 dB 미만의 뒷부분만 제거. BackSpace는 큰 타격 전에 피크 대비 −30~−40 dB의 약한 구간이 약 80 ms 있으나 **보존**(키 입력의 일부인지 잡음인지 청취 없이 판단 불가). Shift는 앞 30 ms 무음 제거.
- 클립 안에 피크 대비 −12~−9 dB 수준의 강한 타격이 **2~3번**(약 80~110 ms 간격) 있다. 키다운+키업일 수 있으나 **미확인** → 분할하지 않고 통째로 key-down에 사용, 키업 소리는 없음.

## config.json 키 매핑 (사용하지 않음)
| 키 | 원본 config가 지정한 클립 |
|---|---|
| 81개 기본 키 | OtherKeys |
| Space | **Shift** |
| ShiftLeft / ShiftRight | Shift |
| **Escape** | **Space** |
| Digit2 | 2 |
| Backspace | BackSpace |

Space 키가 `Shift.ogg`, Escape 키가 `Space.ogg`를 쓴다 → 역할이 바뀌어 보인다. 파형 특성(스펙트럼 무게중심)으로 보면 `Space.ogg`(≈700 Hz, 600 Hz 이하 비중 0.58)는 `OtherKeys.ogg`(≈700 Hz, 0.59)와 비슷하고 `Shift.ogg`(≈810 Hz, 0.13)와 다르다. **그러나 파형만으로 스페이스바/시프트 역할을 판정할 수 없고 청취 검증을 못 했으므로 재배치하지 않았다.** 5개 클립을 모두 일반 key-down 풀로 사용하고, spaceDown은 비워 down 풀로 대체한다. → **미검증: 스페이스바 전용 소리 지정은 청취 후 결정**.

## 기존 조약돌·까랑까랑과 비교 (앞 약 85 ms, 근사 수치)
| 프리셋 | down 길이 | 피크 | RMS | 스펙트럼 무게중심 | 600 Hz 이하 비중 |
|---|---|---|---|---|---|
| pebble | 0.098 s | −1.0 | −25.4 | 약 690 Hz | 0.76 |
| clack | 0.091 s | −1.0 | −20.8 | 약 1660 Hz | 0.17 |
| creamy-thocky(원본 5개) | 0.16~0.24 s | −4.0 ~ −25.0 | −25.5 ~ −48.6 | 약 700~1300 Hz | 0.13~0.59 |

수치상 pebble에 가깝거나 약간 밝은 중간 영역. 클립이 2배쯤 길다. 처리 후 RMS(−26.6)는 pebble down(−25.4)과 비슷한 수준. 음색 차이는 **추정**이다.

## 검증 요약
단위 테스트 101개 통과(creamy 전용 신규 테스트 포함), `tsc` 통과, `vite build` 통과, Chrome 모바일 에뮬레이션 `scripts/creamy-check.mjs` 18개 항목 통과(기존 `scripts/kb-defects-check.mjs`도 통과). 실기기·청취는 미검증.
