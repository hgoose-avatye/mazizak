# Squishy sample credits

`squishy.wav` / `squishy.json` are edited from the recordings below. Every source is released under
**Creative Commons 0 1.0 (public domain dedication)** — https://creativecommons.org/publicdomain/zero/1.0/ —
as shown on its Freesound page on the retrieval date. CC0 permits commercial use, modification and
embedding in an app with no attribution required; we credit the authors anyway.

Files used: Freesound's public HQ preview MP3s (`cdn.freesound.org/previews/...-hq.mp3`, 128 kbps),
which carry the same license as the original upload. Retrieved **2026-11-09**.

| ID | Title | Author | Page | Used for | Real recording? (evidence on the page) |
|---|---|---|---|---|---|
| 746443 | Sitting on a couch | mk-la | https://freesound.org/people/mk-la/sounds/746443/ | compress ×5 | Yes: "Recorded with a Google Pixel phone" |
| 405654 | found cushion 2.wav | apinasaundi | https://freesound.org/people/apinasaundi/sounds/405654/ | compress ×1, recover (derived) | Yes: "Some kind of plastic cushion squeezed", uploaded 2017 |
| 575333 | squishing gel between hands | breadparticles | https://freesound.org/people/breadparticles/sounds/575333/ | compressGel ×5 | Yes: foley, skin gel squished between hands, uploaded 2021 |
| 50579 | Dry Sponge Rubbing | qubodup | https://freesound.org/people/qubodup/sounds/50579/ | rub loop | Yes: "I rub two sponges against each other", uploaded 2008 |
| 827006 | stretching rubber glove | mistakenforathing | https://freesound.org/people/mistakenforathing/sounds/827006/ | stretch loop | Yes: "unedited recording … recorded with a samson q2u microphone" |
| 716374 | Fabric touched by hand | Sadiquecat | https://freesound.org/people/Sadiquecat/sounds/716374/ | touch ×3 | Yes: Zoom H5 + RODE NT5, couch fabric stroked |
| 872227 | Soft Impact - Pillow Hit | KoimeMatsuchiya | https://freesound.org/people/KoimeMatsuchiya/sounds/872227/ | touch ×1 | Yes: "Recorded as a practical Foley sound effect" |
| 680000 | Rubbing Spiky Sound Insulation Foam | imnotdubMass | https://freesound.org/people/imnotdubMass/sounds/680000/ | touch ×1, recover (derived) | Yes: PU acoustic foam panel rubbed with a stick, uploaded 2023 |

None of these pages are tagged or described as AI-generated or synthesized.

## Processing (scripts/squishy/build.mjs)

High-pass 45 Hz (zero-phase) → gentle STFT spectral noise reduction (≤14 dB per bin, smoothed) →
onset-trimmed slices with 1 ms fade-in and cosine fade-out → equal-power 0.25 s loop crossfades for
rub/stretch → 32 kHz resample → per-category loudness match (active RMS) with a −1.5 dBFS peak ceiling →
16-bit mono sprite. Per-slice provenance (`src`, `srcStart`, `srcEnd` in seconds of the source file) is in
`squishy.json`.

**`recover` is derived**, not a direct recording of foam rising back: it is the plastic-cushion air
squeeze (#405654) and a PU-foam stroke (#680000) slowed 2.6×/4× (tape-style), low-passed and reversed,
with long fades. A real slow-rise recording is specified in `docs/RECORDING_SPEC_squishy.md`.

Material proxies: `stretch` is a latex/rubber glove (not foam), `rub` is a cellulose sponge, `compress`
is a sofa cushion (some takes include the soft body-contact thump of sitting down).
