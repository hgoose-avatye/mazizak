# MANZIZAK YouTube 레퍼런스 조사 (재개)

방법: YouTube oembed(채널명)와 영상 페이지 HTML의 설명란, YouTube 검색 결과 페이지를 curl로 읽음. 영상 재생·청취는 하지 못함. 따라서 **모든 항목 청취 검증 = 미수행**.
라이선스: 아래 영상 전부 페이지에 "Creative Commons" 표기가 없음 → 표준 YouTube 라이선스로 간주(재사용 불가, 제작자 허락 필요).

## 최우선 7종

| # | 스위치 | 영상 | 채널 | 구간 | 개별 키 | 녹음 환경(설명란) | 사용 조건 | 분류 |
|---|---|---|---|---|---|---|---|---|
| 1 | HMX 몽돌 | 미확정. 후보: https://www.youtube.com/watch?v=qOmN5o-7g3w (SPM PL87C 몽돌+HMX 은행나무, 2:37, 키노리보드 ASMR) / https://www.youtube.com/watch?v=szEPz97KJj4 (몽돌 vs 몽돌 화이트, 02:47 몽돌 타건, 03:23 화이트 타건, 지니뿡) | 키노리보드 ASMR / 지니뿡 JINIBBUNG | 미확인 / 02:47·03:23 (설명란 타임라인) | 미확인 | 미기재. 완제품 키보드(PL87W/C) 소리라 스위치 단독 아님 | 표준 YouTube | 추가 확인 필요 |
| 2 | 하이무 바다소금축 | https://www.youtube.com/watch?v=_QNwpS0q5xA (저소음 7종 리뷰 ep.05) | 주연 ZUYONI | 01:53 확인(설명란 챕터). 00:55 타건 워밍업 | 미확인 | 미기재 | 설명란: "영리 목적 사용 불가, 비영리도 출처·링크 필수" | 상업 불가 → 허락 필요 |
| 3 | Kailh Deep Sea Silent Pro | Whale: https://www.youtube.com/watch?v=pYUDDoI6XJ4 (Click and Thock, 4:58) / Islet: https://www.youtube.com/watch?v=8IZss-tv6cg (키킨 KeyKIN, 쇼츠 1:00, Aula F75) | Click and Thock / 키킨 | Whale: 타건+slow bottom-out 테스트 (챕터 없음) / Islet: 쇼츠 | Whale: slow bottom-out 있음 | Shure SM57, DZ60 + Tofu60 알루미늄, FR4 플레이트, GMK/MT3/SA | 표준 YouTube. 제품 링크 제휴 | 추가 확인 필요 |
| 4 | Outemu Silent Peach V3 | https://www.youtube.com/watch?v=IvxGnt47JFE (4:52) | Click and Thock | 사용자 제공 타임코드 01:33~03:45(GMK/MT3/SA 타건+개별 키) 미재확인. 설명란에 챕터 없음 | 있음(설명란: typing + slow bottom-out) | SM57, DZ60+Tofu60, FR4, 데시벨 측정 포함 | 표준 YouTube | 추가 확인 필요 |
| 5 | KTT 저소음 바다축 | 2번과 동일 영상 | 주연 ZUYONI | 05:23 확인 | 미확인 | 미기재 | 2번과 동일 | 상업 불가 → 허락 필요 |
| 6 | Gateron Magnetic Jade | https://www.youtube.com/watch?v=t2AKW1ROnew (1:04) | Wasabi | 전체 | 미확인 | 미기재 | 표준 YouTube | 추가 확인 필요 |
| 7 | GEON Raptor HE | 후보: https://www.youtube.com/watch?v=6Gx6wjqEtUs (1:41, ManbUwU, V1+L60 스템, Tofu60 Redux/Wooting60HE/PC/PBT, iPhone11), https://www.youtube.com/watch?v=bF7TELBSyWc (Wasabi, V2), https://www.youtube.com/watch?v=sHDzte8wt_o | ManbUwU 외 | 미확인 | 미확인 | 6Gx6wjqEtUs는 설명란에 기재(iPhone11 마이크) | 표준 YouTube | 추가 확인 필요 |

### 정정 사항
- 하이무 바다소금축 영상의 02:41 항목은 "SPM x HMX **목새**축"(택타일)이며 **몽돌축이 아님**. 몽돌은 이 영상에 없음.
- Kailh Deep Sea Silent Pro는 **Whale**(pYUDDoI6XJ4, 택타일)과 **Islet**(8IZss-tv6cg, 리니어)이 서로 다른 제품. 어느 쪽이 MANZIZAK 대상인지 결정 필요. Silent Pro 리니어 → Islet.
- 키킨 영상 제목의 "Box Islet Linear"로 모델명 확인, 설명란은 쇼츠 1분.

## 허가 상태 요약
- 7종 전부 재사용 허가 확인된 영상 없음. 게임용 파일 준비는 하지 않음(지시 7번 조건 미충족).
- 현 시점 "재사용 가능"으로 확인된 것은 Mechvibes **My Sound Pack (Chevy)** 뿐(아래).

## 사운드팩 추가 대상: My Sound Pack
- URL: https://mechvibes.com/sound-packs/my-sound-pack-5
- 제작자 Chevy, **CC BY 4.0**(출처 표기 필요, 상업 이용 가능), 설명 "Creamy and Thocky", asmr 태그
- 다운로드: https://mechvibes.com/api/sound-packs/mv-2263bade9c724dd98ef92e743a6303b2/download (로그인 불필요, 25KB)
- 구성: config.json(multi, 정의 87개 키) + 2.ogg, Shift.ogg, BackSpace.ogg, OtherKeys.ogg, Space.ogg (각 5~6KB)
- 사본: scratchpad/msp5/x/ (게임 에셋 미변경)
- 한계: ogg 디코더(ffmpeg/numpy/soundfile)가 없어 길이·음량·클리핑 **미분석**. 청취 미검증. 원 스위치명 미기재 → 어떤 스위치 소리인지 불명(스위치로 표기 금지). CC BY 표기이므로 출처 표기 문구 필요(Chevy, Mechvibes).
- 조약돌·까랑까랑 프리셋과 별도 프리셋으로 유지.

## 25종 확장 가능성 (YouTube 검색 가능 여부만 확인, 영상 내용은 미확인)
검색 상위에 실제 영상 존재 확인(제목 기준).
| 스위치 | 후보 영상 (채널, 길이) |
|---|---|
| Gateron Oil King | -A_M_hvjVNY (Click and Thock, 4:49, GMK/MT3/SA 구성) |
| Cherry MX Red | e3kG6ei5ClY (Mattie K.B., Red vs Silent Red sound only 2:21) |
| Cherry MX Brown | BSgTht9_C9c (QwwER, 0:55) |
| Cherry MX Blue | gCuG3WCCwvs (パソ活, 19:03 타이핑) |
| Cherry MX Silent Red | -_ro-vwtXsE (The Gaming Setup, 0:36), e3kG6ei5ClY |
| Kailh BOX White | hlCjITJI02Q (Click and Thock, 3:17) |
| Razer Green | 9tRTWHBrmFY (KiryaChainik, 3:26) |
| Holy Panda | 5PseHc6UpFM (PaperAcrobat, 9:41) |
| Banana | rIfp5Ot-7kE (The Keyboard Kid, 0:40) |
| Outemu Blue | LDX-R5aSrZo (SpotlessMLG, 1:05) |
| Wooting Lekker | R_THxrvomN4 (Wooting 공식, 2:59), wYACSlhQg9E (Wooting 공식 80HE, Raw HE·Jade·Lekker V2 비교 6:33) |
| Razer Analog | Mjn77pf7Krk (Futurologeek, 0:59) |
| HMX 몽돌 계열 | 위 표 참조 |
미조사: 키위치/레오폴드 개량 리니어, Silent Lime, Kailh BOX Tactile, Kailh BOX Blue 후보, KTT Silent Sea/White(주연 영상의 "80 Retros X KTT 화이트축" 07:16이 후보), Outemu/DrunkDeer HE, Aqua Panda. 25종 목록의 중복(Silent Lime이 Tactile·Silent 양쪽, HMX 몽돌·하이무가 Linear·최우선 양쪽, Kailh Deep Sea·Outemu Silent Peach 등)을 정리하면 고유 항목은 약 22~23종.

## 장난감 5종
이번 조사에서는 미착수(스위치 우선 지시). 말랑이/슬랑이/왁뿌볼/크런치/음식형은 다음 단계.

## 한계
- 영상 청취 불가, 타임코드의 내용(음성·BGM 유무)은 확인하지 못함. 주연 영상 엔딩곡 있음(BGM 가능성, 챕터 사이 구간 확인 필요).
- 제작자 페이지의 라이선스 필드는 HTML 검색 결과에 "Creative Commons" 문자열이 없다는 점으로만 판단.
- 영상 오디오 다운로드는 하지 않음(허가 미확인).
