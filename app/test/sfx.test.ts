import { describe, expect, it } from 'vitest';
import { buildKeyboardSounds, buildSquishySounds, SFX_NOTES, type KeySwitchPreset } from '../src/audio/sfx';

// ── minimal BaseAudioContext shim (only createBuffer + sampleRate are used) ──
class FakeBuffer {
  readonly numberOfChannels: number;
  private readonly data: Float32Array[];
  constructor(
    ch: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.numberOfChannels = ch;
    this.data = Array.from({ length: ch }, () => new Float32Array(length));
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(c: number) {
    return this.data[c];
  }
}
const makeCtx = (sampleRate = 48000) =>
  ({ sampleRate, createBuffer: (c: number, n: number, sr: number) => new FakeBuffer(c, n, sr) }) as unknown as BaseAudioContext;

// ── analysis helpers ──
const ch = (b: AudioBuffer) => b.getChannelData(0);
const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const db = (v: number) => 20 * Math.log10(v);
function onsetMs(x: Float32Array, sr: number) {
  const th = peak(x) * 0.05; // -26 dB re peak
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > th) return (i / sr) * 1000;
  return Infinity;
}
function corr(a: Float32Array, b: Float32Array) {
  const n = Math.min(a.length, b.length);
  let ab = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < n; i++) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return ab / Math.sqrt(aa * bb || 1);
}
/** power spectrum via radix-2 FFT (zero-padded) */
function power(x: Float32Array): Float64Array {
  let n = 1;
  while (n < x.length) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(x);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(a * k),
          s = Math.sin(a * k);
        const ur = re[i + k],
          ui = im[i + k];
        const vr = re[i + k + len / 2] * c - im[i + k + len / 2] * s;
        const vi = re[i + k + len / 2] * s + im[i + k + len / 2] * c;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
      }
  }
  const p = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) p[i] = re[i] * re[i] + im[i] * im[i];
  return p;
}
function spectrum(x: Float32Array, sr: number) {
  const p = power(x);
  const hz = sr / 2 / p.length;
  let tot = 0,
    wsum = 0,
    below1k = 0;
  for (let i = 0; i < p.length; i++) {
    tot += p[i];
    wsum += p[i] * i * hz;
    if (i * hz < 1000) below1k += p[i];
  }
  return { centroid: wsum / tot, below1k: below1k / tot };
}
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

const SR = 48000;
const ctx = makeCtx(SR);
const t0 = performance.now();
const kb: Record<KeySwitchPreset, ReturnType<typeof buildKeyboardSounds>> = {
  pebble: buildKeyboardSounds(ctx, 'pebble'),
  clack: buildKeyboardSounds(ctx, 'clack'),
};
const t1 = performance.now();
const sq = buildSquishySounds(ctx);
const t2 = performance.now();

const sets: Record<string, AudioBuffer[]> = {};
for (const p of ['pebble', 'clack'] as const)
  for (const k of ['down', 'up', 'spaceDown', 'spaceUp'] as const) sets[`${p}.${k}`] = kb[p][k];
sets['squishy.press'] = sq.press;
sets['squishy.pressHard'] = sq.pressHard;
sets['squishy.release'] = sq.release;
const loops = { 'squishy.friction': sq.friction, 'squishy.stretch': sq.stretch };

describe('sfx generation', () => {
  it('reports metrics and generation time', () => {
    const rows = Object.entries({ ...sets, ...Object.fromEntries(Object.entries(loops).map(([k, v]) => [k, [v]])) }).map(
      ([name, bufs]) => {
        const xs = bufs.map(ch);
        return {
          set: name,
          n: bufs.length,
          durMs: Math.round(mean(bufs.map((b) => b.duration * 1000))),
          peakDb: +db(Math.max(...xs.map(peak))).toFixed(1),
          rmsDb: +db(mean(xs.map(rms))).toFixed(1),
          centroidHz: Math.round(mean(xs.map((x) => spectrum(x, SR).centroid))),
          below1k: +mean(xs.map((x) => spectrum(x, SR).below1k)).toFixed(2),
        };
      },
    );
    console.table(rows);
    console.log(`gen: keyboard×2 ${(t1 - t0).toFixed(1)} ms, squishy ${(t2 - t1).toFixed(1)} ms`);
    // one preset + squishy, measured separately
    const a = performance.now();
    buildKeyboardSounds(makeCtx(48000), 'clack');
    buildSquishySounds(makeCtx(48000));
    const ms = performance.now() - a;
    console.log(`gen (warm): one preset + squishy = ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(400); // generous for CI; target < 120 ms on desktop
    expect(SFX_NOTES.length).toBeGreaterThan(50);
  });

  it('has the required variant counts', () => {
    for (const p of ['pebble', 'clack'] as const) {
      expect(kb[p].down.length).toBeGreaterThanOrEqual(10);
      expect(kb[p].up.length).toBeGreaterThanOrEqual(8);
      expect(kb[p].spaceDown.length).toBeGreaterThanOrEqual(5);
      expect(kb[p].spaceUp.length).toBeGreaterThanOrEqual(4);
    }
    for (const k of ['press', 'pressHard', 'release'] as const) expect(sq[k].length).toBeGreaterThanOrEqual(6);
  });

  it('is deterministic', () => {
    const again = buildKeyboardSounds(makeCtx(SR), 'pebble');
    expect(ch(again.down[3])).toEqual(ch(kb.pebble.down[3]));
  });

  for (const [name, bufs] of Object.entries(sets)) {
    it(`${name}: finite, peak ≤ -3 dBFS, onset < 1 ms, clean tail, distinct variants`, () => {
      for (const b of bufs) {
        const x = ch(b);
        expect(b.numberOfChannels).toBe(1);
        expect(x.every(Number.isFinite)).toBe(true);
        const p = peak(x);
        expect(p).toBeLessThanOrEqual(0.7080);
        expect(p).toBeGreaterThan(0.1);
        expect(onsetMs(x, SR)).toBeLessThan(1);
        // ends silently (no click): last sample ~0, last 2 ms tiny
        expect(Math.abs(x[x.length - 1])).toBeLessThan(1e-3);
        expect(peak(x.subarray(x.length - Math.floor(0.002 * SR)))).toBeLessThan(p * 0.02);
      }
      for (let i = 0; i < bufs.length; i++)
        for (let j = i + 1; j < bufs.length; j++) expect(Math.abs(corr(ch(bufs[i]), ch(bufs[j])))).toBeLessThan(0.98);
    });
  }

  it('durations are sane', () => {
    for (const p of ['pebble', 'clack'] as const) {
      for (const b of kb[p].down) expect(b.duration * 1000).toBeGreaterThanOrEqual(50), expect(b.duration * 1000).toBeLessThanOrEqual(200);
      for (const b of kb[p].up) expect(b.duration).toBeLessThanOrEqual(0.2);
      for (const b of [...kb[p].spaceDown, ...kb[p].spaceUp]) expect(b.duration).toBeLessThanOrEqual(0.3);
    }
    for (const b of [...sq.press, ...sq.pressHard, ...sq.release]) expect(b.duration).toBeLessThanOrEqual(0.35);
    for (const b of Object.values(loops)) {
      expect(b.duration).toBeGreaterThanOrEqual(1);
      expect(b.duration).toBeLessThanOrEqual(2);
    }
  });

  it("timbre: clack is clearly brighter than pebble; pebble energy mostly < 1 kHz", () => {
    const c = (p: KeySwitchPreset) => mean(kb[p].down.map((b) => spectrum(ch(b), SR).centroid));
    expect(c('clack')).toBeGreaterThan(c('pebble') * 2.5);
    expect(c('clack')).toBeGreaterThan(2000);
    for (const b of kb.pebble.down) expect(spectrum(ch(b), SR).below1k).toBeGreaterThan(0.6);
    // spacebar is lower than a normal key
    for (const p of ['pebble', 'clack'] as const) {
      const sd = mean(kb[p].spaceDown.map((b) => spectrum(ch(b), SR).centroid));
      expect(sd).toBeLessThan(c(p));
    }
  });

  it('levels: key-up quieter than key-down; presets roughly RMS-matched', () => {
    const lv = (bufs: AudioBuffer[]) => mean(bufs.map((b) => rms(ch(b))));
    for (const p of ['pebble', 'clack'] as const) expect(lv(kb[p].up)).toBeLessThan(lv(kb[p].down));
    expect(lv(kb.clack.up) / lv(kb.clack.down)).toBeGreaterThan(lv(kb.pebble.up) / lv(kb.pebble.down)); // clacky upstroke louder
    expect(Math.abs(db(lv(kb.clack.down) / lv(kb.pebble.down)))).toBeLessThan(4);
    expect(lv(sq.pressHard)).toBeGreaterThan(lv(sq.press));
  });

  for (const [name, b] of Object.entries(loops)) {
    it(`${name}: seamless loop`, () => {
      const x = ch(b);
      expect(x.every(Number.isFinite)).toBe(true);
      expect(peak(x)).toBeLessThanOrEqual(0.708);
      let d = 0;
      for (let i = 1; i < x.length; i++) d += (x[i] - x[i - 1]) ** 2;
      const diffRms = Math.sqrt(d / (x.length - 1));
      // the wrap-around step is no bigger than a typical in-loop step
      expect(Math.abs(x[0] - x[x.length - 1])).toBeLessThan(4 * diffRms);
      // level continuity: 50 ms windows either side of the seam within 6 dB of each other
      const w = Math.floor(0.05 * SR);
      const head = rms(x.subarray(0, w));
      const tail = rms(x.subarray(x.length - w));
      expect(Math.abs(db(head / tail))).toBeLessThan(6);
      // zero-mean
      expect(Math.abs(x.reduce((s, v) => s + v, 0) / x.length)).toBeLessThan(1e-3);
    });
  }

  it('dumps WAVs when DUMP_WAV=1', async () => {
    const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined>; cwd(): string } }).process;
    if (!env?.env.DUMP_WAV) return;
    const fsName = 'node:fs';
    const fs = (await import(/* @vite-ignore */ fsName)) as {
      mkdirSync(p: string, o: object): void;
      writeFileSync(p: string, d: Uint8Array): void;
    };
    const dir = `${env.cwd()}/bench-out/sfx`;
    fs.mkdirSync(dir, { recursive: true });
    const wav = (x: Float32Array) => {
      const buf = new ArrayBuffer(44 + x.length * 2);
      const v = new DataView(buf);
      const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF');
      v.setUint32(4, 36 + x.length * 2, true);
      str(8, 'WAVEfmt ');
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, 1, true);
      v.setUint32(24, SR, true);
      v.setUint32(28, SR * 2, true);
      v.setUint16(32, 2, true);
      v.setUint16(34, 16, true);
      str(36, 'data');
      v.setUint32(40, x.length * 2, true);
      for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
      return new Uint8Array(buf);
    };
    const concat = (xs: Float32Array[], gap: number) => {
      const g = Math.floor(gap * SR);
      const out = new Float32Array(xs.reduce((s, x) => s + x.length + g, 0));
      let o = 0;
      for (const x of xs) {
        out.set(x, o);
        o += x.length + g;
      }
      return out;
    };
    for (const [name, bufs] of Object.entries(sets)) {
      bufs.forEach((b, i) => fs.writeFileSync(`${dir}/${name}.${String(i).padStart(2, '0')}.wav`, wav(ch(b))));
      fs.writeFileSync(`${dir}/_all.${name}.wav`, wav(concat(bufs.map(ch), 0.35)));
    }
    for (const [name, b] of Object.entries(loops)) {
      fs.writeFileSync(`${dir}/${name}.loop.wav`, wav(ch(b)));
      fs.writeFileSync(`${dir}/_all.${name}.x4.wav`, wav(concat([ch(b), ch(b), ch(b), ch(b)], 0)));
    }
    // typing demo: alternating down/up at ~9 keys/s for each preset
    for (const p of ['pebble', 'clack'] as const) {
      const out = new Float32Array(Math.floor(4 * SR));
      let t = 0.1;
      for (let k = 0; t < 3.6; k++) {
        const space = k % 7 === 6;
        const d = ch((space ? kb[p].spaceDown : kb[p].down)[k % (space ? kb[p].spaceDown.length : kb[p].down.length)]);
        const u = ch((space ? kb[p].spaceUp : kb[p].up)[k % (space ? kb[p].spaceUp.length : kb[p].up.length)]);
        const i0 = Math.floor(t * SR);
        const i1 = i0 + Math.floor((0.06 + 0.03 * ((k * 7) % 5) / 5) * SR);
        for (let i = 0; i < d.length && i0 + i < out.length; i++) out[i0 + i] += d[i];
        for (let i = 0; i < u.length && i1 + i < out.length; i++) out[i1 + i] += u[i];
        t += 0.09 + 0.06 * (((k * 13) % 7) / 7);
      }
      fs.writeFileSync(`${dir}/_demo.typing.${p}.wav`, wav(out));
    }
    console.log(`WAVs written to ${dir}`);
  });
});
