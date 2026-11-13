#!/usr/bin/env python3
"""Owner-picked fidget clips → public/sfx/fidgets/picks.{wav,json} + PICKS-CREDITS.md.

The owner listened to candidate clips (dev page candidates.html, 2026-11-13) and picked these by ear for the wax balls,
the soap crunch and the rainbow beads. Sources are YouTube videos the uploaders published under YouTube's
"Creative Commons Attribution license (reuse allowed)" (= CC BY 3.0) and one Freesound CC0 file. The source audio is NOT in
the repository (large); it lives in $MANZIZAK_PICKS_SOURCES (default ~/Music/MANZIZAK/dev-reference): youtube-cc/<folder>/<id>.wav
(yt-dlp bestaudio → mono 44.1 kHz WAV) and freesound/414538.wav (HQ preview → mono 44.1 kHz WAV).

Processing per clip (objective; only the owner listened, to the unprocessed candidates):
  cut at the listed start/length · rainbow beads and wax-ball sources: spectral hiss reduction (noise profile = quietest 10 % of the source video)
  · lead-in trimmed to 1 ms before the first frame within 12 dB of the peak · 0.5 ms fade-in, 15 ms fade-out
  (120 ms raised-cosine for a clip still ringing at its end)
  · peak-normalised to −1 dBFS · `gain` (≤ 1) matches loudness within a pool.
Usage: python3 scripts/fidgets/build-picks.py   (needs numpy)
"""
import json, os, sys, wave
from datetime import date
import numpy as np

SRC = os.path.expanduser(os.environ.get("MANZIZAK_PICKS_SOURCES", "~/Music/MANZIZAK/dev-reference"))
OUT = os.path.join(os.path.dirname(__file__), "../../public/sfx/fidgets")
SR = 44100
YT_LICENSE, YT_LICENSE_URL = "CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/"

SOURCES = {
    "youtube:kKYelJAi3xE": ("ASMR | 말랑이 17개 털었어요 +슬랑이, 왁뿌볼, 크랑이", "까퓰러ASMR Gapular", "youtube-cc/apple/kKYelJAi3xE.wav", "real wax ball (왁뿌볼) being broken by hand"),
    "youtube:OVPG4qZMl0U": ("ULTIMATE Wax Cracking ASMR! Best Crunchy Sounds", "Mochich! by Jolislime", "youtube-cc/apple/OVPG4qZMl0U.wav", "real wax-coated squishy, cracked wax skin"),
    "youtube:DT-BjNH0iAo": ("Wax Cracking ASMR — What should I crack next?", "Mochich! by Jolislime", "youtube-cc/apple/DT-BjNH0iAo.wav", "real wax-coated squishy, cracked wax skin"),
    "youtube:bExGHkTQmo4": ("Chocolate ASMR | Breaking, Cutting & Melting Chocolate", "ramit girdhar", "youtube-cc/choco/bExGHkTQmo4.wav", "real chocolate — crumbs pressed (similar to chocolate wax crumbs)"),
    "youtube:-LJJrKD68bs": ("너덜너덜해진 슬랑이 ASMR", "공짝지근", "youtube-cc/soap/-LJJrKD68bs.wav", "worn crunchy slime squish — stands in for fully mixed wax"),
    "youtube:wK-jHC_7P6I": ("복숭아 크런치슬라임 무편집영상 공유", "뿌직 PPUJIG", "youtube-cc/beads/wK-jHC_7P6I.wav", "crunchy (bead) slime — stands in for the rainbow bead squishy"),
    "freesound:414538": ("Crunch Sound 1", "emilyws", "freesound/414538.wav", "generic dry crunch — stands in for soap crunch"),
}
FREESOUND = {"freesound:414538": "https://freesound.org/people/emilyws/sounds/414538/"}

# pool → (event, loudness class, note, [(source, start s, length s)]) — starts located in the sources by cross-correlation
PICKS = {
    # wax balls, owner picks 2026-11-13 (second round): first break → (choco) second click → breaking → nearly all broken → mixed
    "apple.init": ("init", "impact", "W01 first break (owner picks: 처음 깰 때 #4 + second round 3–10)", [("youtube:kKYelJAi3xE", t, .6) for t in (347.320, 354.51, 362.01, 368.74, 369.47, 370.86, 372.42, 373.72, 375.09)]),
    "choco.init": ("init", "impact", "W02 first break (owner picks: #1 + second round 1–10)", [("youtube:kKYelJAi3xE", t, .6) for t in (92.010, 74.63, 98.0, 99.5, 101.77, 102.81, 104.88, 105.98, 114.68, 121.82, 123.31)]),
    "choco.second": ("crack", "impact", "W02 the click right after the first break (owner picks: #2 + second round 1–7, 9, 10)", [("youtube:kKYelJAi3xE", t, .6) for t in (174.860, 160.18, 161.0, 164.87, 165.6, 167.58, 170.09, 173.7, 179.49, 187.0)]),
    "apple.crack": ("crack", "impact", "W01 while breaking (owner picks: #1 apple only; #2/#3 and second round 1, 2, 4, 5, 6, 8, 9, 10 shared with W02)", [("youtube:DT-BjNH0iAo", t, .6) for t in (7.291, 14.373, 23.016, 0.32, 1.12, 6.43, 8.44, 12.08, 19.59, 20.35, 24.5)]),
    "choco.crack": ("crack", "impact", "W02 while breaking (owner picks, shared with W01)", [("youtube:DT-BjNH0iAo", t, .6) for t in (14.373, 23.016, 0.32, 1.12, 6.43, 8.44, 12.08, 19.59, 20.35, 24.5)]),
    "wax.nearDone": ("crack", "impact", "W01/W02 nearly every piece broken (owner picks: #5 + second round 3–10 of the same passage)", [("youtube:kKYelJAi3xE", t, .6) for t in (356.590, 354.51, 362.01, 368.74, 369.47, 370.86, 372.42, 373.72, 375.09)]),
    "apple.after": ("hold", "impact", "W01 broken wax being pressed (owner picks: first round 1–5 + second round 1–8)", [("youtube:OVPG4qZMl0U", t, .6) for t in (21.860, 27.565, 33.748, 38.624, 42.702, 11.76, 19.38, 20.48, 22.95, 25.4, 26.63, 34.6, 36.82)]),
    "choco.crumbs": ("crunch", "impact", "W02 crumbs left after the first break, pressed (owner picks: #5 + second round 7, 10)", [("youtube:bExGHkTQmo4", t, .6) for t in (47.120, 27.41, 45.43)]),
    "wax.mixed": ("hold", "impact", "W01/W02 every piece broken and kneaded in (owner picks: #3–#8 + second round 1, 2, 3, 5, 9)", [("youtube:-LJJrKD68bs", t, .7) for t in (108.720, 139.880, 150.370, 173.770, 196.770, 350.930, 16.67, 32.81, 62.01, 76.43, 193.9)]),
    "beads.crunch": ("crunch", "impact", "C02 rainbow beads crushed (owner pick, hiss reduced; short cut)", [("youtube:wK-jHC_7P6I", t, .45) for t in (17.56, 30.82, 37.04, 47.64, 58.28, 69.80, 75.14, 84.30)]),
    "beads.hold": ("hold", "continuous", "C02 rainbow beads squeezed (owner pick, hiss reduced; full cut)", [("youtube:wK-jHC_7P6I", t, 1.0) for t in (17.56, 30.82, 37.04, 47.64, 58.28, 69.80, 75.14, 84.30)]),
    "soap.crunch": ("crunch", "impact", "C01 soap crunch (owner pick, provisional; short cut)", [("freesound:414538", t, .35) for t in (0.011, 0.367, 0.717, 1.110, 1.499, 1.956)]),
    "soap.hold": ("hold", "impact", "C01 soap squeezed (owner pick, provisional; full cut)", [("freesound:414538", t, .7) for t in (0.011, 0.367, 0.717, 1.110, 1.499, 1.956)]),
}
# hiss reduction: the rainbow beads (2026-11-13) and, at the owner's request, every wax-ball source (second pick round)
DENOISE = {"youtube:wK-jHC_7P6I", "youtube:kKYelJAi3xE", "youtube:DT-BjNH0iAo", "youtube:OVPG4qZMl0U", "youtube:bExGHkTQmo4", "youtube:-LJJrKD68bs"}


def load(rel):
    p = os.path.join(SRC, rel)
    if not os.path.exists(p):
        sys.exit(f"missing source {p} — see the header of this script")
    w = wave.open(p)
    assert w.getnchannels() == 1 and w.getframerate() == SR and w.getsampwidth() == 2, p
    x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768
    w.close()
    return x


NF, HOP = 1024, 256
WIN = np.hanning(NF)


def noise_profile(x):
    """mean power spectrum of the quietest 10 % of non-silent 1024-sample frames of the whole source (the hiss between strikes)"""
    frames = np.lib.stride_tricks.sliding_window_view(x, NF)[::NF]
    e = (frames ** 2).mean(1)
    frames, e = frames[e > 1e-8], e[e > 1e-8]  # digital silence (video lead-in / fades) is not the hiss
    quiet = frames[e <= np.percentile(e, 10)]
    return (np.abs(np.fft.rfft(quiet * WIN, axis=1)) ** 2).mean(0)


def denoise(y, noise):
    """spectral subtraction (over-subtraction 2, floor −20 dB, gains smoothed over 3 frames), overlap-add"""
    pad = np.concatenate([np.zeros(NF), y, np.zeros(NF)])
    out = np.zeros_like(pad)
    norm = np.zeros_like(pad)
    starts = range(0, len(pad) - NF, HOP)
    specs = [np.fft.rfft(pad[s:s + NF] * WIN) for s in starts]
    gains = [np.clip(1 - 2.0 * noise / np.maximum(np.abs(S) ** 2, 1e-12), 0.1, 1) for S in specs]
    for i, (s, S) in enumerate(zip(starts, specs)):
        g = np.mean(gains[max(0, i - 1):i + 2], axis=0)
        out[s:s + NF] += np.fft.irfft(S * g) * WIN
        norm[s:s + NF] += WIN ** 2
    return (out / np.maximum(norm, 1e-6))[NF:NF + len(y)]


def shape(y):
    env = np.sqrt(np.convolve(y ** 2, np.ones(88) / 88, "same"))
    a = max(0, int(np.argmax(env > env.max() * 0.25)) - int(0.001 * SR))
    y = y[a:].copy()
    fi, fo = int(0.0005 * SR), int(0.015 * SR)
    # a clip cut while it still rings (the 45 ms before the end within 30 dB of the peak) gets a 120 ms raised-cosine
    # fade-out instead of the short one, so it decays instead of stopping dead; the others keep the 15 ms fade
    tail = y[-int(0.045 * SR):]
    if 20 * np.log10(np.sqrt((tail ** 2).mean()) / np.abs(y).max() + 1e-12) > -30:
        fo = int(0.12 * SR)
        y[-fo:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo))
        fo = 0
    y[:fi] *= np.linspace(0, 1, fi)
    if fo:
        y[-fo:] *= np.linspace(1, 0, fo)
    return y / np.abs(y).max() * 10 ** (-1 / 20), a / SR


def level(y, cls):
    if cls == "continuous":
        return np.sqrt((y ** 2).mean())
    n = int(0.02 * SR)
    return max(np.sqrt((y[i:i + n] ** 2).mean()) for i in range(0, max(1, len(y) - n), int(0.002 * SR)))


def main():
    cache, noise = {}, {}
    clips, pools = [], {}
    for name, (event, cls, note, items) in PICKS.items():
        made = []
        for src, start, length in items:
            if src not in cache:
                cache[src] = load(SOURCES[src][2])
                if src in DENOISE:
                    noise[src] = noise_profile(cache[src])
            x = cache[src]
            a = int(round(start * SR))
            y = x[a:a + int(length * SR)]
            if src in DENOISE:
                ctx = x[max(0, a - NF):a + int(length * SR) + NF]
                y = denoise(ctx, noise[src])[a - max(0, a - NF):][:len(y)]
            y, lead = shape(y)
            made.append(dict(y=y, src=src, srcStart=round(start + lead, 4), level=level(y, cls)))
        quiet = min(m["level"] for m in made)
        for m in made:
            m["gain"] = round(min(1.0, quiet / m["level"]), 4)
        pools[name] = (event, cls, note, made)
        clips += made
    gap = int(0.03 * SR)
    total = sum(len(m["y"]) + gap for m in clips)
    pcm = np.zeros(total)
    pos = 0
    pool_json = {}
    for name, (event, cls, note, made) in pools.items():
        entries = []
        for m in made:
            n = len(m["y"])
            pcm[pos:pos + n] = m["y"]
            S = np.abs(np.fft.rfft(m["y"]))
            f = np.fft.rfftfreq(n, 1 / SR)
            entries.append(dict(start=pos, length=n, offset=round(pos / SR, 6), duration=round(n / SR, 6), gain=m["gain"], src=m["src"],
                                srcStart=m["srcStart"], srcEnd=round(m["srcStart"] + n / SR, 4), centroidHz=int((S * f).sum() / S.sum()), boostDb=0))
            pos += n + gap
        pool_json[name] = dict(event=event, loudnessClass=cls, material="owner pick", note=note, recordings=len(entries), variants=0, entries=entries)
    pcm16 = np.clip(np.round(pcm * 32767), -32768, 32767).astype("<i2")
    with wave.open(os.path.join(OUT, "picks.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm16.tobytes())
    today = str(date.today())
    sources = {}
    for k, (title, author, rel, material) in SOURCES.items():
        yt = k.startswith("youtube:")
        sources[k] = dict(title=title, author=author, url=f"https://www.youtube.com/watch?v={k[8:]}" if yt else FREESOUND[k],
                          license=YT_LICENSE if yt else "CC0 1.0", licenseUrl=YT_LICENSE_URL if yt else "https://creativecommons.org/publicdomain/zero/1.0/",
                          retrieved="2026-11-13", usage="owner-picked fidget clips (see pool notes); cut, faded, normalised" + (", hiss-reduced" if k in DENOISE else ""),
                          materialMatch=material, originalFile=(f"https://www.youtube.com/watch?v={k[8:]}" if yt else FREESOUND[k]))
    json.dump(dict(version=1, file="picks.wav", sampleRate=SR, channels=1, bitDepth=16, totalSamples=len(pcm16), built=today,
                   note="Clips picked by ear by the owner from candidate cuts (2026-11-13). Peak-normalised to −1 dBFS; `gain` (≤1) matches loudness within a pool; relative loudness between event classes is set by the player.",
                   counts=dict(sourceFiles=len({m['src'] for m in clips}), extractedClips=len(clips), derivedVariants=0), dropped=[], sources=sources, pools=pool_json),
              open(os.path.join(OUT, "picks.json"), "w"), ensure_ascii=False, indent=1)
    lines = ["# Owner-picked fidget sound credits (picks.wav)", "",
             "Generated by `scripts/fidgets/build-picks.py` — do not edit by hand. Pools and clip times are in `picks.json`.",
             "The owner picked these clips by ear (2026-11-13). **All clips were modified**: cut out of the source audio, faded in/out,",
             "peak-normalised and loudness-matched; the rainbow-bead and wax-ball clips were also hiss-reduced.", "",
             "YouTube videos: published by their uploaders under YouTube's “Creative Commons Attribution license (reuse allowed)” —",
             f"CC BY 3.0 ({YT_LICENSE_URL}). Freesound: CC0 1.0 (no attribution needed; credited anyway).", "",
             "| source | title | author | licence | used for |", "|---|---|---|---|---|"]
    used = {}
    for name, (_, _, note, made) in pools.items():
        for m in made:
            used.setdefault(m["src"], set()).add(name)
    for k, s in sources.items():
        lines.append(f"| {s['url']} | {s['title'].replace('|', '/')} | {s['author']} | {s['license']} | {', '.join(sorted(used.get(k, [])))} |")
    open(os.path.join(OUT, "PICKS-CREDITS.md"), "w").write("\n".join(lines) + "\n")
    print(f"picks: {len(clips)} clips in {len(pools)} pools from {len(sources)} sources, {len(pcm16) / SR:.1f} s")


if __name__ == "__main__":
    main()
