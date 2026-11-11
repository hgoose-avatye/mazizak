# Keyboard sound credits and provenance

> **2026-11-10: `clack` (까랑까랑) now uses recorded bank B from branch `sound/recorded-ab` (Gateron Blue, forfii, Freesound 755222, CC0).** The WhiteFox/Hako Violet sections below describe the *previous* clack sprite (git `c6d7209`) and are kept for history only. The clack clips were cut and level-matched by that branch's `scripts/sound/build_bank.py` and copied unchanged (`app/scripts/kbsamples/source/clack-b/`, built by `build-clack-b.mjs`); the Freesound HQ preview (OGG ~192 kbps) was used, not the original upload.

Every sound in `pebble.wav` and `clack.wav` was cut from the real field recordings listed below.
All of them are **Creative Commons 0 (CC0 1.0 Universal, public domain dedication)**, so they can be
used commercially and embedded in an app with no attribution required. We credit the authors anyway.

License text: https://creativecommons.org/publicdomain/zero/1.0/ (legal code: https://creativecommons.org/publicdomain/zero/1.0/legalcode)

| Preset | Title | Author | Source page | License | Upload date (per page) | Retrieved |
|---|---|---|---|---|---|---|
| pebble | Typing on a rainy 75 | Techrul | https://freesound.org/people/Techrul/sounds/815614/ | CC0 1.0 | 2025-07-10 | 2026-11-09 |
| clack | Keyboard slow typing with Gateron Blue switches + low echo | forfii | https://freesound.org/people/forfii/sounds/755222/ | CC0 1.0 | (see page) | 2026-11-09 (verified on branch sound/recorded-ab) |
| ~~clack (until 2026-11-10)~~ | ~~Keyboard Typing 4 / 10 (WhiteFox, Mechanical)~~ — **replaced, no longer in the sprite** | grcekh | https://freesound.org/people/grcekh/sounds/546045/ , /546167/ | CC0 1.0 | | |

Files downloaded on 2026-11-09 (UTC ≈ 02:20–02:40), without logging in, as the Freesound high-quality
preview MP3s (the preview has the same license as the upload):

- https://cdn.freesound.org/previews/815/815614_15899953-hq.mp3
- https://cdn.freesound.org/previews/546/546045_12206738-hq.mp3
- https://cdn.freesound.org/previews/546/546167_12206738-hq.mp3

Each page shows the license as "Creative Commons 0" and links to
`http://creativecommons.org/publicdomain/zero/1.0/`. I checked this on 2026-11-09.

## Why these are real recordings, not AI-generated audio

- **815614, "Typing on a rainy 75" (Techrul).** The uploader says: "I just typed on my Rainy 75 keyboard."
  The tags are rainy75, thocky, creamy, keyboard and typing. The upload is a 58 s 48 kHz stereo MP3. The audio
  looks like a room recording: human typing rhythm, a steady room noise floor around −65 dBFS, and MP3
  pre-echo before transients.
- **546045 and 546167 (grcekh).** They are part of a numbered series of 10 clips uploaded in November 2020,
  before generative audio was common. The uploader says: "Typing on WhiteFox mechanical keyboard with Hako
  Violet switches. Recorded with a Yeti Nano while typing 50-word segments at a time on typings.gg. The clip
  ends with individual keys typed back-to-back. No post-production." The audio also carries an ~80 Hz desk or
  microphone-stand resonance, as you would expect from a desk-mounted USB mic.

I found nothing on these pages that suggests AI generation.

I looked at other sources and did not use them. Some were not a good match: HHKB/Topre clips by grcekh, a
Leopold FC980M, a "creamy keyboard" clip that was too noisy, single Keychron K10 space and enter hits (a
40–80 Hz thump dominates them), and a Mars Gaming board. I did not use any Pixabay, Mixkit or
non-CC0 material.

## What each preset is, at the source level

- **pebble (조약돌)** comes from a Rainy 75: an aluminium, gasket-mounted, foam-dampened board with
  factory-lubed linear switches. The presses have a low "thock" body and very little high-frequency ping.
- **clack (까랑까랑)** comes from a WhiteFox: an aluminium-case 65% board with Hako Violet tactile switches.
  It has a brighter, crisper press and a clearly audible return.

The two presets come from different keyboards, different rooms and different microphones.
Neither preset is a filtered or pitched copy of the other.

## Processing (all in `app/scripts/kbsamples/`, Node + system Chrome, no ffmpeg/sox)

1. Chrome `decodeAudioData` decodes the MP3 previews to mono at 48 kHz (`decode.mjs`).
2. Cleanup, the same for every source: a 20 Hz DC high-pass, then a 2nd-order 75 Hz high-pass for rumble.
   The WhiteFox clips also get a 110 Hz high-pass to remove their ~80 Hz desk/mic-stand resonance.
   Nothing else is filtered or EQ'd, and nothing is pitched.
3. Onset detection uses a 1 ms envelope. The start of each cut is refined to 0.5 ms before the first
   sample above 15 % of the hit's peak, which skips MP3 pre-echo.
   A QA gate rejects any slice whose peak is not at its onset (≤ 1.5 ms).
4. Noise removal is a gentle per-slice downward expander: up to −12 dB below the local noise floor
   + 12 dB, opening instantly and closing over ~6 ms. Each tail is trimmed where it falls to within
   6 dB of the floor. Fades are 0.25 ms in and 8 ms out (raised cosine), followed by DC removal.
5. Loudness: each slice is matched to its role's median, measured as 60 ms RMS after a 150 Hz high-pass
   (a rough small-speaker weighting). Releases keep their natural level relative to presses, capped at
   ≥ 6 dB quieter. Spacebar presses are set ≥ 1 dB heavier than normal presses. Downs of both presets are
   matched in loudness. In the sprite each slice is peak-normalised to −1 dBFS, and the JSON `gain`
   (≤ 1) applies the loudness match.
6. Output is one 16-bit mono 48 kHz WAV sprite per preset, with 10 ms of silence between slices, plus a JSON map.
   Every entry records `src` (Freesound id) and `srcStart`/`srcEnd` (seconds into the source).

## How each role was chosen (honest notes; I could not listen to anything)

- **clack down/up** are real press→release pairs from the "individual keys" tails of the WhiteFox clips.
  Each press has ≥ 250 ms of silence before it, and the release is the strongest transient 45–260 ms later.
- **clack spaceDown/spaceUp** are a spacebar proxy. Nothing in the clips confirms which key is the spacebar.
  The four pairs scoring highest on loud + longest natural ring + lowest spectral centroid are used,
  each with its own release.
- **pebble down** are the strongest well-separated presses in the Rainy 75 clip. This is continuous typing
  at about 5 keys/s, so slices end before the next key.
- **pebble up / spaceUp** are inferred upstrokes. Each is a weaker, isolated transient 40–250 ms after a
  strong press and 6–28 dB below it. Some of them may be light presses of other keys rather than true
  top-outs.
- **pebble spaceDown** is a spacebar proxy: the heaviest presses (loud, with the most < 400 Hz energy) that
  have room for a longer tail.

If confirmed spacebar or upstroke samples are needed, they would have to be recorded in-house.

---

# creamy-thocky (CC BY 4.0, attribution required)

This preset is **not** CC0 and is not cut from a field recording like `pebble` / `clack`. It is built from a
Mechvibes community sound pack.

| Preset | Title | Author | Source page | License | Retrieved |
|---|---|---|---|---|---|
| creamy-thocky | My Sound Pack (5 OGG clips, "Creamy and Thocky", tag asmr) | Chevy | https://mechvibes.com/sound-packs/my-sound-pack-5 | CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/ | 2026-11-10 |

Required attribution: **"My Sound Pack" by Chevy, https://mechvibes.com/sound-packs/my-sound-pack-5, licensed under CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/). The audio was trimmed, level-normalised and converted to a WAV sprite.**

Download: `https://mechvibes.com/api/sound-packs/mv-2263bade9c724dd98ef92e743a6303b2/download` (no login).
The original OGG files and the pack's `config.json` are kept unchanged in `app/scripts/kbsamples/source/creamy-thocky/`.

## Rights caveat

CC BY 4.0 is only the **label shown on the Mechvibes pack page**. The pack has no source link, and nothing proves the
uploader owns every right in the underlying recording (for example whether it was recorded by Chevy or taken from
someone else's video or sample library). We did not verify that. If the rights holder objects, remove the preset.
Before a public release, show the attribution above somewhere in the app (e.g. a credits screen) — it is currently only in this file,
the preset tooltip and the source code.

## Changes made to the original (CC BY 4.0 §3(a)(1)(B) — indication of modification)

Script: `app/scripts/kbsamples/build-creamy.mjs`.
1. OGG Vorbis (48 kHz mono) decoded to 16-bit PCM with ffmpeg 7.1 (`imageio-ffmpeg` static build, isolated virtualenv).
2. Near-silence trimmed: samples below peak −45 dB before the first hit and below −50 dB at the end (quiet lead-in material is kept);
   0.5 ms fade-in and 8 ms raised-cosine fade-out.
3. Level normalisation: each clip peak-normalised to −1 dBFS in the sprite, then the JSON `gain` (≤ 1) lowers the louder ones so all
   five have the same RMS. Gain applied before matching: +3.0 dB (`2`), +20.7 dB (`OtherKeys`), +21.1 dB (`BackSpace`), +21.2 dB (`Shift`),
   +24.0 dB (`Space`); the largest boost is +24 dB (the script refuses more than +26 dB).
4. The five clips are concatenated with 10 ms of silence into one sprite `creamy-thocky.wav` (+ `creamy-thocky.json`).
No filtering, EQ, pitch change or noise reduction.

## How the clips are used (and what is NOT verified)

- Each clip is played **whole, on key down only**; there is no release (key-up) sound (`"upMode": "none"`).
  Each clip shows two strong transients about 80–110 ms apart in its waveform, which may be a press and a release, but
  nobody has listened to it, so the clips were not split.
- spaceDown is empty and falls back to the five key-down clips.
- The original `config.json` maps keys to clips as: default keys → `OtherKeys`, `Space` key → `Shift`, `ShiftLeft/Right` → `Shift`, `Escape` → `Space`,
  `Digit2` → `2`, `Backspace` → `BackSpace`. The Space/Shift/Escape assignments look swapped, but whether the `Space.ogg` clip is a spacebar
  sound could not be confirmed without listening. **That mapping was not used.** All five clips are treated as generic key-down
  sounds. Re-assigning them to specific keys (e.g. a proper space bar) is **unverified** and needs a listen-through.
- Timbre/quality of this preset has not been checked by ear.



## Topre — kbs.im / tplai/kbsim (MIT)

- Upstream: https://github.com/tplai/kbsim
- Pinned commit: `ba103f3b0afa9dab80447aa2e7e2ed80b6bd80e4`
- Source: `src/assets/audio/topre/press/*.mp3` (8) and `release/*.mp3` (4).
- Copyright (c) Thomas Lai. Repository license: MIT. Full, unmodified notice:
  [topre-LICENSE.md](./topre-LICENSE.md). Preserve this notice when redistributing.
- **Recording rights provenance: unverified.** The checked upstream tree has no separate
  recording author, recording license, or third-party rights statement for Topre.
  The repository MIT license is the available permission basis; it does not independently
  establish who made or owns the original recordings. No separate restriction was found.
- All 12 MP3s and upstream LICENSE.md are retained byte-for-byte under
  `scripts/kbsamples/source/topre/`. SHA-256 hashes are recorded in `topre.json`.
- Changes: Chromium MP3 decoding, channel averaging to mono, 48 kHz resampling,
  16-bit PCM quantisation, concatenation with 10 ms silent sprite gaps.
  No trimming, fades, EQ, pitch shifting, or per-clip level normalisation.
- Generic key-down uses R0–R4 by fullsize keyboard row, generic release uses one clip.
  Space, Enter and Backspace each retain separate press/release clips. Bottom row uses R4,
  matching upstream's default branch. The small on-screen Q/A/Z rows use R2/R3/R4.
- Topre playback disables the existing per-key/random pitch offsets to preserve row pitches;
  the app's existing limiter, gain jitter and fast-typing attenuation still apply.
- Machine decoding/routing checks are not a listening assessment. Human listening pending.
