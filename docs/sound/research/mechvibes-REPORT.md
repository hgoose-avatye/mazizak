# Mechvibes 키보드 사운드팩 조사 (Agent A)
조사일 2026-11-10. 모든 팩 라이선스 = "Personal use only"(개인 사용 한정). 상업 이용 명시 허용 없음 -> 앱 번들 배포 불가로 판단. 청취 미검증(전 항목).
접근법: 목록 페이지 ?sort=rating 상위 24개엔 우선 스위치 없음 -> 사이트 검색(?q=) 사용. 상세 URL https://mechvibes.com/sound-packs/<slug>, 다운로드 https://mechvibes.com/api/sound-packs/<mv-id>/download (zip, 로그인 없이 curl 성공).

## 우선 스위치 결과
| 스위치 | 결과 |
|---|---|
| HMX 몽돌 | 미확보 (mongdol/hmx 검색에 없음). 유사: HMX Xinhai |
| 하이무 바다소금 | 미확보. 이름 유사 KTT Sea Salt Lemon은 다른 스위치 |
| Kailh Deep Sea Silent Pro | 미확보 |
| Outemu Silent Peach V3 | 미확보 (peach 검색 0건). 유사: Outemu Red |
| KTT 저소음 바다축 | 미확보 (KTT Sea Salt Lemon 리니어는 있으나 저소음 바다축 아님) |
| Gateron Magnetic Jade | 확보(정확): Gateron Magnetic Jade Pro (HE) |
| GEON Raptor HE | 미확보 (geon/raptor 0건) |

## 다운로드/분석 표 (전부 config.json + 단일 concatenated 오디오 sprite, definition_method=single)
| 스위치 | 팩 | 상세 slug | 파일구성 | 라이선스/제작자 | 분석 | 분류 |
|---|---|---|---|---|---|---|
| Gateron Magnetic Jade Pro (정확) | [NOVIX#56] | novix-56-gateron-magnetic-jade-pro-he | wav 48k/16bit/2ch 4.01s, 21 seg | Personal use / eyynarn | peak 0.0dBFS, RMS -32.5, clip 6샘플 | 추가 확인 필요(라이선스) |
| Gateron Jade (HE, Wooting 80HE) | wooting 80HE gateron jade 70g | wooting-80he-gateron-jade-70g | wav 44.1k/16/2ch 0.70s, 14 seg | Personal use / harcbinger | peak 0.0, RMS -21.6, clip 52샘플 | 유사(Magnetic Jade 계열), 클리핑 |
| HMX Xinhai (유사) | Neo65 with HMX Xinhai | neo65-with-hmx-xinhai-switches | wav 48k/16/2ch 1.39s | Personal use / liriq_prod | peak -0.3, RMS -31.0, clip 0 | 유사/대체 |
| KTT Sea Salt Lemon (유사) | KTT Sea Salt | ktt-sea-salt | wav 44.1k 2.93s | Personal use / Deleted User(디스코드 아카이브) | peak -16.6, RMS -49.1 (매우 작음) | 유사/대체 |
| Outemu Red (유사) | RK61 Outemu Reds | rk61-outemu-reds | wav 48k 2.59s | Personal use / a_lep | peak -6.6, RMS -35.4, clip 0 | 유사/대체 |
| Cherry MX Silent Red (저소음 유사) | CherryMX RED SILENT | cherrymx-red-silent-by-not-again | sound.ogg (Vorbis 44.1k stereo, 166KB) | Personal use / abo_rfeeq | wave 분석 불가(ogg), 미분석 | 유사/추가 확인 |
| Silent Alpaca V2 (저소음 유사) | Silent Alpacas V2 | silent-alpacas-v2-smolpp | wav 44.1k 2.38s | Personal use / kyo.1069 | peak -32.7, RMS -57.0 (매우 작음), 선행무음 최대 810ms | 유사/대체 |
| Topre 55g (저소음 유사) | Silent Topres | silent-topres-smolpp | wav 44.1k 2.12s | Personal use / kyo.1069 | peak -11.5, RMS -40.9 | 유사/대체 |
| ROG HFX Magnetic | NOVIX#57 | novix-57-rog-hfx-magnetic-switches | wav 48k 3.96s | Personal use / eyynarn | peak -1.1, RMS -33.8 | 유사(자석축) |
| IQUNIX Moonstone | NOVIX#58 | novix-58-iqunix-moonstone-switches | wav 48k 4.78s | Personal use / eyynarn | peak 0.0, clip 4샘플 | 참고 |
| RK Red | Coral Sea | coral-sea | wav 44.1k 2.00s | Personal use | peak -17.9, RMS -41.8 | 참고 |
| Epomaker Creamy Jade | epomaker-creamy-jade | audio.mp3 (80kbps), 미분석 | Personal use / cpso | 참고 |

저장 위치: scratchpad/mechvibes/<slug>/ (pack.zip + x/ 압축해제). 분석 스크립트: scratchpad/tools/ (an.py, meta.py, fetch.sh).

## 한계
- 청취 불가: 음색 검증 전무. 수치는 피크/RMS/클리핑뿐.
- LUFS/ebur128 미측정(ffmpeg 없음), 피크·RMS(전체 sprite 평균, 무음 포함)만. ogg/mp3 미분석.
- 세그먼트별 수치는 timing을 [start,duration(ms)]로 가정한 값이라 일부 팩(예: Cherry silent red는 [start,end] 형태로 보임) 부정확 가능 -> 전체 파일 수치만 신뢰.
- 검색(?q=)은 부분 일치지만 완전 보장 안 됨; 한글/별칭 검색(몽돌 등) 0건. 1,026개 전체 열거 안 함.
- 라이선스는 전부 개인 사용 한정이라, 상업 앱 번들엔 제작자 별도 허락 필요. (사이트: 제작자가 claim하여 라이선스 변경 가능)
