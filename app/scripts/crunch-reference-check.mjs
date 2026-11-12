import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=metal"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const p = await context.newPage(),
  checks = [],
  errors = [],
  summary = {};
p.on("pageerror", (e) => errors.push(String(e)));
const ok = (n, v) => {
  assert.ok(v, n);
  checks.push(n);
};
await p.addInitScript(() => {
  window.__crunch = { starts: [], active: 0, maxActive: 0 };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    if (this.buffer && this.buffer.length > 1) {
      const s = {
        loop: this.loop,
        duration: this.buffer.duration,
        t: performance.now(),
      };
      window.__crunch.starts.push(s);
      window.__crunch.active++;
      window.__crunch.maxActive = Math.max(
        window.__crunch.maxActive,
        window.__crunch.active,
      );
      this.addEventListener("ended", () => window.__crunch.active--, {
        once: true,
      });
    }
    return start.apply(this, a);
  };
});
try {
  for (const id of ["C01", "C02"]) {
    await p.goto((process.env.FIDGET_URL ?? "http://127.0.0.1:4354/") + "#/" + id);
    await p.waitForFunction(
      () => window.__MANZIZAK__?.report()?.audio === "recorded/derived",
    );
    await p.waitForTimeout(300);
    await p.mouse.move(195, 420);
    await p.mouse.down();
    await p.waitForTimeout(3500);
    await p.mouse.move(225, 435, { steps: 12 });
    await p.waitForTimeout(250);
    const down = await p.evaluate(() => ({
      report: window.__MANZIZAK__.report(),
      ...window.__crunch,
    }));
    ok(id + " accepts surface pressure", down.report.contacts === 1);
    ok(
      id + " intact enclosing skin",
      down.report.enclosure === "intact-elastic-skin",
    );
    ok(
      id + " only crunch events",
      down.report.soundPlays.length > 0 &&
        down.report.soundPlays.every((x) => /:(crunch|hold|tap):/.test(x.name)),
    );
    ok(
      id + " no generic friction loop",
      down.starts.every((x) => !x.loop),
    );
    console.log(id, "max simultaneous voices:", down.maxActive);
    ok(id + " overlap bounded (≤3 short + 1 sustained voice)", down.maxActive <= 4);
    if (id === "C01")
      ok(
        "soap filling is concealed",
        down.report.visibleMicroGrains === 0 &&
          down.report.grainPresentation === "concealed-filling",
      );
    else
      ok(
        "sugar has fine embedded grains",
        down.report.visibleMicroGrains === 1400 &&
          down.report.grainPresentation === "fine-embedded-rainbow",
      );
    await p.screenshot({
      path: "/private/tmp/manzizak-photo-pressed-" + id + ".png",
    });
    await p.mouse.up();
    await p.waitForTimeout(180);
    const released = await p.evaluate(() => ({
      report: window.__MANZIZAK__.report(),
      active: window.__crunch.active,
    }));
    ok(id + " stops sound on release", released.active === 0);
    await p.waitForTimeout(2200);
    const rested = await p.evaluate(() => window.__MANZIZAK__.report());
    ok(id + " skin recovers", rested.compression < 0.02);
    if (id === "C02")
      ok("beads retain rearrangement", rested.internalRearrangements === 1);
    summary[id] = {
      starts: down.starts.length,
      maxActive: down.maxActive,
      compressionAfterRelease: rested.compression,
      rearrangements: rested.internalRearrangements,
    };
    await p.getByRole("button", { name: "처음 상태로" }).click();
    await p.waitForTimeout(150);
    const reset = await p.evaluate(() => window.__MANZIZAK__.report());
    ok(
      id + " reset restores contents",
      reset.crushedParticles === 0 &&
        reset.internalRearrangements === 0 &&
        reset.contacts === 0,
    );
  }
  const cdp = await context.newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 170, y: 420, id: 1 },
      { x: 225, y: 420, id: 2 },
    ],
  });
  await p.waitForTimeout(250);
  ok(
    "sugar supports two-finger squeeze",
    (await p.evaluate(() => window.__MANZIZAK__.report())).contacts === 2,
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
  ok("no page errors", errors.length === 0);
  console.log(
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        summary,
        errors,
        listening: "Not performed; source scheduling and stop events measured.",
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
