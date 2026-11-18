#!/usr/bin/env python3
"""
S02 모닝빵 pools from the project owner's own recording (2026-11-18, "빵말랑이.m4a"; stored as
scripts/fidgets/own/bread/bread-2026-11-18.wav — 48 kHz mono 16-bit PCM converted with macOS afconvert, no other processing;
provenance in scripts/fidgets/own/sources.json). Only the part from START_S on is used (the owner: the first ~8 s is handling).
(The 2026-11-17 recording had music under it and was dropped; this one was screened: only steady hum lines ~94 Hz and
~785–845 Hz, flat over the whole file — appliance/electrical, removed with the rest of the background.)

  python3 scripts/fidgets/add-bread.py                         append to squish.wav / squish.json (variant: medium)
  python3 scripts/fidgets/add-bread.py --variant strong        another background-reduction strength (light | medium | strong)
  python3 scripts/fidgets/add-bread.py --candidates DIR        DIR/bread-<variant>-<pool>.wav for listening; squish.* untouched

Appends two pools — bread.tap (~0.34 s presses) and bread.hold (~0.7 s, two or more presses) — to the END of
audio-src/sfx/fidgets/squish.wav / squish.json. Every existing clip keeps its samples and its place in the file:
build-clips.mjs is not re-run (its ffmpeg decode would re-pick every pool).

The asset is soft, low presses (≈ 87 % of the energy at 100–400 Hz, almost nothing above 3 kHz) over a steady background
≈ 20 dB below them. Same treatment as build-clips.mjs: a window starts where a press swells to within 16 dB of its loudest
moment, background reduced (spectral subtraction, noise profile = quietest 10 % of the asset), peak-normalised to −1 dBFS,
`gain` (≤ 1) loudness-matches the pool (RMS for bread.hold, strongest 20 ms for bread.tap), short fades. Clips are spread
over the recording (≥ 2 s apart). Listened to and picked by the owner as candidates (--candidates) before shipping.

Re-run after build-clips.mjs (which rewrites squish.json without these pools): python3 scripts/fidgets/add-bread.py
"""
import json, os, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import stft, istft, find_peaks, butter, sosfiltfilt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
OUT = os.path.join(ROOT, 'audio-src/sfx/fidgets')
OWN = os.path.join(ROOT, 'scripts/fidgets/own')
ASSET = 'bread/bread-2026-11-18.wav'
START_S = 9.0
HIGHPASS_HZ = 100
# one consistent character (owner, 2026-11-18: clips felt uneven): the bread presses sit at 1.5–3.5 kHz; thumps (energy under 250 Hz)
# and bright rubbing are left out, and so are rattly clips
CENTROID_HZ = (1500, 3500)
MAX_LOW = 0.3
MAX_ROUGH = 0.6
VARIANTS = {'light': (1.2, 0.15), 'medium': (2.0, 0.08), 'strong': (3.0, 0.04)}  # over-subtraction, magnitude floor
SR = 48000
POOLS = {'bread.tap': dict(event='tap', lenMs=340, n=6, note='short bread-squishy presses (~0.34 s)', loud='impact'),
         'bread.hold': dict(event='hold', lenMs=700, n=6, note='bread-squishy pressing windows (~0.7 s)', loud='continuous')}


def denoise(x, variant):
    over, fl = VARIANTS[variant]
    f, t, Z = stft(x, SR, nperseg=1024, noverlap=768)
    mag = np.abs(Z)
    e = mag.sum(0)
    noise = mag[:, e <= np.percentile(e, 10)].mean(1, keepdims=True)
    g = np.maximum(1 - over * noise / np.maximum(mag, 1e-12), fl)
    # smooth the gain over time (fast attack, slow release): without it the gain flickers frame to frame and the
    # leftover background "rattles" (the owner heard a 드르륵 on 2026-11-18)
    s = np.empty_like(g); s[:, 0] = g[:, 0]
    for i in range(1, g.shape[1]):
        s[:, i] = np.where(g[:, i] > s[:, i - 1], g[:, i], 0.7 * s[:, i - 1] + 0.3 * g[:, i])
    _, y = istft(Z * s, SR, nperseg=1024, noverlap=768)
    # 100 Hz high-pass (4th order): the 94 Hz hum and the handling rumble sit below the bread sound
    y = sosfiltfilt(butter(4, HIGHPASS_HZ, 'highpass', fs=SR, output='sos'), y[: len(x)])
    return y


def character(c):
    """brightness (spectral centroid), share of energy under 250 Hz, and roughness (level wobble at 15–60 Hz vs 1–15 Hz: a 드르륵)"""
    p = np.abs(np.fft.rfft(c * np.hanning(len(c)))) ** 2
    f = np.fft.rfftfreq(len(c), 1 / SR)
    P = p.sum() + 1e-20
    hop = SR // 1000
    n = len(c) // hop
    e = np.sqrt((c[: n * hop].reshape(n, hop) ** 2).mean(1))
    E = np.abs(np.fft.rfft((e - e.mean()) * np.hanning(n))) ** 2
    fe = np.fft.rfftfreq(n, 1 / 1000)
    rough = E[(fe >= 15) & (fe < 60)].sum() / (E[(fe >= 1) & (fe < 15)].sum() + 1e-20)
    return float((f * p).sum() / P), float(p[f < 250].sum() / P), float(rough)


def env_db(x, ms=10):
    w = SR * ms // 1000
    n = len(x) // w
    return 20 * np.log10(np.sqrt((x[: n * w].reshape(n, w) ** 2).mean(1)) + 1e-9), w


def presses(x):
    """loudest moment of every press (peaks of the 100 ms level)"""
    db, w = env_db(x)
    sm = np.convolve(db, np.ones(10) / 10, mode='same')
    floor = np.percentile(db, 15)
    pk, _ = find_peaks(sm, height=floor + 8, distance=30, prominence=5)
    return [int(p * w) for p in pk]


def impact_level(y):
    """the level of the strongest 20 ms after a 150 Hz high-pass (what the sprite tests compare for impact pools)"""
    a = np.exp(-2 * np.pi * 150 / SR)
    h = np.zeros_like(y); px = py = 0.0
    for i, v in enumerate(y):
        py = a * (py + v - px); px = v; h[i] = py
    n, step = int(0.02 * SR), int(0.005 * SR)
    return max(np.sqrt((h[i:i + n] ** 2).mean()) for i in range(0, max(1, len(h) - n + 1), step))


def centroid(c):
    p = np.abs(np.fft.rfft(c * np.hanning(len(c)))) ** 2
    f = np.fft.rfftfreq(len(c), 1 / SR)
    return float((f * p).sum() / (p.sum() + 1e-20))


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--variant', choices=VARIANTS, default='medium')
    ap.add_argument('--candidates')
    args = ap.parse_args()
    with open(os.path.join(OUT, 'squish.json')) as fh:
        meta = json.load(fh)
    if not args.candidates and any(p in meta['pools'] for p in POOLS):
        sys.exit('squish.json already has the bread pools (re-run build-clips.mjs first to start over)')
    with open(os.path.join(OWN, 'sources.json')) as fh:
        prov = json.load(fh)[ASSET]
    sr, base = wavfile.read(os.path.join(OUT, meta['file']))
    assert sr == SR and base.dtype == np.int16 and len(base) == meta['totalSamples']
    sr, raw = wavfile.read(os.path.join(OWN, ASSET))
    assert sr == SR and raw.ndim == 1
    raw = raw[int(START_S * SR):].astype(np.float64) / 32768
    x = denoise(raw, args.variant)
    hits = presses(raw)
    db, w = env_db(raw)
    out, cursor, src_id = [base], len(base), f'own:{ASSET}'
    for name, cfg in POOLS.items():
        L = SR * cfg['lenMs'] // 1000
        cands = []
        for h in hits:
            # start where the press swells to within 16 dB of its loudest moment (audible at once on touch)
            k = h // w
            while k > 0 and h // w - k < 40 and db[k - 1] > db[h // w] - 16:
                k -= 1
            a = max(0, k * w - SR // 200)
            hd = int(0.015 * SR)
            audible = lambda a: np.sqrt((x[a:a + hd] ** 2).mean()) >= np.abs(x[a:a + L]).max() * 10 ** (-34 / 20)
            for _ in range(20):  # the background reduction quietens the start: move on until the first 15 ms is clearly audible
                if a + L > len(x) or audible(a):
                    break
                a += SR // 200
            if a + L > len(x) or not audible(a):
                continue  # still no clear start: it would answer a touch late
            peak = np.abs(raw[a:a + L]).max()
            if peak >= 0.98:
                continue
            strikes = sum(1 for p in hits if a <= p < a + L)
            cen, low, rough = character(x[a:a + L])
            if not (CENTROID_HZ[0] <= cen <= CENTROID_HZ[1]) or low > MAX_LOW or rough > MAX_ROUGH:
                continue
            cands.append(dict(a=a, peak=peak, strikes=strikes, cen=cen, rough=rough))
        if not cands:
            sys.exit(f'{name}: no clip of the bread character')
        mid = np.median([np.log(c['cen']) for c in cands])
        # closest to the typical brightness first (then the smoothest), spread over the recording (≥ 1 s apart)
        cands.sort(key=lambda c: abs(np.log(c['cen']) - mid) + 0.5 * c['rough'])
        chosen = []
        for c in cands:
            if all(abs(o['a'] - c['a']) >= SR for o in chosen):
                chosen.append(c)
            if len(chosen) == cfg['n']:
                break
        if len(chosen) < 3:
            sys.exit(f'{name}: only {len(chosen)} clips')
        chosen.sort(key=lambda c: c['a'])
        clips = []
        for c in chosen:
            y = x[c['a']:c['a'] + L].copy()
            fi, fo = SR * 2 // 1000, SR * 30 // 1000
            y[:fi] *= np.linspace(0, 1, fi)
            y[-fo:] *= np.linspace(1, 0, fo)
            boost = 20 * np.log10(10 ** (-1 / 20) / (np.abs(y).max() + 1e-12))
            clips.append((c, y * 10 ** (boost / 20), boost))
        lv = [np.sqrt((y ** 2).mean()) if cfg['loud'] == 'continuous' else impact_level(y) for _, y, _ in clips]
        entries = []
        for (c, y, boost), l in zip(clips, lv):
            pcm = np.round(np.clip(y, -1, 1) * 32767).astype(np.int16)
            gap = np.zeros(SR // 20, np.int16)  # 50 ms of silence between clips
            out += [gap, pcm]
            start = cursor + len(gap)
            cursor = start + len(pcm)
            entries.append({'start': int(start), 'length': int(len(pcm)), 'offset': round(start / SR, 6), 'duration': round(len(pcm) / SR, 6),
                            'gain': round(float(min(lv) / l), 4), 'src': src_id, 'srcStart': round(c['a'] / SR + START_S, 4), 'srcEnd': round((c['a'] + L) / SR + START_S, 4),
                            'peakDbSource': round(float(20 * np.log10(c['peak'])), 1), 'centroidHz': round(centroid(y)), 'roughness': round(c['rough'], 2), 'strikes': int(c['strikes']),
                            'boostDb': round(float(boost), 1)})
        meta['pools'][name] = {'event': cfg['event'], 'loudnessClass': cfg['loud'], 'material': prov['material'], 'note': cfg['note'],
                               'processing': f'hiss and background reduced (spectral subtraction with time-smoothed gain, variant {args.variant}: noise profile = quietest 10 % of the asset from {START_S:g} s), {HIGHPASS_HZ} Hz high-pass; clips of one character only (centroid {CENTROID_HZ[0]}–{CENTROID_HZ[1]} Hz, ≤ {MAX_LOW:.0%} under 250 Hz, roughness ≤ {MAX_ROUGH}); appended by scripts/fidgets/add-bread.py',
                               'recordings': len(entries), 'variants': 0, 'entries': entries}
        if args.candidates:
            os.makedirs(args.candidates, exist_ok=True)
            gap = np.zeros(int(0.4 * SR))
            wavfile.write(os.path.join(args.candidates, f'bread-{args.variant}-{name.split(".")[1]}.wav'), SR,
                          np.round(np.clip(np.concatenate([np.concatenate([y * g, gap]) for (_, y, _), g in zip(clips, [min(lv) / l for l in lv])]), -1, 1) * 32767).astype(np.int16))
        print(f"{name}: {len(entries)} clips of {len(cands)} " + ', '.join(f"@{e['srcStart']}s {e['centroidHz']}Hz r{e['roughness']}" for e in entries))
    if args.candidates:
        return
    meta['sources'][src_id] = {'title': prov['title'], 'author': 'project owner', 'url': 'own recording', 'license': prov.get('license', 'Own recording (project owner)'),
                               'licenseUrl': '', 'retrieved': prov['added'], 'usage': 'S02 tap, S02 hold', 'materialMatch': prov['material'],
                               'originalFile': f'scripts/fidgets/own/{ASSET}'}
    pcm = np.concatenate(out)
    meta['totalSamples'] = int(len(pcm))
    meta['counts']['sourceFiles'] = len(meta['sources'])
    meta['counts']['extractedClips'] += sum(len(meta['pools'][p]['entries']) for p in POOLS)
    wavfile.write(os.path.join(OUT, meta['file']), SR, pcm)
    with open(os.path.join(OUT, 'squish.json'), 'w') as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)
        fh.write('\n')


if __name__ == '__main__':
    main()
