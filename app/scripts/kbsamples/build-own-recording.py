"""Key presets from the project owner's own recordings:
  복숭아 (silent-peach-v3) ← 피치축.m4a (2026-11-18, a coworker's keyboard)
  몽돌 (mongdol-pl87w) ← 몽돌.m4a (2026-11-19; replaced the clips cut from a YouTube video)
  두부 (dojagi-space65; the id is kept from the 도자기 preset it replaced) ← 저소음 무접점.m4a (2026-11-19)

Usage:
  python3 scripts/kbsamples/build-own-recording.py --preset silent-peach-v3 --input ~/Downloads/피치축.m4a --variant medium
      → audio-src/sfx/keyboard/<preset>.{wav,json}   (then: npm run pack:sfx)
  python3 scripts/kbsamples/build-own-recording.py --preset ... --input ... --candidates DIR
      → DIR/<preset>-{light,medium,strong}.wav: every picked press of each variant in a row (0.45 s apart), for listening

Steps (needs numpy + scipy; m4a is decoded with macOS `afconvert`):
  1. noise   the recording's steady noise (hiss + the ~100–130 Hz hum) is measured on its quietest 20 % of frames and removed
             by spectral subtraction (STFT 2048/512, gain smoothed over time). Variants differ only in strength / floor.
  2. cut     presses = the loudest 2 ms frame within ±70 ms, ≥ 20 dB over the noise floor, with nothing within 18 dB of it in the 46 ms before;
             the clip runs from just before the onset until the level stays ≤ max(floor + 6, peak − 40) dB for 20 ms (max 160 ms),
             and stops before the next press. 1 ms fade-in, 10 ms fade-out.
  3. pick    the cleanest presses (highest strike-to-noise, ≥ MIN_SNR_DB), at most MAX_CLIPS; presses in noisy stretches (local floor ≥ 12 dB over the global
             floor) are left out.
  4. level   strike loudness (max 20 ms RMS) equalised to TARGET_DBFS (the previous 복숭아's level), peak ≤ 0.85.
"""
import argparse, hashlib, json, os, subprocess, sys, tempfile
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
MAX_CLIPS = 14
MIN_SNR_DB = 22  # weaker presses carry too much of the room in them
TARGET_DBFS = -32.6
VARIANTS = {  # over-subtraction, gain floor (dB)
    'light': (1.5, -12.0),
    'medium': (2.5, -20.0),
    'strong': (4.0, -30.0),
}
PRESETS = {
    'silent-peach-v3': dict(recording='피치축.m4a', recordedOn='2026-11-18', keyboard="a coworker's keyboard (peach switches)",
                            credit={'label': '복숭아', 'title': '피치축 typing recording', 'by': 'project owner (own recording)'}),
    'mongdol-pl87w': dict(recording='몽돌.m4a', recordedOn='2026-11-19', keyboard='keyboard with 몽돌 switches',
                          credit={'label': '몽돌', 'title': '몽돌축 typing recording', 'by': 'project owner (own recording)'}),
    'dojagi-space65': dict(recording='저소음 무접점.m4a', recordedOn='2026-11-19', keyboard='silent Topre (electro-capacitive) keyboard',
                           credit={'label': '두부', 'title': '저소음 무접점 typing recording', 'by': 'project owner (own recording)'}),
}
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
db = lambda v: 20 * np.log10(np.maximum(v, 1e-12))


def load(path):
    if not path.lower().endswith('.wav'):
        tmp = tempfile.mkdtemp()
        out = os.path.join(tmp, 'in.wav')
        subprocess.check_call(['afconvert', '-f', 'WAVE', '-d', f'LEI16@{SR}', '-c', '1', path, out])
        path = out
    sr, x = wavfile.read(path)
    if sr != SR or x.ndim != 1:
        raise SystemExit(f'expected mono {SR} Hz, got {sr} Hz {x.shape}')
    return x.astype(np.float64) / 32768


def denoise(x, alpha, floor_db):
    f, t, Z = signal.stft(x, SR, nperseg=2048, noverlap=1536)
    P = np.abs(Z) ** 2
    e = P.sum(0)
    quiet = e <= np.percentile(e, 20)
    N = np.median(P[:, quiet], axis=1, keepdims=True)
    g = np.maximum(10 ** (floor_db / 20), 1 - alpha * N / np.maximum(P, 1e-20)) ** 0.5
    # smooth the gain over time: fast attack, slower release, so transients stay intact and the floor does not "twinkle"
    s = np.empty_like(g); s[:, 0] = g[:, 0]
    for i in range(1, g.shape[1]):
        s[:, i] = np.where(g[:, i] > s[:, i - 1], g[:, i], 0.6 * s[:, i - 1] + 0.4 * g[:, i])
    _, y = signal.istft(Z * s, SR, nperseg=2048, noverlap=1536)
    return y[: len(x)]


def env_db(x, hop):
    n = len(x) // hop
    return db(np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(1)))


def cut(raw, y):
    hop = SR // 500  # 2 ms
    er, ey = env_db(raw, hop), env_db(y, hop)
    floor_r, floor_y = np.percentile(er, 10), np.percentile(ey, 10)
    # presses = loudest 2 ms frame within ±70 ms, ≥ 20 dB over the (denoised) floor; a silent switch's release and ring belong to that press
    peaks = [i for i in range(35, len(ey) - 35) if ey[i] >= floor_y + 20 and ey[i] == ey[i - 35: i + 36].max()]
    clips = []
    for k, p in enumerate(peaks):
        top = ey[p]
        o = p
        while o > p - 8 and ey[o - 1] > top - 20:
            o -= 1  # onset: up to 16 ms before the peak, where the level is still within 20 dB of it
        pre = ey[max(0, o - 25): max(0, o - 1)]
        if len(pre) < 15 or pre.max() > top - 18:
            continue  # something else is sounding just before (previous press still ringing)
        if np.median(er[max(0, p - 150): p + 150]) > floor_r + 12:
            continue  # noisy stretch (rubbing / continuous typing)
        a, b, quiet_run = max(0, o - 2), p + 15, 0
        stop = max(floor_y + 6, top - 40)
        while b < len(ey) and b - a < 80:
            quiet_run = quiet_run + 1 if ey[b] <= stop else 0
            if quiet_run >= 10:
                b -= 5  # end in the middle of the quiet run
                break
            b += 1
        nxt = peaks[k + 1] if k + 1 < len(peaks) else 10**9
        if nxt - 8 < b:  # the next press starts inside this clip: end the clip before it, if what is left still holds the press
            b = nxt - 8
            if b - p < 25:
                continue
        seg = y[a * hop: b * hop].copy()
        fi, fo = SR // 1000, SR // 100
        seg[:fi] *= np.linspace(0, 1, fi)
        seg[-fo:] *= np.linspace(1, 0, fo)
        clips.append(dict(at=a * hop / SR, seg=seg, snr=float(er[p - 2: p + 3].max() - floor_r), pk=float(top)))
    clips = [c for c in clips if c['snr'] >= MIN_SNR_DB]
    clips.sort(key=lambda c: -c['snr'])
    picked = sorted(clips[:MAX_CLIPS], key=lambda c: c['at'])
    return picked, float(floor_r), len(peaks)


def loudness(x):
    w = SR // 50
    if len(x) <= w:
        return float(np.sqrt((x ** 2).mean()))
    c = np.convolve(x ** 2, np.ones(w) / w, 'valid')
    return float(np.sqrt(c.max()))


def level(seg):
    k = 10 ** (TARGET_DBFS / 20) / max(loudness(seg), 1e-9)
    y = seg * k
    pk = np.abs(y).max()
    if pk > 0.85:
        y *= 0.85 / pk
    return y, float(db(k))


def to16(x):
    return (np.clip(np.round(x * 32767), -32768, 32767)).astype('<i2')


def build(raw, variant):
    alpha, fl = VARIANTS[variant]
    picked, floor_r, n_on = cut(raw, denoise(raw, alpha, fl))
    for c in picked:
        c['y'], c['gainDb'] = level(c['seg'])
    return picked, floor_r, n_on


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preset', choices=PRESETS, required=True)
    ap.add_argument('--input', required=True)
    ap.add_argument('--variant', choices=VARIANTS, default='medium')
    ap.add_argument('--candidates')
    a = ap.parse_args()
    raw = load(os.path.expanduser(a.input))
    src_sha = hashlib.sha256(open(os.path.expanduser(a.input), 'rb').read()).hexdigest()
    if a.candidates:
        os.makedirs(a.candidates, exist_ok=True)
        for v in VARIANTS:
            picked, floor_r, n_on = build(raw, v)
            gap = np.zeros(int(SR * 0.45))
            out = np.concatenate([np.concatenate([c['y'], gap]) for c in picked])
            wavfile.write(os.path.join(a.candidates, f'{a.preset}-{v}.wav'), SR, to16(out))
            print(f'{v:7s} {len(picked)} clips of {n_on} onsets, noise floor {floor_r:.1f} dBFS, SNR {min(c["snr"] for c in picked):.1f}–{max(c["snr"] for c in picked):.1f} dB')
        return
    picked, floor_r, n_on = build(raw, a.variant)
    P, pid = PRESETS[a.preset], a.preset
    pcm, entries = [], []
    pos = 0
    for c in picked:
        y = to16(c['y'])
        entries.append({'offset': pos / SR, 'duration': len(y) / SR, 'gain': 1, 'src': f'own:{P["recording"]}@{c["at"]:.3f}s',
                        'qc': {'snrDb': round(c['snr'], 1), 'lenMs': round(len(y) / SR * 1000), 'gainDb': round(c['gainDb'], 1)}})
        pcm += [y, np.zeros(480, '<i2')]
        pos += len(y) + 480
    data = np.concatenate(pcm)
    out = os.path.join(ROOT, 'audio-src/sfx/keyboard')
    wavfile.write(os.path.join(out, f'{pid}.wav'), SR, data)
    wav_sha = hashlib.sha256(open(os.path.join(out, f'{pid}.wav'), 'rb').read()).hexdigest()
    meta = {
        'version': 1, 'preset': pid, 'file': f'{pid}.wav', 'sampleRate': SR, 'upMode': 'none',
        'entries': {'down': entries, 'up': [], 'spaceDown': [], 'spaceUp': []},
        'source': {'recording': P['recording'], 'recordedBy': 'project owner', 'recordedOn': P['recordedOn'],
                   'keyboard': P['keyboard'], 'sha256': src_sha},
        'processing': {'script': 'scripts/kbsamples/build-own-recording.py', 'variant': a.variant,
                       'oversubtraction': VARIANTS[a.variant][0], 'gainFloorDb': VARIANTS[a.variant][1],
                       'noiseFloorDbfs': round(floor_r, 1), 'onsetsFound': n_on, 'targetStrikeLoudnessDbfs': TARGET_DBFS,
                       'note': 'Hiss and hum removed by spectral subtraction (noise profile = quietest 20 % of the recording); single presses cut, 1 ms fade-in / 10 ms fade-out, loudness-matched.'},
        'clearance': {'status': 'own recording', 'statedBy': 'project owner', 'statedOn': P['recordedOn'],
                      'note': "Recorded by the project owner; no third-party permission needed."},
        'credit': P['credit'],
        'wavSha256': wav_sha,
    }
    with open(os.path.join(out, f'{pid}.json'), 'w') as fh:
        fh.write(json.dumps(meta, ensure_ascii=False) + '\n')
    print(f'{pid} ({a.variant}): {len(picked)} clips, {", ".join(str(round(len(c["y"]) / SR * 1000)) for c in picked)} ms')


if __name__ == '__main__':
    main()
