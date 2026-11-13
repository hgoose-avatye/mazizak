#!/usr/bin/env python3
"""LOCAL DEVELOPMENT ONLY. More candidate hits for the owner-picked wax-ball stages, taken from the same source videos
near the adopted clips (same object, microphone and room). Writes cut WAVs + entries to the candidates listening page
(~/Music/MANZIZAK/dev-reference/candidates, served by the dev server only). Adopted clips are never touched.

Per stage: onsets (10 ms frames) that rise ≥ 8 dB in 30 ms and stand ≥ 26 dB over the passage's quiet floor; broadband
(spectral flatness ≥ 0.06, centroid ≥ 1.5 kHz over the first 50 ms — speech/music are tonal and low); the clip window
itself must not be mostly low/tonal (energy share below 1 kHz ≤ 0.6); ≥ 0.6 s from every adopted clip and from each other;
best 10 by onset sharpness + quiet lead-in. Nobody has listened to them.
"""
import json, os, wave
import numpy as np

D = os.path.expanduser("~/Music/MANZIZAK/dev-reference")
C, Y = D + "/candidates", D + "/youtube-cc"
SR = 44100
# stage → (label, source video, folder, [(from s, to s)], window s, adopted start times in that video)
STAGES = {
    "chocoinit": ("초콜릿 · 처음 깰 때", "kKYelJAi3xE", "apple", [(70, 125)], .6, [92.010]),
    "chocosecond": ("초콜릿 · 깨고 나서 두 번째 클릭", "kKYelJAi3xE", "apple", [(150, 200)], .6, [174.860, 180.550]),
    "appleinit": ("청사과 · 처음 깰 때 / 거의 다 깨졌을 때", "kKYelJAi3xE", "apple", [(320, 380)], .6, [347.320, 356.590]),
    "crack": ("공통 · 깨지고 있을 때", "DT-BjNH0iAo", "apple", [(0, 32.5)], .6, [7.291, 14.373, 23.016]),
    "appleafter": ("청사과 · 깨진 뒤 누를 때", "OVPG4qZMl0U", "apple", [(0, 46.8)], .6, [21.860, 27.565, 33.748, 38.624, 42.702]),
    "chococrumbs": ("초콜릿 · 깨진 조각 누를 때", "bExGHkTQmo4", "choco", [(0, 56.9)], .6, [47.120]),
    "mixed": ("공통 · 다 깨고 섞였을 때", "-LJJrKD68bs", "soap", [(0, 356.2)], .7, [108.720, 139.880, 150.370, 173.770, 196.770, 350.930]),
}

ADOPTED = {
    "chocoinit": ("초콜릿 · 처음 깰 때", ["butter/ytkKYelJAi3xE-1.wav"]),
    "chocosecond": ("초콜릿 · 깨고 나서 두 번째 클릭", ["butter/ytkKYelJAi3xE-2.wav"]),
    "appleinit": ("청사과 · 처음 깰 때(#4) / 거의 다 깨졌을 때(#5)", ["butter/ytkKYelJAi3xE-4.wav", "butter/ytkKYelJAi3xE-5.wav"]),
    "crack": ("공통 · 깨지고 있을 때 (#1 청사과만)", [f"butter/ytDTBjNH0iAo-{n}.wav" for n in (1, 2, 3)]),
    "appleafter": ("청사과 · 깨진 뒤 누를 때", [f"butter/ytOVPG4qZMl0U-{n}.wav" for n in (1, 2, 3, 4, 5)]),
    "chococrumbs": ("초콜릿 · 깨진 조각 누를 때", ["cake/ytbExGHkTQmo4-5.wav"]),
    "mixed": ("공통 · 다 깨고 섞였을 때", [f"soda/ytLJJrKD68bs-{n}.wav" for n in (3, 4, 5, 6, 7, 8)]),
}


def load(p):
    w = wave.open(p)
    x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768
    w.close()
    return x


def cut(x, a, win):
    y = x[a:a + int(win * SR)].copy()
    y *= 0.7 / (np.abs(y).max() or 1)
    fo = int(0.04 * SR)
    y[-fo:] *= np.linspace(1, 0, fo)
    y[:120] *= np.linspace(0, 1, 120)
    return y


def main():
    idx = json.load(open(C + "/index.json"))
    idx = [i for i in idx if not i["id"].startswith(("more-", "adopted-"))]
    for stage, (label, clips) in ADOPTED.items():  # the adopted clips, listed next to the new ones for comparison (files unchanged)
        idx.append(dict(toy="stage:" + stage, id=f"adopted-{stage}", title=f"[채택됨] {label}", author="", license="CC BY 3.0 (YouTube)", page="", why="현재 앱에 들어간 클립", clips=clips))
    os.makedirs(C + "/wax", exist_ok=True)
    report = {}
    for stage, (label, vid, folder, ranges, win, adopted) in STAGES.items():
        x = load(f"{Y}/{folder}/{vid}.wav")
        H = int(0.01 * SR)
        cands = []
        for lo, hi in ranges:
            a0, a1 = int(lo * SR), min(len(x), int(hi * SR))
            seg = x[a0:a1]
            fr = np.sqrt(np.add.reduceat(seg ** 2, np.arange(0, len(seg) - H, H)) / H) + 1e-9
            db = 20 * np.log10(fr)
            floor = np.percentile(db[db > -90], 15)
            for i in range(30, len(db) - int(win * 100)):
                if db[i] - db[i - 3:i].max() < 8 or db[i] < floor + 26 or db[i] < -45:
                    continue
                if db[i] < db[i + 1:i + 4].max() - 1 and db[i + 1:i + 4].max() - db[i - 3:i].max() < 8:
                    continue
                a = a0 + i * H
                t = a / SR
                if any(abs(t - p) < 0.6 for p in adopted):
                    continue
                head = x[a:a + int(0.05 * SR)]
                S = np.abs(np.fft.rfft(head * np.hanning(len(head)))) + 1e-9
                f = np.fft.rfftfreq(len(head), 1 / SR)
                flat, cen = np.exp(np.log(S).mean()) / S.mean(), (S * f).sum() / S.sum()
                body = x[a:a + int(win * SR)]
                B = np.abs(np.fft.rfft(body)) ** 2
                fb = np.fft.rfftfreq(len(body), 1 / SR)
                low = B[fb < 1000].sum() / B.sum()
                if flat < 0.06 or cen < 1500 or low > 0.6:
                    continue
                pre = db[max(0, i - 40):i - 3].mean()
                cands.append((db[i] - pre + flat * 20, t))
        cands.sort(reverse=True)
        picked = []
        for score, t in cands:
            if all(abs(t - u) >= 0.6 for u in picked):
                picked.append(t)
            if len(picked) >= 10:
                break
        picked.sort()
        clips = []
        for n, t in enumerate(picked, 1):
            y = cut(x, max(0, int((t - 0.02) * SR)), win)
            name = f"wax/{stage}x{''.join(c for c in vid if c.isalnum())}-{n}.wav"
            with wave.open(f"{C}/{name}", "wb") as o:
                o.setnchannels(1); o.setsampwidth(2); o.setframerate(SR)
                o.writeframes((np.clip(y, -1, 1) * 32767).astype("<i2").tobytes())
            clips.append(name)
        idx.append(dict(toy="stage:" + stage, id=f"more-{stage}", title=f"[신규 후보] {label}", author="", license="CC BY 3.0 (YouTube)",
                        page=f"https://www.youtube.com/watch?v={vid}", why="영상 내 시각(초): " + ", ".join(f"{t:.2f}" for t in picked), clips=clips))
        report[stage] = len(clips)
    json.dump(idx, open(C + "/index.json", "w"), ensure_ascii=False, indent=1)
    print(report)


if __name__ == "__main__":
    main()
