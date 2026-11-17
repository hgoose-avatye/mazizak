#!/usr/bin/env python3
"""LOCAL DEVELOPMENT ONLY — round-3 listening candidates for candidates.html (nothing here ships, nothing here is approved).

  L02 망고      new Freesound CC0 sources: crackly / crunchy slime windows (1.0 s)
  L03 휘핑크림   recordings that were never used (578460, 578463, 181409 …) + new CC0 whipped-cream / shaving-foam sources (0.6 s)
  W02 초콜릿    extra crumb hits from the CURRENT source video (bExGHkTQmo4), not yet shown to the owner (0.6 s)
  (S01 슬랑이 and C02 레인보우 need no new audio: the page lists the existing guma candidates and slices the shipped picks sprite.)

Writes cut 16-bit WAVs into ~/Music/MANZIZAK/dev-reference/candidates/{mango,cream,crumbs}/ and `r3:*` entries into its index.json
(older entries are untouched). Sources are the sha256-pinned previews listed in freesound-sources.json / candidate-sources.json.
Processing = the same as the shipped owner picks (scripts/fidgets/build-picks.py): spectral hiss reduction, lead-in trim,
0.5 ms / 15 ms fades, peak −1 dBFS. Clips are chosen automatically from the waveform: NOBODY HAS LISTENED to them.

Objective checks per clip (rejected clips are counted in the report):
  CLIP      the source passage reaches full scale
  NOISY     peak − source noise floor below the target minimum (22–26 dB; flag "noise?" when < 32 dB)
  QUIET     source peak below −30 dBFS          (flag: normalisation amplifies the hiss)
  LOWTHUMP  > 55 % of the energy below 300 Hz   (handling thumps instead of the toy)
  DUP       envelope + spectrum nearly identical to a better clip of the same set
  SHORT     shorter than 0.5 s (L02) / 0.35 s (L03) / 0.3 s (crumbs) after the lead-in trim
  GAP       a pause longer than 40 ms inside the clip

Usage: FFMPEG=/path/to/ffmpeg [FFMPEG_SHA256=…] [R3_ONLY=W02] python3 -I scripts/fidgets/candidates-r3.py     (needs numpy)
"""
import hashlib, importlib.util, json, os, subprocess, sys, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
D = os.path.expanduser("~/Music/MANZIZAK/dev-reference")
C, Y = D + "/candidates", D + "/youtube-cc"
CACHE = ROOT + "/bench-out/fidget-src"
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
SR = 44100

spec = importlib.util.spec_from_file_location("build_picks", HERE + "/build-picks.py")
bp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bp)  # main() is guarded by __main__; only the helpers are used

MANI = {}
for f in ("freesound-sources.json", "candidate-sources.json"):
    MANI.update(json.load(open(f"{HERE}/{f}"))["sources"])

# "yt:<id>" = a YouTube video the uploader published under "Creative Commons Attribution license (reuse allowed)" (CC BY 3.0, read from the
# video page 2026-11-14); local audio in dev-reference/youtube-cc/beads, pinned by sha256 in candidate-sources.json
L02_IDS = ["759544", "448893", "850226", "848946", "587848", "811615", "448641", "389689", "851648", "757640", "652733", "329627", "769028", "759537",
           "yt:QhCXe8gtqLU", "yt:Kq_UCqk_--Q", "yt:6SE7APqq9_w", "yt:x4utTO0k-bY"]
L03_IDS = ["578460", "578463", "181409", "846514", "32921", "480895", "469199", "844310", "578461", "631969", "586041", "560248", "67160"]
# W02 crumbs: adopted starts (build-picks.py choco.crumbs) + the ten candidates the owner already saw (more-wax-candidates.py)
CRUMB_SEEN = [47.12, 27.41, 45.43, 1.40, 3.74, 11.64, 13.74, 20.53, 22.31, 27.43, 30.53, 41.40, 45.45]

TARGETS = {  # window s, min active share, min fine transients/s, centroid band Hz, centroid target Hz, min SNR dB, max clips per source
    "L02": dict(min_len=0.5, win=1.0, active=0.55, rises=10, cen=(1800, 7500), tgt=3800, snr=24, per=4, low=0.55, folder="mango", label="L02 망고"),
    "L03": dict(min_len=0.35, win=0.6, active=0.50, rises=0, cen=(1200, 9500), tgt=5500, snr=22, per=3, low=0.55, folder="cream", label="L03 휘핑크림"),
}


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def decode(path):
    r = subprocess.run([FFMPEG, "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True)
    if r.returncode:
        sys.exit(f"ffmpeg failed for {path}: {r.stderr.decode()[:200]}")
    return np.frombuffer(r.stdout, "<i2").astype(np.float64) / 32768


def fs_source(sid):
    key = f"freesound:{sid}"
    m = MANI.get(key)
    if not m:
        sys.exit(f"{key} is in neither freesound-sources.json nor candidate-sources.json")
    p = f"{CACHE}/fs_{sid}.mp3"
    if not os.path.exists(p):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(["curl", "-sS", "-m", "120", "-A", "Mozilla/5.0", "-o", p, m["preview"]], check=True)
    if sha(p) != m["sha256"]:
        sys.exit(f"{key}: sha256 mismatch")
    return p, m


def yt_source(vid):
    m = MANI[f"youtube:{vid}"]
    p = f"{Y}/{m['localFile'].split('/', 1)[1]}"
    if sha(p) != m["sha256"]:
        sys.exit(f"youtube:{vid}: sha256 mismatch")
    return bp.load(m["localFile"]), m


def env_db(x, hop):
    n = len(x) // hop
    return 20 * np.log10(np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)


def spectrum_feats(y):
    S = np.abs(np.fft.rfft(y * np.hanning(len(y)))) ** 2
    f = np.fft.rfftfreq(len(y), 1 / SR)
    cen = float((np.sqrt(S) * f).sum() / (np.sqrt(S).sum() + 1e-12))
    low = float(S[f < 300].sum() / (S.sum() + 1e-12))
    return cen, low


def fine_rises(y):
    db = env_db(y, int(0.005 * SR))
    return float(((db[1:] - db[:-1]) > 4).sum() / (len(y) / SR))


def source_floor(x):
    """(noise floor dB, dense). A dense recording has no quiet gaps (its 10th-percentile level is within 20 dB of its loudest
    frame), so the 10th percentile is signal, not noise: assume a floor 40 dB under the peak and do NOT hiss-reduce it
    (the noise profile would be the sound itself)."""
    db10 = env_db(x, int(0.01 * SR))
    live = db10[db10 > -80]
    if not len(live):
        return -90.0, False
    p10, top = float(np.percentile(live, 10)), float(live.max())
    return (top - 40.0, True) if top - p10 < 20 else (p10, False)


def window_cands(x, win, onset=True, rise=6.0, above=20.0):
    """(start sample, features) for windows of one source; onset=True keeps only windows that start on a rise of ≥ `rise` dB
    (impulsive sources), onset=False any window that starts ≥ `above` dB over the floor (continuous textures such as slime / cream)"""
    db10 = env_db(x, int(0.01 * SR))
    floor, _ = source_floor(x)
    L = int(win * SR)
    out = []
    step = int(0.05 * SR)
    for a in range(int(0.1 * SR), len(x) - L - int(0.05 * SR), step):
        i = a // int(0.01 * SR)
        cur = db10[i:i + 3].max()
        pre = db10[max(0, i - 8):i - 1].max() if i > 8 else -90
        if (onset and cur - pre < rise) or cur < floor + above:
            continue
        y = x[a:a + L]
        pk = float(np.abs(y).max())
        cen, low = spectrum_feats(y)
        d = env_db(y, int(0.01 * SR))
        out.append((a, dict(peak=pk, clip=bool((np.abs(y) >= 0.999).any()), snr=20 * np.log10(pk + 1e-9) - floor, active=float((d > floor + 18).mean()),
                            rises=fine_rises(y), cen=cen, low=low, floor=floor, t=a / SR)))
    return out


def pick_windows(cands, score, per, win, taken=(), gap=None, taken_gap=0.45):
    chosen = []
    gap = win + 0.1 if gap is None else gap
    for a, f in sorted(cands, key=lambda c: -score(c[1])):
        t = a / SR
        if any(abs(t - u) < gap for u in [c[0] / SR for c in chosen]) or any(abs(t - u) < taken_gap for u in taken):
            continue
        chosen.append((a, f))
        if len(chosen) >= per:
            break
    return sorted(chosen)


def process(x, noise, a, win):
    """the shipped owner-pick processing: hiss reduction on the passage with context (skipped when noise is None = dense source),
    then lead-in trim / fades / −1 dBFS"""
    L = int(win * SR)
    ctx_a = max(0, a - bp.NF)
    ctx = x[ctx_a:a + L + bp.NF]
    y = bp.denoise(ctx, noise)[a - ctx_a:][:L] if noise is not None else x[a:a + L].copy()
    y, trimmed = bp.shape(y)
    return y, trimmed


def silent_run(y, thr=1e-3):
    """longest run (s) of near-silence inside a peak-normalised clip — a dropout / pause in the middle of it"""
    run = mx = 0
    for v in (np.abs(y) < thr):
        run = run + 1 if v else 0
        mx = max(mx, run)
    return mx / SR


def pick_processed(x, noise, cands, score, per, win, min_len, taken=(), gap=None, taken_gap=0.45):
    """greedy by score with spacing; every candidate is processed and validated BEFORE it is accepted:
    SHORT = shorter than min_len after the lead-in trim, GAP = a pause > 40 ms inside the clip"""
    chosen, rej = [], {"SHORT": 0, "GAP": 0}
    gap = win + 0.1 if gap is None else gap
    for a, f in sorted(cands, key=lambda c: -score(c[1])):
        t = a / SR
        if any(abs(t - c[0] / SR) < gap for c in chosen) or any(abs(t - u) < taken_gap for u in taken):
            continue
        y, trimmed = process(x, noise, a, win)
        if len(y) / SR < min_len:
            rej["SHORT"] += 1
            continue
        if silent_run(y) > 0.04:
            rej["GAP"] += 1
            continue
        chosen.append((a, f, y, trimmed))
        if len(chosen) >= per:
            break
    return sorted(chosen, key=lambda c: c[0]), rej


def sig(y):
    """envelope + spectrum signature for the duplicate check"""
    e = env_db(y, int(0.02 * SR))
    e = np.interp(np.linspace(0, len(e) - 1, 24), np.arange(len(e)), e)
    e = e - e.mean()
    S = np.abs(np.fft.rfft(y[:int(0.4 * SR)] * np.hanning(min(len(y), int(0.4 * SR))))) ** 2
    b = np.array([S[int(i * len(S) / 48):int((i + 1) * len(S) / 48) + 1].sum() for i in range(48)])
    b = np.log10(b + 1e-12)
    return e / (np.linalg.norm(e) + 1e-9), (b - b.mean()) / (np.linalg.norm(b - b.mean()) + 1e-9)


def write_wav(path, y):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as o:
        o.setnchannels(1); o.setsampwidth(2); o.setframerate(SR)
        o.writeframes((np.clip(y, -1, 1) * 32767).astype("<i2").tobytes())


def dedupe(items):
    """items: [(score, clip dict with 'y')] → drop a clip that is nearly identical to a better one"""
    keep, dropped = [], 0
    for it in sorted(items, key=lambda i: -i["score"]):
        e, s = sig(it["y"])
        if any(float(e @ k["e"]) > 0.97 and float(s @ k["s"]) > 0.985 for k in keep):
            dropped += 1
            continue
        it["e"], it["s"] = e, s
        keep.append(it)
    return keep, dropped


def build_freesound_target(tkey, ids, report):
    T = TARGETS[tkey]
    entries, all_items = [], []
    for sid in ids:
        yt = sid.startswith("yt:")
        if yt:
            sid = sid[3:]
            x, m = yt_source(sid)
        else:
            p, m = fs_source(sid)
            x = decode(p)
        _, dense = source_floor(x)
        noise = None if dense else bp.noise_profile(x)
        cands = window_cands(x, T["win"], onset=False, above=18.0)
        why = {"CLIP": 0, "NOISY": 0, "LOWTHUMP": 0, "BAND": 0, "ACTIVE": 0, "RISES": 0}
        ok = []
        for a, f in cands:
            if f["clip"]: why["CLIP"] += 1
            elif f["snr"] < T["snr"]: why["NOISY"] += 1
            elif f["low"] > T["low"]: why["LOWTHUMP"] += 1
            elif not (T["cen"][0] <= f["cen"] <= T["cen"][1]): why["BAND"] += 1
            elif f["active"] < T["active"]: why["ACTIVE"] += 1
            elif f["rises"] < T["rises"]: why["RISES"] += 1
            else: ok.append((a, f))
        def score(f):
            cs = max(0.0, 1 - abs(np.log2(f["cen"] / T["tgt"])))
            if tkey == "L02":
                return min(f["rises"], 60) / 60 + 0.7 * cs + 0.3 * f["active"] + 0.4 * min(f["snr"], 45) / 45
            return 0.8 * cs + 0.5 * f["active"] + 0.5 * min(f["snr"], 45) / 45 - max(0.0, f["rises"] - 40) / 60 * 0.4
        chosen, rej2 = pick_processed(x, noise, ok, score, T["per"], T["win"], T["min_len"])
        why.update(rej2)
        srcrep = dict(id=sid, title=m["title"], author=m["author"], candidates=len(cands), rejected=why, chosen=len(chosen), dense=dense)
        for a, f, y, trimmed in chosen:
            flags = []
            if f["snr"] < 32: flags.append("noise?")
            if f["peak"] < 10 ** (-30 / 20): flags.append("quiet-source")
            if dense: flags.append("dense-source(no-hiss-reduction)")
            all_items.append(dict(score=score(f), sid=sid, yt=yt, m=m, a=a, f=f, y=y, trimmed=trimmed, flags=flags))
        report[f"{tkey}:{sid}"] = srcrep
    kept, dup = dedupe(all_items)
    report[f"{tkey}:duplicates-dropped"] = dup
    by = {}
    for it in sorted(kept, key=lambda i: (i["sid"], i["a"])):
        by.setdefault((it["sid"], it["yt"]), []).append(it)
    for (sid, yt), its in by.items():
        m = its[0]["m"]
        files, info = [], []
        tag = ("yt" if yt else "fs") + "".join(c for c in sid if c.isalnum())
        for n, it in enumerate(its, 1):
            name = f"{T['folder']}/{tag}-{n}.wav"
            write_wav(f"{C}/{name}", it["y"])
            f = it["f"]
            files.append(name)
            info.append(dict(t=round(it["a"] / SR + it["trimmed"], 2), dur=round(len(it["y"]) / SR, 2), snr=round(f["snr"]), cen=round(f["cen"]), rises=round(f["rises"]), flags=it["flags"]))
        entries.append(dict(toy=f"r3:{tkey}", id=tag, title=m["title"], author=m["author"], license="Creative Commons 0" if not yt else "CC BY 3.0 (YouTube)", page=m["page"], auto=True,
                            why=f"자동 선택 · 원본 {', '.join(str(i['t']) for i in info)} 초 · 미청취", clips=files, clipInfo=info))
    return entries


def build_crumbs(report):
    vid = "bExGHkTQmo4"
    x = bp.load(f"youtube-cc/choco/{vid}.wav")
    noise = bp.noise_profile(x)
    cands = window_cands(x, 0.6, onset=True, rise=3.0, above=12.0)
    ok = []
    for a, f in cands:
        head = x[a:a + int(0.05 * SR)]
        S = np.abs(np.fft.rfft(head * np.hanning(len(head)))) + 1e-9
        flat = float(np.exp(np.log(S).mean()) / S.mean())
        if f["clip"] or f["snr"] < 18 or flat < 0.025 or f["cen"] < 900 or f["low"] > 0.75:
            continue
        f["flat"] = flat
        ok.append((a, f))
    chosen, rej2 = pick_processed(x, noise, ok, lambda f: f["snr"] / 40 + f["flat"] * 6, 14, 0.6, 0.3, taken=CRUMB_SEEN, gap=0.45, taken_gap=0.3)
    items = []
    for a, f, y, trimmed in chosen:
        items.append(dict(score=f["snr"] + f["flat"] * 100, a=a, f=f, y=y, trimmed=trimmed))
    kept, dup = dedupe(items)
    kept.sort(key=lambda i: i["a"])
    report["W02:crumbs"] = dict(windows=len(cands), passing=len(ok), chosen=len(chosen), rejectedAfterCut=rej2, duplicatesDropped=dup)
    files, info = [], []
    for n, it in enumerate(kept, 1):
        name = f"crumbs/yt{vid}-{n}.wav"
        write_wav(f"{C}/{name}", it["y"])
        files.append(name)
        info.append(dict(t=round(it["a"] / SR + it["trimmed"], 2), dur=round(len(it["y"]) / SR, 2), snr=round(it["f"]["snr"]), cen=round(it["f"]["cen"]), rises=round(it["f"]["rises"]), flags=[]))
    return [dict(toy="r3:W02", id=f"yt{vid}", title="Chocolate ASMR | Breaking, Cutting & Melting Chocolate (현재 크럼 원본)", author="ramit girdhar", license="CC BY 3.0 (YouTube)",
                 page=f"https://www.youtube.com/watch?v={vid}", auto=True, why=f"자동 선택 · 영상 내 {', '.join(str(i['t']) for i in info)} 초 · 채택 3개와 이전 후보 10개는 제외 · 미청취", clips=files, clipInfo=info)]


def main():
    exp = os.environ.get("FFMPEG_SHA256")
    if exp and sha(FFMPEG) != exp:
        sys.exit("ffmpeg sha256 mismatch")
    if not os.path.isdir(C):
        sys.exit(f"{C} does not exist")
    only = {t for t in os.environ.get("R3_ONLY", "").split(",") if t}   # e.g. R3_ONLY=W02 regenerates just that toy, the rest stays
    want = lambda t: not only or t in only
    idx = json.load(open(C + "/index.json"))
    old = [e for e in idx if e["toy"].startswith("r3:") and want(e["toy"][3:])]
    for e in old:                                  # re-runnable: remove the files this script wrote before
        for f in e["clips"]:
            if f.split("/")[0] in ("mango", "cream", "crumbs") and os.path.exists(f"{C}/{f}"):
                os.remove(f"{C}/{f}")
    idx = [e for e in idx if e not in old]
    rp = C + "/r3-report.json"
    report = json.load(open(rp)) if only and os.path.exists(rp) else {}
    for k in [k for k in report if only and k.split(":")[0] in only]:
        del report[k]
    new = []
    if want("L02"): new += build_freesound_target("L02", L02_IDS, report)
    if want("L03"): new += build_freesound_target("L03", L03_IDS, report)
    if want("W02"): new += build_crumbs(report)
    idx += new
    json.dump(idx, open(C + "/index.json", "w"), ensure_ascii=False, indent=1)
    json.dump(report, open(rp, "w"), ensure_ascii=False, indent=1)
    for t in ("r3:L02", "r3:L03", "r3:W02"):
        es = [e for e in idx if e["toy"] == t]
        print(f"{t}: {len(es)} sources, {sum(len(e['clips']) for e in es)} clips")
    for k, v in report.items():
        print(" ", k, json.dumps(v, ensure_ascii=False))


if __name__ == "__main__":
    main()
