// Offline-render stress test of the fidget sound path in real Chrome (same engine graph as the app: limiter + soft clip).
// Usage: npx vite --port 4361 &  node scripts/fidgets-audio-check.mjs [http://127.0.0.1:4361/]
// For every toy: 10 gestures/s for 5 s with strength 1 → peak, clipped samples, overlap-related level rise vs a single event.
// This measures levels only; it says nothing about how the sounds *sound*.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const URL = process.argv[2] ?? "http://127.0.0.1:4361/";
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(URL);
const out = await p.evaluate(async () => {
  const { AudioEngine } = await import("/src/core/audio.ts");
  const { FidgetAudio } = await import("/src/toys/fidgets/audio.ts");
  const { FIDGETS } = await import("/src/toys/fidgets/catalog.ts");
  const { FIDGET_SOUND, EVENTS } = await import("/src/toys/fidgets/soundBank.ts");
  const SR = 48000, SECONDS = 6;
  const res = {};
  const render = async (spec, plan) => {
    const off = new OfflineAudioContext(1, SR * SECONDS, SR);
    const engine = new AudioEngine(32, off);
    let t = 0;
    const a = new FidgetAudio(engine, spec, () => t);
    for (let i = 0; i < 400 && a.state === "loading"; i++) await new Promise((r) => setTimeout(r, 10));
    if (a.state !== "recorded/derived") throw new Error(spec.id + " audio " + a.state);
    a.enter();
    let played = 0;
    for (const [ms, ev, strength] of plan) { t = ms; if (a.play(ev, strength, ms / 1000)) played++; }
    const buf = await off.startRendering();
    const x = buf.getChannelData(0);
    let peak = 0, clipped = 0, e = 0;
    for (const v of x) { const m = Math.abs(v); peak = Math.max(peak, m); if (m >= 0.999) clipped++; e += v * v; }
    return { played, peakDb: +(20 * Math.log10(Math.max(peak, 1e-9))).toFixed(1), clipped, rmsDb: +(10 * Math.log10(e / x.length + 1e-12)).toFixed(1) };
  };
  const rolesOf = async (spec) => {
    const off = new OfflineAudioContext(1, SR, SR);
    const a = new FidgetAudio(new AudioEngine(32, off), spec, () => 0);
    for (let i = 0; i < 400 && a.state === "loading"; i++) await new Promise((r) => setTimeout(r, 10));
    return a.supportedRoles.filter((r) => EVENTS.includes(r));
  };
  for (const spec of FIDGETS) {
    const own = await rolesOf(spec);
    if (!own.length) { res[spec.id] = { events: [], silent: true }; continue; } // every pool was rejected: silent on purpose
    // single loudest event
    const single = await render(spec, [[100, own.includes("crack") ? "crack" : own.includes("crunch") ? "crunch" : own[0], 1]]);
    // 10 gestures per second, cycling through the toy's own events, strength 1
    const plan = [];
    for (let i = 0; i < 50; i++) plan.push([200 + i * 100, own[i % own.length], 1]);
    const stress = await render(spec, plan);
    res[spec.id] = { events: own, single, stress };
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
for (const [id, r] of Object.entries(out)) {
  if (r.silent) { console.log(id, "has no sound (all pools rejected)"); continue; }
  assert.ok(r.stress.clipped === 0, `${id}: clipped samples ${r.stress.clipped}`);
  assert.ok(r.stress.peakDb <= -0.5, `${id}: stress peak ${r.stress.peakDb} dBFS`);
  assert.ok(r.stress.peakDb - r.single.peakDb <= 8, `${id}: level rise under stress ${r.stress.peakDb - r.single.peakDb} dB`);
  assert.ok(r.stress.played >= 5, `${id}: only ${r.stress.played} events played`);
}
assert.deepEqual(errs, []);
console.log("fidget audio stress check: PASS (levels only; no listening)");
await b.close();
