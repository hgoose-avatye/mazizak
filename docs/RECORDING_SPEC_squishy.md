# Squishy (slow-rising foam): in-house foley recording spec

The shipped sprite (`app/public/sfx/squishy/`) uses CC0 recordings of **substitute materials** (sofa cushion,
cellulose sponge, latex glove, couch fabric). The `recover` category is **derived** (real cushion and foam air
sounds, slowed and reversed); nobody recorded a foam actually rising back. This spec explains how to replace
all five categories with recordings of the real material. `recover` and `stretch` are the priority.

## Materials (buy 2–3 of each so takes vary)
- PU slow-rising squishy toys, 10–15 cm (bun, bread or cake shapes), with smooth printed skin. Unscented if possible. Keep 2 new and 1 broken-in.
- Memory-foam pillow offcut, 10 × 10 × 5 cm, with and without its knit cover.
- Jumbo squishy (20 cm or larger) for low-frequency compress takes.
- Optional gel/TPR squishy, used only for the `compressGel` variants.
- Tools: cotton gloves (to cut skin noise), lint-free cloth, talc (to stop the finger squeaking on the printed skin), and a small acrylic plate to hold the toy still.

## Room and chain
- A dead, quiet room: closet or vocal booth with duvets. Noise floor at least 30 dB under the quietest event (`recover`), so aim for room noise ≤ −70 dBFS at recording gain. HVAC, fridge and computer fans off. Phone in flight mode.
- Mic: one small-diaphragm condenser (e.g. RODE NT5, Line Audio CM4) as the main mic, plus an optional second mic for a close ASMR perspective (a pair of omni lavaliers or a binaural head).
- Distance: 10–15 cm, aimed at the contact point and about 30° off-axis to reduce plosive air. Add a 3–5 cm close position for `recover`.
- Recorder: 48 kHz / 24-bit, mono per mic. High-pass at 40 Hz or lower. No limiter or compressor.
- Levels: `compress` peaks −12 to −8 dBFS; `touch` and `rub` around −20 dBFS; `recover` as hot as the noise floor allows (raise gain only for those takes).

## Gestures per category (minimum takes, all mono)
| Category | Gesture | Duration | Takes |
|---|---|---|---|
| touch | Fingertip (bare, then gloved) lands on the skin from 1–2 cm, light contact, no squeeze. Also a 2-finger and a palm version. | 0.05–0.2 s | 30 |
| compress | Thumb or palm presses deep in 0.2–0.5 s and holds. Record slow, medium and fast. Include the air hiss and foam crush. | 0.2–1 s | 30 |
| rub | Finger presses in, then drags in circles and back-and-forth at constant pressure. Steady 10 s passes at 3 speeds. | 10 s each | 6 |
| stretch | Pull both ends apart slowly and twist the toy (both hands), constant motion, 10 s passes. Also slow tearing-free bends. | 10 s each | 6 |
| recover | Press fully, hold 1 s, release your fingers with no noise (lift straight off with gloves), then record the 3–6 s slow rise with the mic at 3–5 cm. Do it on new and broken-in toys. | 3–6 s | 20 |
| compressGel (optional) | Squeeze a gel/TPR squishy. | 0.2–0.8 s | 15 |

Before each `recover` take, say a slate quietly or clap far away. Leave 2 s of silence before and after every take.
Record 30 s of room tone at every gain setting.

## File naming
`sq_<category>_<material>_<mic>_<take>.wav`, e.g. `sq_recover_bun-new_close_07.wav`. Keep a CSV log with
take, gain, distance, gesture notes and good/bad.

## Editing (feed into app/scripts/squishy/build.mjs)
1. Use the room tone as the noise profile for noise reduction, at most 10–12 dB. Do not gate `recover` hard, because its tail is the sound.
2. Trim `touch` and `compress` so the onset lands within 2 ms. Use a 1 ms fade-in, and a cosine fade-out of 50–200 ms.
3. Loops (`rub`, `stretch`): take the steadiest 2–3 s and apply a 0.2–0.3 s equal-power crossfade. Check for a level step at the seam.
4. `recover`: 1–2.5 s with a slow fade-in (the first 100 ms of the rise is the loudest, so keep it) and a 30–40 % fade-out. Do not slow it down or reverse it.
5. Loudness, as active RMS: compress −20, gel −21, rub −25, stretch −27, touch −27, recover −36 dBFS. Peak ceiling −1.5 dBFS.
6. Export through the build script (32 kHz, 16-bit mono sprite, under 1.2 MB). Set `recorded: true` for every slice and update CREDITS.md (in-house, all rights owned).
