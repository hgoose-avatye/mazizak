# Keyboard sound credits and provenance

Every sound in `pebble.wav` and `clack.wav` was cut from the real field recordings listed below.
All of them are **Creative Commons 0 (CC0 1.0 Universal, public domain dedication)**, so they can be
used commercially and embedded in an app with no attribution required. We credit the authors anyway.

License text: https://creativecommons.org/publicdomain/zero/1.0/ (legal code: https://creativecommons.org/publicdomain/zero/1.0/legalcode)

| Preset | Title | Author | Source page | License | Upload date (per page) | Retrieved |
|---|---|---|---|---|---|---|
| pebble | Typing on a rainy 75 | Techrul | https://freesound.org/people/Techrul/sounds/815614/ | CC0 1.0 | 2025-07-10 | 2026-11-09 |
| clack | Keyboard Typing 4 (WhiteFox, Mechanical) | grcekh | https://freesound.org/people/grcekh/sounds/546045/ | CC0 1.0 | 2020-11-24 | 2026-11-09 |
| clack | Keyboard Typing 10 (WhiteFox, Mechanical) | grcekh | https://freesound.org/people/grcekh/sounds/546167/ | CC0 1.0 | 2020-11-25 | 2026-11-09 |

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
