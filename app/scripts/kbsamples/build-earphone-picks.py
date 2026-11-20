"""찌개 and 몽돌 rebuilt from the clips the owner picked by ear on earphones (2026-11-20), all as the "B" earphone pass.

The candidates and their A/B renders live outside the repository (the 찌개 source audio is a third-party recording):
  ~/Music/MANZIZAK/dev-keyboard-audio/candidates-2026-11-20/
    index.json, {jjigae,mongdol}/<id>.wav    candidates: `now-N` = the clips shipped before, `cNN` = new cuts from the same recordings
    ab/index.json, ab/<set>/<id>-B.wav       the earphone pass the owner listened to and picked:
        50 Hz high-pass · narrow cuts (Q 5, ≤ 10 dB) on the ringing tones the clip group shares, only after the strike
        (crossfade 8–14 ms after the peak) · +3 dB at 3.5 kHz (Q 0.8) · from 30 ms after the strike the tail fades a further 15 dB
        · 1 ms fade-in, 10 ms fade-out
This script only levels those exact B files (one gain per clip) and packs them into the sprites, so what ships is what was heard.

Usage: python3 scripts/kbsamples/build-earphone-picks.py [--candidates DIR]   then: npm run pack:sfx
"""
import argparse, hashlib, json, os
import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'audio-src/sfx/keyboard')
SR = 48000
# strike loudness (the app's measure: max 20 ms RMS above 150 Hz), the level of 조약돌 −21.3 · 얼음 −22.2 · 크림 −20.1.
# Before: 찌개 −22…−13 (peak-normalised), 몽돌 −32.6 — now the two match each other and those presets.
TARGET_DBFS = -21.0
CEIL = 0.89
PICKS = {  # owner, by ear on earphones, 2026-11-20 (all "B")
    'jjigae-topre': ('jjigae', 'c07 c09 c12 c17 c19 c23 c25 c28 c29 now-1 now-5 now-6'),
    'mongdol-pl87w': ('mongdol', 'c11 c12 c13 c14 c18 c21 c24 c25 c36 now-2 now-4 now-6'),
}


def loudness(x):
    h = signal.sosfilt(signal.butter(2, 150, 'hp', fs=SR, output='sos'), x)
    w = SR // 50
    return float(np.sqrt(np.convolve(h ** 2, np.ones(w) / w, 'valid').max()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--candidates', default=os.path.expanduser('~/Music/MANZIZAK/dev-keyboard-audio/candidates-2026-11-20'))
    a = ap.parse_args()
    ab = json.load(open(os.path.join(a.candidates, 'ab/index.json')))
    for pid, (cset, ids) in PICKS.items():
        old = json.load(open(os.path.join(OUT, f'{pid}.json')))
        meta = {i['id']: i for i in ab[cset]['items']}
        pcm, entries, pos = [], [], 0
        for cid in sorted(ids.split(), key=lambda c: meta[c]['t']):
            path = os.path.join(a.candidates, f'ab/{cset}/{cid}-B.wav')
            sr, x = wavfile.read(path)
            assert sr == SR and x.ndim == 1
            raw_sha = hashlib.sha256(open(path, 'rb').read()).hexdigest()
            x = x.astype(np.float64) / 32768
            g = 10 ** (TARGET_DBFS / 20) / loudness(x)
            g = min(g, CEIL / np.abs(x).max())
            y = np.clip(np.round(x * g * 32767), -32768, 32767).astype('<i2')
            it = meta[cid]
            src = (f'youtube:{old["credit"]["url"]}@{it["t"]:.2f}s' if cset == 'jjigae' else f'own:{old["source"]["recording"]}@{it["t"]:.3f}s')
            entries.append({'offset': pos / SR, 'duration': len(y) / SR, 'gain': 1, 'src': src,
                            'qc': {'candidate': f'{cid}-B', 'candidateSha256': raw_sha, 'gainDb': round(float(20 * np.log10(g)), 2),
                                   'shippedBefore': cid.startswith('now-')}})
            pcm += [y, np.zeros(480, '<i2')]
            pos += len(y) + 480
        data = np.concatenate(pcm)
        wavfile.write(os.path.join(OUT, f'{pid}.wav'), SR, data)
        new = {k: v for k, v in old.items() if k not in ('entries', 'processing', 'wavSha256')}
        new['entries'] = {'down': entries, 'up': [], 'spaceDown': [], 'spaceUp': []}
        new['processing'] = {
            'script': 'scripts/kbsamples/build-earphone-picks.py',
            'pickedBy': 'project owner, by ear on earphones (A/B/C listening page), 2026-11-20',
            'pass': 'B (earphone): 50 Hz high-pass; narrow cuts on the shared ringing tones after the strike; +3 dB at 3.5 kHz; tail fades a further 15 dB from 30 ms after the strike',
            'ringCuts': ab[cset]['rings'],
            'targetStrikeLoudnessDbfs': TARGET_DBFS,
            'previous': old.get('processing'),
        }
        new['wavSha256'] = hashlib.sha256(open(os.path.join(OUT, f'{pid}.wav'), 'rb').read()).hexdigest()
        with open(os.path.join(OUT, f'{pid}.json'), 'w') as fh:
            fh.write(json.dumps(new, ensure_ascii=False) + '\n')
        print(f'{pid}: {len(entries)} clips, {", ".join(e["qc"]["candidate"] for e in entries)}')


if __name__ == '__main__':
    main()
