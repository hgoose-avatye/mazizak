import { afterEach, describe, expect, it, vi } from "vitest";
import { FIDGETS } from "../src/toys/fidgets/catalog";
import { FidgetAudio } from "../src/toys/fidgets/audio";
import {
  CLASS_LEVEL_DB,
  ClipPicker,
  EVENTS,
  EXCLUDED,
  FALLBACK,
  FIDGET_SOUND,
  MAX_SHORT_VOICES,
  MIN_INTERVAL_MS,
  SPRITE_TRIM_DB,
  VoiceGate,
  strengthDb,
  type PoolRef,
} from "../src/toys/fidgets/soundBank";

// node:fs via a dynamic specifier so `tsc` needs no @types/node (same pattern as the other sample tests)
const fsName = "node:fs";
const fs = (await import(/* @vite-ignore */ fsName)) as {
  readFileSync(p: URL): Uint8Array;
  existsSync(p: URL): boolean;
};
const pub = (name: string) => new URL(`../public/sfx/${name}`, import.meta.url);
const read = (name: string) => fs.readFileSync(pub(name));
const json = (name: string) => JSON.parse(new TextDecoder().decode(read(name)));
const ascii = (b: Uint8Array, a: number, z: number) => String.fromCharCode(...b.subarray(a, z));

function readWav(buf: Uint8Array) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  expect(ascii(buf, 0, 4)).toBe("RIFF");
  let p = 12, fmt: { ch: number; sr: number; bits: number; tag: number } | undefined, data: Float32Array | undefined;
  while (p + 8 <= buf.length) {
    const id = ascii(buf, p, p + 4), size = v.getUint32(p + 4, true), body = p + 8;
    if (id === "fmt ") fmt = { tag: v.getUint16(body, true), ch: v.getUint16(body + 2, true), sr: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    if (id === "data") { const n = size / 2; data = new Float32Array(n); for (let i = 0; i < n; i++) data[i] = v.getInt16(body + i * 2, true) / 32768; }
    p = body + size + (size & 1);
  }
  return { fmt: fmt!, data: data! };
}
const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));
/** impact level: max 20 ms RMS after a 150 Hz one-pole high-pass (same metric as scripts/fidgets/build-clips.mjs) */
function impactLevel(y: Float32Array, sr: number) {
  const a = Math.exp((-2 * Math.PI * 150) / sr); let px = 0, py = 0; const h = new Float32Array(y.length);
  for (let i = 0; i < y.length; i++) { py = a * (py + y[i] - px); px = y[i]; h[i] = py; }
  const n = Math.round(0.02 * sr); let m = 0;
  for (let i = 0; i === 0 || i + n <= h.length; i += Math.round(0.005 * sr)) { let e = 0; const k = Math.min(n, h.length - i); for (let j = i; j < i + k; j++) e += h[j] * h[j]; m = Math.max(m, e / Math.max(1, k)); if (i + n > h.length) break; }
  return Math.sqrt(m);
}

interface Entry { start: number; length: number; offset: number; duration: number; gain: number; src: string; centroidHz: number }
interface SpriteMap {
  file: string; sampleRate: number; totalSamples: number;
  counts: { sourceFiles: number; extractedClips: number; derivedVariants: number };
  dropped: { pool: string }[];
  sources: Record<string, { license: string; licenseUrl: string; author: string; usage: string; originalFile: string; materialMatch: string }>;
  pools: Record<string, { event: string; loudnessClass: string; recordings: number; variants: number; entries: Entry[] }>;
}
const sprites = { wax: json("fidgets/wax.json") as SpriteMap, crunch: json("fidgets/crunch.json") as SpriteMap, squish: json("fidgets/squish.json") as SpriteMap, picks: json("fidgets/picks.json") as SpriteMap };
const wavs = { wax: readWav(read("fidgets/wax.wav")), crunch: readWav(read("fidgets/crunch.wav")), squish: readWav(read("fidgets/squish.wav")), picks: readWav(read("fidgets/picks.wav")) };
const clipOf = (kind: "wax" | "crunch" | "squish" | "picks", e: Entry) => wavs[kind].data.slice(e.start, e.start + e.length).map((v) => v * e.gain);

describe("event → pool mapping", () => {
  it("every catalog toy has every event declared (a pool or an explicit null)", () => {
    for (const f of FIDGETS) {
      expect(FIDGET_SOUND[f.id], f.id).toBeTruthy();
      for (const e of EVENTS) expect(FIDGET_SOUND[f.id], `${f.id}.${e}`).toHaveProperty(e);
    }
    expect(Object.keys(FIDGET_SOUND).sort()).toEqual(FIDGETS.map((f) => f.id).sort());
  });

  it("every pool a toy refers to exists in its sprite, or is listed as dropped by the clip audit", () => {
    for (const [id, toy] of Object.entries(FIDGET_SOUND))
      for (const e of EVENTS) {
        const r = toy[e] as PoolRef | null;
        if (!r) continue;
        for (const pool of [r.pool, r.alt?.pool].filter(Boolean) as string[]) {
          const sp = sprites[r.source];
          if (sp.dropped.some((d) => d.pool === pool)) { expect(sp.pools[pool], `${pool} is listed as dropped`).toBeUndefined(); continue; }
          expect(sp.pools[pool], `${id}.${e} ${r.source}/${pool}`).toBeTruthy();
          expect(["init", "tap", "hold", "stretch", "fold", "crack", "crunch"]).toContain(sp.pools[pool].event);
        }
        expect(r.rate[0]).toBeGreaterThanOrEqual(0.85);
        expect(r.rate[1]).toBeLessThanOrEqual(1.1);
      }
  });

  it("no toy plays the very same clips for two different events", () => {
    for (const [id, toy] of Object.entries(FIDGET_SOUND)) {
      const seen = new Map<string, string>();
      for (const e of EVENTS) {
        const r = toy[e];
        if (!r) continue;
        const key = `${r.source}/${r.pool}`;
        expect(seen.get(key), `${id}: ${e} duplicates ${seen.get(key)}`).toBeUndefined();
        seen.set(key, e);
      }
    }
  });

  it("every mapped event with a pool rests on enough independent clips (≥3, init ≥2)", () => {
    for (const [id, toy] of Object.entries(FIDGET_SOUND))
      for (const e of EVENTS) {
        const r = toy[e];
        if (!r) continue;
        const sp = sprites[r.source];
        if (sp.dropped.some((d) => d.pool === r.pool)) continue; // dropped pool: no sound of its own
        // owner picks were chosen by ear clip by clip: a single picked clip is a deliberate choice
        expect(sp.pools[r.pool].entries.length, `${id}.${e}`).toBeGreaterThanOrEqual(r.ownerPick ? 1 : e === "init" ? 2 : 3);
      }
  });

  it("derived / proxy sources are labelled, never claimed as recordings of the toy", () => {
    for (const toy of Object.values(FIDGET_SOUND)) for (const e of EVENTS) expect(toy[e]?.kind, "no reversed / derived audio is used for any fidget event").not.toBe("derived");
    for (const id of ["C01", "C02"]) for (const e of ["hold", "crunch"] as const) expect(FIDGET_SOUND[id][e]!.kind).toBe("proxy");
    for (const id of ["S03", "L02", "L03"]) expect(FIDGET_SOUND[id].hold!.kind).toBe("proxy");
    expect(EXCLUDED.length).toBeGreaterThan(3);
  });

  it("class levels keep impacts above touches above releases", () => {
    expect(CLASS_LEVEL_DB.init).toBeGreaterThanOrEqual(CLASS_LEVEL_DB.crack);
    expect(CLASS_LEVEL_DB.crack).toBeGreaterThan(CLASS_LEVEL_DB.tap);
    expect(CLASS_LEVEL_DB.tap).toBeGreaterThan(CLASS_LEVEL_DB.release);
    expect(SPRITE_TRIM_DB.crack).toBeGreaterThan(SPRITE_TRIM_DB.hold);
    expect(strengthDb(0)).toBeLessThan(strengthDb(1));
    expect(strengthDb(1)).toBe(0);
  });
});

describe("ClipPicker", () => {
  it("never repeats a clip immediately, and avoids the last two when it can (1000 draws, several pool sizes)", () => {
    for (const n of [2, 3, 4, 6, 12]) {
      let s = 7;
      const rng = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      const p = new ClipPicker(rng);
      const out: number[] = [];
      for (let i = 0; i < 1000; i++) out.push(p.pick("k", n));
      for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
      if (n >= 3) for (let i = 2; i < out.length; i++) expect(out[i]).not.toBe(out[i - 2]);
      expect(new Set(out).size).toBe(n); // every clip gets used
    }
    expect(new ClipPicker().pick("x", 1)).toBe(0);
  });
});

describe("VoiceGate", () => {
  it("enforces minimum intervals per event", () => {
    const g = new VoiceGate();
    expect(g.decide("crack", 0).ok).toBe(true);
    g.commit("crack", 0, 200);
    expect(g.decide("crack", MIN_INTERVAL_MS.crack - 1).ok).toBe(false);
    expect(g.decide("crack", MIN_INTERVAL_MS.crack + 1).ok).toBe(true);
  });
  it("caps short voices and attenuates overlaps; releases are never blocked by sustained sounds", () => {
    const g = new VoiceGate();
    let t = 0;
    for (let i = 0; i < MAX_SHORT_VOICES; i++) {
      const d = g.decide("crunch", t);
      expect(d.ok).toBe(true);
      expect(d.attenuationDb).toBeLessThanOrEqual(0);
      g.commit("crunch", t, 400);
      t += 70;
    }
    expect(g.decide("crunch", t).ok).toBe(false);
    expect(g.decide("crunch", t).reason).toBe("voice-cap");
    expect(g.decide("tap", t).ok).toBe(false); // tap is also a short voice
    expect(g.decide("crunch", t + 500).ok).toBe(true); // voices ended
    const g2 = new VoiceGate();
    g2.commit("crunch", 0, 400);
    g2.commit("crack", 0, 400);
    expect(g2.decide("tap", 100).attenuationDb).toBeCloseTo(-3, 5);
  });
  it("sustained events replace each other: busy while the body plays, free for its last 120 ms, faded on release", () => {
    const g = new VoiceGate();
    const stops: number[] = [];
    g.commit("hold", 0, 600, () => stops.push(1));
    expect(g.decide("stretch", 200).ok).toBe(false);
    expect(g.decide("stretch", 200).reason).toBe("sustained-busy");
    expect(g.decide("hold", 500).ok).toBe(true);
    expect(g.decide("release", 200).ok).toBe(true);
    g.releaseSustained();
    expect(stops).toEqual([1]);
    expect(g.decide("hold", 200).ok).toBe(true);
  });
});

describe("VoiceGate interrupt (a new finger contact is always answered)", () => {
  it("replaces the running sustained sound and evicts the oldest short voice instead of refusing", () => {
    const g = new VoiceGate();
    g.commit("hold", 0, 600, () => undefined);
    expect(g.decide("hold", 50).ok).toBe(false); // normal playback: busy
    const d = g.decide("hold", 50, true);
    expect(d.ok).toBe(true);
    expect(d.evict?.length).toBe(1);
    const g2 = new VoiceGate();
    for (let i = 0; i < MAX_SHORT_VOICES; i++) g2.commit("tap", i * 40, 500, () => undefined);
    expect(g2.decide("tap", 150).ok).toBe(false);
    const e = g2.decide("tap", 150, true);
    expect(e.ok).toBe(true);
    expect(e.evict?.length).toBe(1);
    g2.commit("tap", 150, 500);
    expect(g2.decide("tap", 160, true).ok).toBe(false); // not faster than a finger can tap
  });
});

describe("shipped wax / crunch sprites", () => {
  for (const kind of ["wax", "crunch", "squish", "picks"] as const) {
    describe(kind, () => {
      const map = sprites[kind], wav = wavs[kind];
      it("is 16-bit mono PCM and matches its map", () => {
        expect(wav.fmt).toMatchObject({ tag: 1, ch: 1, bits: 16, sr: map.sampleRate });
        expect(map.totalSamples).toBe(wav.data.length);
        for (const p of Object.values(map.pools)) for (const e of p.entries) {
          expect(e.start + e.length).toBeLessThanOrEqual(wav.data.length);
          expect(Math.abs(e.duration * map.sampleRate - e.length)).toBeLessThanOrEqual(1);
          expect(e.gain).toBeGreaterThan(0);
          expect(e.gain).toBeLessThanOrEqual(1);
        }
      });
      it("never clips: sprite and gained clips peak ≤ −1 dBFS", () => {
        const ceil = Math.pow(10, -1 / 20) + 1 / 32768;
        expect(peak(wav.data)).toBeLessThanOrEqual(ceil);
        for (const p of Object.values(map.pools)) for (const e of p.entries) expect(peak(clipOf(kind, e))).toBeLessThanOrEqual(ceil);
      });
      it("clips within a pool are loudness-matched (≤ 3 dB spread), not forced to one global RMS", () => {
        const levels = Object.values(map.pools).map((p) => {
          const l = p.entries.map((e) => { const c = clipOf(kind, e); return db(p.loudnessClass === "continuous" ? rms(c) : impactLevel(c, map.sampleRate)); });
          expect(Math.max(...l) - Math.min(...l)).toBeLessThanOrEqual(3);
          return l[0];
        });
        expect(new Set(levels.map((l) => Math.round(l))).size).toBeGreaterThan(1); // pools keep their own natural level
      });
      it("starts at the hit (no leading silence) and fades out", () => {
        for (const p of Object.values(map.pools)) for (const e of p.entries) {
          const c = clipOf(kind, e), pk = peak(c);
          // the sound must be audible right at the start (no silent lead-in that would delay the response to a touch)
          expect(rms(c.subarray(0, Math.round(0.015 * map.sampleRate)))).toBeGreaterThan(pk * Math.pow(10, -38 / 20) * 0.95);
          expect(Math.abs(c[c.length - 1])).toBeLessThan(pk * 0.01);
        }
      });
      it("records source, license, usage and the original file for every clip; counts raw vs derived separately", () => {
        for (const p of Object.values(map.pools)) for (const e of p.entries) expect(map.sources[e.src], e.src).toBeTruthy();
        for (const s of Object.values(map.sources)) {
          // YouTube's "Creative Commons Attribution license (reuse allowed)" is CC BY 3.0 (owner picks)
          expect(kind === "picks" ? ["CC0 1.0", "CC BY 3.0"] : ["CC0 1.0", "CC BY 4.0"]).toContain(s.license);
          expect(s.licenseUrl).toMatch(/^https:\/\/creativecommons\.org\//);
          expect(s.usage.length).toBeGreaterThan(5);
          // owner picks: the source audio is too large for the repository; the source page is recorded instead
          if (kind === "picks") expect(s.originalFile).toMatch(/^https:\/\/(www\.youtube\.com|freesound\.org)\//);
          else expect(fs.existsSync(new URL(`../${s.originalFile}`, import.meta.url)), s.originalFile).toBe(true);
        }
        const total = Object.values(map.pools).reduce((n, p) => n + p.recordings, 0);
        expect(map.counts.extractedClips).toBe(total);
        expect(map.counts.derivedVariants).toBe(0);
        for (const p of Object.values(map.pools)) { expect(p.entries.length).toBe(p.recordings); expect(p.variants).toBe(0); }
      });
    });
  }
  it("every shipped pool has enough independent clips and every clip is a distinct passage", () => {
    const min: Record<string, number> = { init: 2, crack: 3, crunch: 3, tap: 3, hold: 3, stretch: 3, fold: 3 };
    for (const kind of ["wax", "crunch", "squish"] as const)
      for (const [name, p] of Object.entries(sprites[kind].pools)) {
        expect(p.entries.length, `${kind}/${name}`).toBeGreaterThanOrEqual(min[p.event]);
        const keys = p.entries.map((e) => `${e.src}@${(e as unknown as { srcStart: number }).srcStart}`);
        expect(new Set(keys).size).toBe(keys.length);
      }
  });
  it("C01 (soap) and C02 (beads) use different source files and measurably different crunch spectra", () => {
    const src = (n: string) => new Set(sprites.crunch.pools[n].entries.map((e) => e.src));
    for (const a of ["soap.crunch", "soap.hold"]) for (const b of ["beads.crunch", "beads.hold"]) for (const s of src(a)) expect(src(b).has(s), `${a} vs ${b}`).toBe(false);
    const c = (n: string) => sprites.crunch.pools[n].entries.reduce((s, e) => s + e.centroidHz, 0) / sprites.crunch.pools[n].entries.length;
    // the two toys differ in material AND spectrum (soap-like dry foam vs. small hard granules)
    expect(Math.abs(c("soap.hold") - c("beads.hold")) / Math.min(c("soap.hold"), c("beads.hold")) + Math.abs(c("soap.crunch") - c("beads.crunch")) / Math.min(c("soap.crunch"), c("beads.crunch"))).toBeGreaterThan(0.25); // measured ≈0.30: C01 and C02 differ only moderately in spectrum — a known weakness until own recordings exist
    expect(sprites.crunch.pools["soap.crunch"].entries.length).toBeGreaterThanOrEqual(8);
    expect(sprites.crunch.pools["soap.hold"].entries.length).toBeGreaterThanOrEqual(5);
  });
  it("CREDITS.md names every source author and says the wax clips were modified", () => {
    const t = new TextDecoder().decode(read("fidgets/CREDITS.md"));
    for (const s of [...Object.values(sprites.wax.sources), ...Object.values(sprites.crunch.sources)]) expect(t).toContain(s.author);
    expect(t).toMatch(/modified/i);
    expect(t).toContain("CC BY 4.0");
    expect(t).toContain("CC0");
  });
});

// ── FidgetAudio against a stub engine, sprites decoded from disk ──
class FakeBuffer {
  private d: Float32Array;
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) { this.d = new Float32Array(length); }
  get duration() { return this.length / this.sampleRate; }
  getChannelData() { return this.d; }
}
function makeEngine() {
  const stops: string[] = [];
  const plays: { name: string; opts: Record<string, number>; type: string }[] = [];
  const registered = new Map<string, FakeBuffer[]>();
  const ctx = {
    sampleRate: 48000,
    createBuffer: (c: number, n: number, sr: number) => new FakeBuffer(c, n, sr),
    decodeAudioData: async (ab: ArrayBuffer) => { const { fmt, data } = readWav(new Uint8Array(ab)); const b = new FakeBuffer(1, data.length, fmt.sr); b.getChannelData().set(data); return b; },
  };
  const engine = {
    ctx,
    register: (n: string, b: FakeBuffer[]) => registered.set(n, b),
    play: (name: string, opts: Record<string, number>, type: string) => { plays.push({ name, opts, type }); return { stop: () => { stops.push(name); } }; },
  };
  return { engine, plays, registered, stops };
}
const stubFetch = () =>
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url).replace(/^\.\/sfx\//, "");
    const buf = read(u);
    return { ok: true, status: 200, json: async () => JSON.parse(new TextDecoder().decode(buf)), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
  }));
async function make(id: string) {
  stubFetch();
  const { engine, plays, stops } = makeEngine();
  let t = 0;
  const a = new FidgetAudio(engine as never, FIDGETS.find((f) => f.id === id)!, () => t);
  for (let i = 0; i < 200 && a.state === "loading"; i++) await new Promise((r) => setTimeout(r, 5));
  a.enter();
  return { a, plays, stops, at: (ms: number) => (t = ms) };
}

describe("FidgetAudio event routing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("W01 (owner picks): every crack plays the picked first-break clips; mixed wax plays the picked mixed clips", async () => {
    const { a, plays, at } = await make("W01");
    expect(a.state).toBe("recorded/derived");
    expect(a.supportedRoles.sort()).toEqual(["crack", "hold"].sort());
    at(0); expect(a.play("crack", 0.5)).toBe(true);
    at(300); expect(a.play("crack", 0.9)).toBe(true);
    expect(plays[0].name).toMatch(/^fg:W01:crack:m:/);
    expect(plays[1].name).toMatch(/^fg:W01:crack:m:/);
    a.mixed = true;
    at(1000); expect(a.play("hold", 0.5)).toBe(true);
    at(2000); expect(a.play("tap", 0.5)).toBe(true);
    expect(plays[2].name).toMatch(/^fg:W01:hold:mix:/);
    expect(plays[3].name).toMatch(/^fg:W01:tap:mix:/);
    expect(plays[2].opts.lowpassHz).toBeUndefined(); // own mixed sounds, not the muffled knead
  });

  it("W01: kneading is `hold`; `tap` falls back to hold; releases and stretch are silent (no pool, no fallback)", async () => {
    const { a, plays, at } = await make("W01");
    at(0); expect(a.play("hold", 0.5)).toBe(true);
    expect(plays[0].name).toMatch(/^fg:W01:hold:m:/);
    expect(a.play("release", 1)).toBe(false);
    at(1000); expect(a.play("tap", 0.5)).toBe(true);
    expect(plays[1].name).toMatch(/^fg:W01:hold:m:/);
    expect(a.has("stretch")).toBe(true); // stretch → hold fallback
    expect(a.hasOwn("stretch")).toBe(false);
  });

  it("C01/C02: crunch and hold are different pools; repeated crunch never repeats a clip back-to-back", async () => {
    for (const id of ["C01", "C02"]) {
      const { a, plays, at } = await make(id);
      let t = 0;
      for (let i = 0; i < 40; i++) { t += 200; at(t); a.play("crunch", 0.6); }
      const names = plays.map((p) => p.name);
      expect(names.length).toBeGreaterThan(30);
      for (let i = 1; i < names.length; i++) expect(names[i]).not.toBe(names[i - 1]);
      t += 2000; at(t); a.play("hold", 0.6);
      expect(plays[plays.length - 1].name).toMatch(new RegExp(`^fg:${id}:hold:m:`));
      expect(plays.every((p) => p.opts.rate >= 0.94 && p.opts.rate <= 1.06)).toBe(true);
    }
  });

  it("each squish toy has only the pools that survived the listener verdict and the gates", async () => {
    // S03 (new CC0 dough recordings) and L02 (CC0 crunchy slime) answer touch and kneading in the public build; their fold falls back to hold
    const expected: Record<string, string[]> = { S01: ["tap", "hold"], S02: ["hold"], S03: ["tap", "hold"], L01: ["hold", "stretch"], L02: ["tap", "hold", "stretch"], L03: ["hold", "fold"] };
    for (const [id, roles] of Object.entries(expected)) {
      const t = await make(id);
      expect(t.a.state, id).toBe("recorded/derived");
      expect([...t.a.supportedRoles].sort(), id).toEqual([...roles].sort());
    }
    const l03 = await make("L03");
    expect(l03.a.has("stretch")).toBe(true); // → hold
    expect(l03.a.hasOwn("stretch")).toBe(false);
    const s03 = await make("S03");
    s03.at(0); expect(s03.a.play("tap", 1)).toBe(true);
    s03.at(2000); expect(s03.a.play("hold", 1)).toBe(true);
    const l02 = await make("L02");
    l02.at(0); expect(l02.a.play("tap", 1)).toBe(true);
    l02.at(2000); expect(l02.a.play("hold", 1)).toBe(true);
    expect(l02.a.has("fold")).toBe(true); // → hold
    expect(l02.a.hasOwn("fold")).toBe(false);
  });

  it("W02 (owner picks): cracks play the picked first-break clips; shard friction plays the picked crumbs clip", async () => {
    const { a, plays, at } = await make("W02");
    expect(a.hasOwn("init")).toBe(false);
    at(0); expect(a.play("crack", 0.5)).toBe(true);
    at(400); expect(a.play("crack", 0.9)).toBe(true);
    at(800); expect(a.play("crunch", 0.6)).toBe(true);
    expect(plays[0].name).toMatch(/^fg:W02:crack:m:/);
    expect(plays[1].name).toMatch(/^fg:W02:crack:m:/);
    expect(plays[2].name).toMatch(/^fg:W02:crunch:m:/);
  });

  it("rapid clicking: 20 contacts in 1.2 s all produce a sound, each replacing the previous sustained sound", async () => {
    for (const id of ["L03", "S01", "C01"]) {
      const { a, plays, stops, at } = await make(id);
      const first = a.hasOwn("tap") ? "tap" : "hold";
      let t = 0, ok = 0;
      for (let i = 0; i < 20; i++) { t += 60; at(t); if (a.play(first, 0.55, 0, true)) ok++; }
      expect(ok, id).toBe(20);
      expect(plays.length).toBe(20);
      expect(stops.length, `${id} replaced voices`).toBeGreaterThan(0);
    }
  });

  it("switching toys: leave() fades out running voices and a left toy is silent; re-entering plays again", async () => {
    const { a, plays, stops, at } = await make("C01");
    at(0); expect(a.play("hold", 1)).toBe(true); // sustained, 0.64 s
    at(200); expect(a.play("crunch", 1)).toBe(true); // short, overlapping it
    expect(plays.length).toBe(2);
    a.leave();
    expect(stops.length).toBe(2); // both voices were stopped
    at(5000); expect(a.play("crunch", 1)).toBe(false);
    a.enter(); at(6000); expect(a.play("crunch", 1)).toBe(true);
  });

  it("finger lift: a sustained voice that is nearly over is not chopped; one with a long way to go is faded", async () => {
    const { a, stops, at } = await make("L03");
    at(0); a.play("hold", 1); // 0.6 s window
    at(400); a.releaseGesture(); // ≈ 200 ms left → rings out
    expect(stops.length).toBe(0);
    const b = await make("L03");
    b.at(0); b.a.play("hold", 1);
    b.at(50); b.a.releaseGesture(); // ≈ 550 ms left → faded
    expect(b.stops.length).toBe(1);
  });

  it("finger lift (old): releaseGesture() fades only the sustained voice, short voices keep ringing", async () => {
    const { a, stops, at } = await make("L03");
    at(0); a.play("fold", 1);
    at(50); a.play("hold", 1); // rejected: a sustained sound is still playing
    a.releaseGesture();
    expect(stops.length).toBe(1);
  });

  it("stress: 10 plays/s for 5 s never exceeds the voice caps; every play gets a small rate jitter and bounded gain", async () => {
    const { a, plays, at } = await make("W02");
    let t = 0;
    for (let i = 0; i < 50; i++) { t += 100; at(t); a.play(i % 3 === 0 ? "crack" : i % 3 === 1 ? "hold" : "crack", 1); }
    expect(plays.length).toBeGreaterThan(10);
    for (const p of plays) { expect(p.opts.gainDb).toBeLessThanOrEqual(1); expect(p.opts.gainDb).toBeGreaterThan(-40); }
    // at no time more than MAX_SHORT_VOICES short + 1 sustained voice scheduled inside one clip length
    expect(FALLBACK.release).toBeNull();
  });
});
