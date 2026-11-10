# 프리셋 확장 설계 (제안, 미구현)

## 현재 구조 (읽은 코드 기준)
- `KeySwitchPreset = 'pebble' | 'clack'` 유니온 타입 (app/src/audio/sfx.ts:11), `KEY_PRESET_INFO`로 라벨 (toy.ts:13).
- 프리셋 = WAV 스프라이트 1개 + JSON(entries: down/up/spaceDown/spaceUp, offset/duration/gain). `loadKeyboardSamples`가 fetch → decode → 슬라이스한 AudioBuffer를 (ctx, base+preset) 키로 캐시, 실패 시 캐시 제거(재시도 가능).
- toy.ts: `ensurePreset`이 먼저 합성음(`buildKeyboardSounds`)을 등록하고, 샘플이 로드되면 교체, 실패하면 `console.warn` 후 합성음 유지. 키 누름 시 `heldPreset`으로 up을 같은 프리셋으로 맞춤. 따라서 **로딩 실패 폴백과 전환 중 키업 일관성은 이미 있음**.
- `soundSource[preset]==='samples'`일 때 makeup gain 6.

## 제안
1. **프리셋 등록 방식**: 유니온 타입 대신 레지스트리(`PRESETS: Record<string, PresetMeta>`)로 변경하고 id는 `string`. 메타 = {label, desc, spriteBase, kind: 'sprite'|'synth', category, license}. 카탈로그 JSON(switch-catalog.json)에서 `asset-ready` 항목만 런타임에 노출. 합성 폴백 파라미터는 프리셋별 `fallback: 'pebble'|'clack'`(가장 가까운 기존 프리셋)으로 지정. 현재 `buildKeyboardSounds`는 2개 하드코딩이므로 확장 시 이 부분만 `fallback`으로 위임.
2. **OGG/WAV 로딩**: `decodeAudioData`는 파일 형식을 감지하므로 스프라이트의 `file` 확장자만 `.wav/.ogg`로 허용하면 로더 변경 없음. 단 Safari는 Vorbis OGG 디코딩 지원이 15.4 미만에서 제한 → **iOS 대응 때문에 빌드 단계에서 WAV(또는 AAC/m4a)로 변환한 스프라이트를 배포**하는 것을 권장(My Sound Pack은 총 25KB, WAV 변환해도 약 0.1MB 이하).
3. **키별 매핑**: 현재는 role 4종(down/up/spaceDown/spaceUp) 풀 + 라운드로빈. 키별 정의(Mechvibes 방식)는 두지 말고 빌드 스크립트에서 role 풀로 압축. 확장하려면 entries에 선택적 `keys: string[]` 힌트(예: Enter/Backspace/Shift) 추가를 후순위로.
4. **전환 지연 방지**: 프리셋 시트를 열 때 현재 프리셋 인접/즐겨찾기 1~2개를 `requestIdleCallback`으로 `loadKeyboardSamples` 선로딩. 전환 시 로딩 중이면 기존 소리를 유지하거나 폴백 합성음 즉시 재생(현 동작 유지).
5. **로딩 실패 처리**: 현 동작 유지(합성 폴백 + 캐시 제거로 재시도). 추가로 JSON 스키마 검증(`down`이 비었으면 throw — 이미 있음)과 디코드 실패 시 1회 재시도, 실패 프리셋은 목록에서 비활성 표시 제안.
6. **메모리 관리**: 프리셋당 슬라이스 AudioBuffer 약 25~30개 × ~0.1초 × 48kHz × 4바이트 ≈ 0.5~1MB. 10개 프리셋도 10MB 이내라 문제 없음. 단 WeakMap 캐시가 ctx 수명 동안 유지되므로 **LRU(최근 3~4개)로 캐시를 제한**하고 현재 눌린 키가 쓰는 프리셋(heldPreset)은 제거 금지.
7. **라이선스 게이트**: 카탈로그 `asset.license`가 재사용 가능으로 확인되지 않은 항목은 레지스트리에 올리지 않는다(빌드 스크립트에서 검사).

## 최소 구현 작업 (My Sound Pack 연결 기준)
1. 빌드 스크립트: OGG 5개를 입력으로 스프라이트 WAV + JSON 생성 (기존 `scripts/kbsamples/build.mjs` 입력만 교체 가능한지 확인 필요, 미확인).
2. 음량 정규화 후 down 풀 구성(아래 분석 참고).
3. 타입 확장 `KeySwitchPreset` + `KEY_PRESET_INFO` 항목 1개 + 합성 폴백 지정.
4. CREDITS.md에 Chevy / CC BY 4.0 출처 표기 추가(필수).

---

## 구현 결과 (feat/creamy-thocky, 2026-11-10)

위 제안 중 **변경 범위가 작은 부분만** 구현했다. 전체 문자열 레지스트리 전환은 하지 않았다.

| 항목 | 결과 |
|---|---|
| 프리셋 id 타입 | `KeySwitchPreset`(pebble/clack, sfx.ts)은 **그대로** 두고, `src/audio/keyPresets.ts`에 `KeyPresetId = KeySwitchPreset \| 'creamy-thocky'`, `SYNTH_BASE`(합성 폴백 대상), `VISUAL_STYLE`(키 외형) 추가. sfx.ts·기존 테스트 무변경 |
| 새 프리셋 추가 절차 | ① `public/sfx/keyboard/<id>.wav+json` ② `keyPresets.ts`에 id 1줄 + 폴백/외형 2줄 ③ `KEY_PRESET_INFO`에 라벨 ④ CREDITS.md. UI 칩은 `KEY_PRESET_INFO` 순회라 자동 |
| 로딩 실패 | 기존 동작 유지(합성음 폴백, 캐시 제거로 재시도). creamy는 `SYNTH_BASE`=pebble 합성음(키업 포함)으로 대체 |
| 전환 중 무음 | 기존 `audible()`(로딩 중엔 직전 프리셋 소리 유지) 유지. 추가로 idle 시 다른 프리셋을 선로딩 |
| 키업 없는 프리셋 | 맵의 `upMode: "none"` → `up/spaceUp`을 key-down 소리로 대체하지 않고 비워 둠. 토이는 빈 풀을 등록하지 않아 `audio.play()`가 null을 반환(무음) |
| 알 수 없는 저장 id | 설정에 저장된 id가 `KEY_PRESET_INFO`에 없으면 pebble로 대체 |
| 포맷 | 스프라이트는 16-bit mono 48 kHz WAV(기존과 동일). OGG는 빌드 단계에서 WAV로 변환(iOS Safari 호환) |
| 미구현 | LRU 캐시 제한, 전용 외형 스타일, 키별 매핑 힌트, 앱 내 크레딧 화면 |

### 다음 프리셋 확장 시 재사용 가능한 부분
- `loadKeyboardSamples`(스프라이트 + JSON, 슬라이스, 캐시, 실패 시 재시도)와 `upMode`
- `build-creamy.mjs`의 trim / 페이드 / 피크 정규화 / RMS 맞춤 / 스프라이트 생성(다른 팩 입력으로 재사용 가능)
- `scripts/creamy-check.mjs`의 Chrome 모바일 검증(프리셋 id만 바꿔서 재사용)
- `test/creamyThocky.test.ts`(포맷·레벨·맵 일관성·로더·폴백)
