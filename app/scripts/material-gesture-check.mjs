import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const b = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  }),
  p = await ctx.newPage(),
  checks = [],
  errors = [],
  summary = {};
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const ok = (n, v) => {
  assert.ok(v, n);
  checks.push(n);
};
await p.addInitScript(() => {
  window.__starts = [];
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    if (this.buffer?.length > 1)
      window.__starts.push({
        loop: this.loop,
        duration: this.buffer.duration,
        t: performance.now(),
      });
    return start.apply(this, a);
  };
});
const report = () => p.evaluate(() => window.__MANZIZAK__.report());
const open = async (id) => {
  await p.goto("http://127.0.0.1:4354/#/" + id);
  await p.waitForFunction(
    (id) =>
      window.__MANZIZAK__?.report()?.id === id &&
      window.__MANZIZAK__.report().audio === "recorded/derived",
    id,
  );
  await p.waitForTimeout(400);
};
try {
  for (const id of [
    "S01",
    "S02",
    "S03",
    "L01",
    "L02",
    "L03",
    "W01",
    "W02",
    "C01",
    "C02",
  ]) {
    await open(id);
    const startsBefore = await p.evaluate(() => window.__starts.length);
    await p.mouse.move(195, 420);
    await p.mouse.down();
    await p.waitForTimeout(id[0] === "W" ? 1800 : 1000);
    const down = await report();
    ok(
      id + " actual source start",
      (await p.evaluate(() => window.__starts.length)) > startsBefore,
    );
    ok(
      id + " real material cage",
      down.physics === "tetrahedral-dual-layer-cage" && down.cageNodes === 216,
    );
    ok(
      id + " local mesh movement",
      down.contacts === 1 && down.meshMaxDeformation > 0.03,
    );
    ok(
      id + " bounded volume",
      down.volumeRatio > 0.8 && down.volumeRatio < 1.2,
    );
    if (id === "S02")
      ok(
        "foam uses PU contact without synthetic recover",
        JSON.stringify(down.audioRoles) === '["tap","hold"]',
      );
    if (id === "S03")
      ok(
        "mochi has no generic release or rub role",
        JSON.stringify(down.audioRoles) === '["tap","hold"]',
      );
    if (id === "L01")
      ok(
        "cheese uses local user-video action windows",
        down.audioSource.includes("7WDcH26JU5Q") &&
          down.visualStatus === "reconstructed-material",
      );
    if (id[0] === "W") {
      ok(
        id + " local fracture only",
        down.brokenFaces > 0 && down.brokenFaces < down.totalFaces * 0.25,
      );
      ok(id + " no exploding shards", down.maxShardDisplacement < 0.23);
      await p.waitForTimeout(2000);
      const held = await report();
      ok(
        id + " static hold does not cascade over shell",
        held.brokenFaces <= down.brokenFaces + 4,
      );
    }
    await p.screenshot({
      path: "/private/tmp/manzizak-material-pressed-" + id + ".png",
    });
    await p.mouse.up();
    await p.waitForTimeout(900);
    const up = await report();
    ok(
      id + " no invented release/pops",
      up.soundPlays.every((x) => !/:release$|:bubble$|:press$/.test(x.name)),
    );
    ok(
      id + " no looping impact buffer",
      await p.evaluate(() => window.__starts.every((x) => !x.loop)),
    );
    if (id === "S02")
      ok("foam retains real mesh dent", up.meshMaxDeformation > 0.05);
    summary[id] = {
      volumeRatio: down.volumeRatio,
      pressedMesh: down.meshMaxDeformation,
      releasedMesh: up.meshMaxDeformation,
      broken: down.brokenFaces,
      audio: down.audioSource,
    };
    await p.getByRole("button", { name: "처음 상태로" }).click();
    await p.waitForTimeout(200);
    const reset = await report();
    ok(
      id + " resets mesh and contents",
      reset.meshMaxDeformation < 0.001 &&
        reset.brokenFaces === 0 &&
        reset.contacts === 0,
    );
  }
  await open("L01");
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 100, y: 420, id: 1 },
      { x: 290, y: 420, id: 2 },
    ],
  });
  await p.waitForTimeout(150);
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: 100 + i * 7, y: 420, id: 1 },
        { x: 290 - i * 7, y: 420, id: 2 },
      ],
    });
    await p.waitForTimeout(50);
  }
  const squeeze = await report();
  ok(
    "two-finger enclosed squeeze conserves volume",
    squeeze.contacts === 2 &&
      squeeze.volumeRatio > 0.8 &&
      squeeze.volumeRatio < 1.2,
  );
  await p.screenshot({
    path: "/private/tmp/manzizak-material-cheese-squeeze.png",
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
  await p.goto("http://127.0.0.1:4354/#/keyboard");
  await p.waitForTimeout(1200);
  ok(
    "only eight named keyboard choices",
    (await p.getByRole("radio").count()) === 8,
  );
  ok(
    "reserved switch names hidden",
    (await p.getByRole("radio", { name: "Oil King", exact: true }).count()) ===
      0 &&
      (await p
        .getByRole("radio", { name: "Boba U4T", exact: true })
        .count()) === 0,
  );
  const originals = JSON.parse(
    await readFile(
      "/private/tmp/manzizak-keyboard-cleanup-validation.json",
      "utf8",
    ),
  );
  ok("retained sound asset files exist", originals.clipsValidated === 24);
  for (const id of ["oil-king", "boba-u4t"])
    for (const ext of ["wav", "json"]) {
      const a = await readFile(
          "/private/tmp/manzizak-local-presets/" + id + "." + ext,
        ),
        c = await readFile(
          "/private/tmp/manzizak-local-presets-noise-cleaned/" + id + "." + ext,
        );
      ok(
        id + " " + ext + " preserved",
        createHash("sha256").update(a).digest("hex") ===
          createHash("sha256").update(c).digest("hex"),
      );
    }
  ok("no page errors", errors.length === 0);
  console.log(
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        summary,
        errors,
        listening:
          "Human listening and physical device comparison not performed.",
      },
      null,
      2,
    ),
  );
} finally {
  await b.close();
}
