#!/usr/bin/env python3
"""
S02 모닝빵 pools from the project owner's own recording (2026-11-17, "모닝빵.mp3"; stored as
scripts/fidgets/own/bread/morningbread.wav — 48 kHz mono 16-bit PCM converted with macOS afconvert, no other processing;
provenance in scripts/fidgets/own/sources.json).

Appends two pools — bread.tap (~0.34 s presses) and bread.hold (~0.7 s, two or more presses) — to the END of
audio-src/sfx/fidgets/squish.wav / squish.json. Every existing clip keeps its samples and its place in the file:
build-clips.mjs is not re-run (its ffmpeg decode would re-pick every pool).

The asset is soft, low presses (≈ 87 % of the energy at 100–400 Hz, almost nothing above 3 kHz) over a steady background
≈ 20 dB below them. Same treatment as build-clips.mjs: a window starts where a press swells to within 16 dB of its loudest
moment, background reduced (spectral subtraction, noise profile = quietest 10 % of the asset), peak-normalised to −1 dBFS,
`gain` (≤ 1) loudness-matches the pool (RMS for bread.hold, strongest 20 ms for bread.tap), short fades. Clips are spread
over the whole recording (≥ 2 s apart). NOT listened to.

Re-run after build-clips.mjs (which rewrites squish.json without these pools): python3 scripts/fidgets/add-bread.py
"""
import json, os, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import stft, istft, find_peaks

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
OUT = os.path.join(ROOT, 'audio-src/sfx/fidgets')
OWN = os.path.join(ROOT, 'scripts/fidgets/own')
ASSET = 'bread/morningbread.wav'
SR = 48000
POOLS = {'bread.tap': dict(event='tap', lenMs=340, n=6, note='short bread-squishy presses (~0.34 s)', loud='impact'),
         'bread.hold': dict(event='hold', lenMs=700, n=6, note='bread-squishy pressing windows (~0.7 s, ≥ 2 presses)', loud='continuous')}


def denoise(x):
    f, t, Z = stft(x, SR, nperseg=1024, noverlap=768)
    mag = np.abs(Z)
    e = mag.sum(0)
    noise = mag[:, e <= np.percentile(e, 10)].mean(1, keepdims=True)
    clean = np.maximum(mag - 1.2 * noise, 0.15 * mag)
    _, y = istft(clean * np.exp(1j * np.angle(Z)), SR, nperseg=1024, noverlap=768)
    return y[: len(x)]


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
    with open(os.path.join(OUT, 'squish.json')) as fh:
        meta = json.load(fh)
    if any(p in meta['pools'] for p in POOLS):
        sys.exit('squish.json already has the bread pools (re-run build-clips.mjs first to start over)')
    with open(os.path.join(OWN, 'sources.json')) as fh:
        prov = json.load(fh)[ASSET]
    sr, base = wavfile.read(os.path.join(OUT, meta['file']))
    assert sr == SR and base.dtype == np.int16 and len(base) == meta['totalSamples']
    sr, raw = wavfile.read(os.path.join(OWN, ASSET))
    assert sr == SR and raw.ndim == 1
    raw = raw.astype(np.float64) / 32768
    x = denoise(raw)
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
            for _ in range(20):  # the background reduction quietens the start: move on until the first 15 ms is clearly audible
                if a + L > len(x) or np.sqrt((x[a:a + hd] ** 2).mean()) >= np.abs(x[a:a + L]).max() * 10 ** (-34 / 20):
                    break
                a += SR // 200
            if a + L > len(x):
                continue
            peak = np.abs(raw[a:a + L]).max()
            if peak >= 0.98:
                continue
            strikes = sum(1 for p in hits if a <= p < a + L)
            if cfg['event'] == 'hold' and strikes < 2:
                continue
            cands.append(dict(a=a, peak=peak, strikes=strikes))
        cands.sort(key=lambda c: -c['peak'])
        chosen = []
        for c in cands:  # strongest first, spread over the recording (≥ 2 s apart)
            if all(abs(o['a'] - c['a']) >= 2 * SR for o in chosen):
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
                            'gain': round(float(min(lv) / l), 4), 'src': src_id, 'srcStart': round(c['a'] / SR, 4), 'srcEnd': round((c['a'] + L) / SR, 4),
                            'peakDbSource': round(float(20 * np.log10(c['peak'])), 1), 'centroidHz': round(centroid(y)), 'strikes': int(c['strikes']),
                            'boostDb': round(float(boost), 1)})
        meta['pools'][name] = {'event': cfg['event'], 'loudnessClass': cfg['loud'], 'material': prov['material'], 'note': cfg['note'],
                               'processing': 'background reduced (spectral subtraction, noise profile = quietest 10 % of the asset); appended by scripts/fidgets/add-bread.py',
                               'recordings': len(entries), 'variants': 0, 'entries': entries}
        print(f"{name}: {len(entries)} clips " + ', '.join(f"@{e['srcStart']}s +{e['boostDb']}dB {e['centroidHz']}Hz x{e['strikes']}" for e in entries))
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
