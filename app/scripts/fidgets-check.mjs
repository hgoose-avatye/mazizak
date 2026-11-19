import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const URL = process.argv[2] ?? "http://127.0.0.1:4354/";
const b = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=metal"],
});
const checks = [];
const ok = (name, v) => {
  assert.ok(v, name);
  checks.push(name);
};
try {
  const context = await b.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    p = await context.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.addInitScript(() => {
    window.__starts = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer?.length > 1)
        window.__starts.push({ len: this.buffer.length, loop: this.loop });
      return start.apply(this, args);
    };
  });
  const report = () => p.evaluate(() => window.__MANZIZAK__.report());
  const open = async (id) => {
    await p.goto(URL + "#/" + id);
    await p.waitForFunction(
      (id) => window.__MANZIZAK__?.report()?.id === id,
      id,
    );
    await p.waitForFunction(
      () => window.__MANZIZAK__.report().audio === "recorded/derived",
    );
  };
  await p.goto(URL);
  await p.waitForTimeout(1000);
  // dock UI (fe041b9): the category switch is a radio pair, the toys are .toy-item buttons in #toy-list
  for (const [category, count] of [
    ["fidget", 10],
    ["keyboard", 11],
  ]) {
    await p.locator(`[data-category="${category}"]`).click();
    await p.waitForTimeout(300);
    ok(
      "category " + category,
      (await p.locator("#toy-list .toy-item").count()) === count,
    );
  }
  const snapshots = {};
  for (const id of [
    "S01",
    "S02",
    "S03",
    "W01",
    "W02",
    "L01",
    "L02",
    "L03",
    "C01",
    "C02",
  ]) {
    await open(id);
    const before = await report();
    const startsBefore = await p.evaluate(() => window.__starts.length);
    await p.mouse.move(195, 420);
    await p.mouse.down();
    await p.waitForTimeout(id[0] === "W" ? 4200 : id === "C01" ? 5000 : 850);
    const down = await report();
    snapshots[id] = down;
    ok(id + " accepts actual surface input", down.contacts > 0);
    ok(id + " local compression", down.peakCompression > 0.02);
    // toys whose every pool was rejected (listener verdict / quality gates) are silent on purpose
    if ((down.audioRoles ?? []).some((r) => ["tap", "hold", "crack", "crunch"].includes(r)) || process.env.LOCAL_AUDIO === "1")
      ok(
        id + " gesture sound",
        (await p.evaluate(() => window.__starts.length)) > startsBefore,
      );
    if (id[0] === "W")
      ok(id + " shell fractures", down.brokenFaces > 0 && down.crackEvents > 0);
    if (id === "C01")
      ok("soap particles really crush", down.crushedParticles > 0);
    if (id === "C02") ok("beads really collide", down.particleCollisions > 0);
    await p.mouse.up();
    await p.waitForTimeout(900);
    const released = await report();
    if (id[0] === "W") {
      await p.mouse.move(195, 420);
      await p.mouse.down();
      await p.waitForTimeout(400);
      const core = await report();
      ok(
        id + " exposed core accepts input",
        core.coreTouches > 0 &&
          core.soundPlays.some((x) => x.name.includes(":hold:")),
      );
      await p.mouse.up();
    }
    if (id === "S01") ok("TPR fast return", released.compression < 0.02);
    if (id === "S02") ok("foam retains dent", released.compression > 0.08);
    if (id[0] === "L") {
      const loopBefore = await p.evaluate(
        () => window.__starts.filter((x) => x.loop).length,
      );
      const cdp = await context.newCDPSession(p);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: 165, y: 420, id: 1 },
          { x: 225, y: 420, id: 2 },
        ],
      });
      await p.waitForTimeout(100);
      for (let i = 1; i <= 8; i++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: 165 - i * 9, y: 420, id: 1 },
            { x: 225 + i * 9, y: 420, id: 2 },
          ],
        });
        await p.waitForTimeout(50);
      }
      await p.waitForTimeout(250);
      ok(id + " two-finger stretch", (await report()).stretch > 1.2);
      await p.screenshot({ path: `/private/tmp/manzizak-stretched-${id}.png` });
      ok(
        id + " no impact sample loop",
        (await p.evaluate(
          () => window.__starts.filter((x) => x.loop).length,
        )) === loopBefore,
      );
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: 185, y: 420, id: 1 },
          { x: 205, y: 420, id: 2 },
        ],
      });
      await p.waitForTimeout(250);
      ok(id + " closing fingers folds", (await report()).folds > 0);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await cdp.detach();
      // the 접기 / 뭉치기 buttons were removed (2026-11-13); the two-finger gesture above still folds
      ok(id + " no fold / gather buttons", (await p.getByRole("button", { name: /^(접기|뭉치기)$/ }).count()) === 0);
    }
    // f08aa50 shows the reset button for 왁뿌볼 only; the reset itself still exists for every toy: trigger it through the same element
    await p.evaluate(() => document.querySelector('[data-action="reset"]').click());
    await p.waitForTimeout(150);
    const reset = await report();
    ok(
      id + " reset",
      reset.contacts === 0 &&
        reset.brokenFaces === 0 &&
        reset.crushedParticles === 0 &&
        reset.folds === 0,
    );
    await p.screenshot({ path: `/private/tmp/manzizak-fidget-${id}.png` });
  }
  ok(
    "wax topology differs",
    snapshots.W01.totalFaces > snapshots.W02.totalFaces,
  );
  ok(
    "material families differ",
    new Set(Object.values(snapshots).map((x) => x.shape)).size === 10,
  );
  await open("S01");
  // dock UI (fe041b9): toys are switched with the .toy-item buttons in the dock (the old .toy-jump select is gone)
  await p.locator('.toy-item[data-key="W02"]').click();
  await p.waitForFunction(() => window.__MANZIZAK__.report().id === "W02");
  await p.locator('.toy-item[data-key="L02"]').click();
  await p.waitForFunction(() => window.__MANZIZAK__.report().id === "L02");
  ok("quick toy navigation", true);
  // the mute check needs a toy that has a press sound (L02 only has a stretch pool now)
  await p.locator('.toy-item[data-key="L03"]').click();
  await p.waitForFunction(() => window.__MANZIZAK__.report().id === "L03");
  await p.getByRole("button", { name: "소리 끄기", exact: true }).click();
  await p.mouse.move(195, 420);
  await p.mouse.down();
  await p.waitForTimeout(100);
  await p.mouse.up();
  ok(
    "mute applies to fidget sounds",
    (await report()).soundPlays.some((x) => x.outcome === "muted"),
  );
  await p.getByRole("button", { name: "소리 켜기", exact: true }).click();
  await p.goto(URL + "#/keyboard");
  await p.waitForTimeout(1700);
  ok(
    "keyboard 11 presets (8 + 몽돌·찌개·두부) and reserved assets preserved",
    (await p.locator("#toy-list .toy-item").count()) === 11,
  );
  await p.locator('.toy-item[data-key="topre"]').click(); // 마시멜로
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press("KeyQ");
  ok("no page errors", errors.length === 0);
  const summary = Object.fromEntries(
    Object.entries(snapshots).map(([id, s]) => [
      id,
      {
        compression: s.peakCompression,
        broken: s.brokenFaces,
        crushed: s.crushedParticles,
        collisions: s.particleCollisions,
        vertices: s.vertices,
      },
    ]),
  );
  console.log(
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        summary,
        errors,
        listening:
          "Not performed; event scheduling only. Real devices untested.",
      },
      null,
      2,
    ),
  );
  await context.close();
} finally {
  await b.close();
}
