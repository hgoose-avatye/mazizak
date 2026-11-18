import { afterEach, expect, it, vi } from "vitest";
import { AudioEngine } from "../src/core/audio";

// the smallest AudioContext the engine graph needs: records when each buffer source is started
class FakeCtx {
  state = "suspended";
  currentTime = 10;
  sampleRate = 48000;
  destination = {};
  starts: number[] = [];
  private listeners: (() => void)[] = [];
  private node() {
    const param = () => ({ value: 0, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} });
    return {
      gain: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
      frequency: param(), Q: param(), pan: param(), detune: param(), playbackRate: param(),
      connect: (n: unknown) => n,
    };
  }
  createGain = () => this.node();
  createDynamicsCompressor = () => this.node();
  createWaveShaper = () => this.node();
  createBiquadFilter = () => this.node();
  createStereoPanner = () => this.node();
  createBuffer = (_c: number, length: number, sampleRate: number) => ({ duration: length / sampleRate, length, sampleRate });
  createBufferSource = () => ({ ...this.node(), buffer: null as unknown, start: (t: number) => this.starts.push(t), stop() {}, onended: null });
  addEventListener(_: string, fn: () => void) { this.listeners.push(fn); }
  resume() { this.state = "running"; this.listeners.forEach((f) => f()); return Promise.resolve(); }
}

afterEach(() => vi.unstubAllGlobals());

it("a quick tap queued before the audio woke up keeps its down → up gap (C7)", () => {
  const ctx = new FakeCtx();
  vi.stubGlobal("window", { AudioContext: function () { return ctx; } });
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const engine = new AudioEngine();
  const buf = ctx.createBuffer(1, 4800, 48000) as unknown as AudioBuffer;
  engine.register("down", [buf]);
  engine.register("up", [buf]);

  engine.play("down");
  now += 40; // finger lifted 40 ms later, context still suspended
  engine.play("up");
  now += 20;
  ctx.resume();

  const [down, up] = engine.playLogs;
  expect(down.outcome).toBe("played-after-resume");
  expect(up.outcome).toBe("played-after-resume");
  expect(ctx.starts).toHaveLength(2);
  // first sound right away (0 = now), the second 40 ms after it — not both at the same instant
  expect(ctx.starts[0]).toBe(0);
  // (+ the engine's 1–6 ms de-stacking spread for near-simultaneous starts)
  expect(ctx.starts[1] - ctx.currentTime).toBeGreaterThanOrEqual(0.04);
  expect(ctx.starts[1] - ctx.currentTime).toBeLessThan(0.047);
});
