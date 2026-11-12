import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "warning") errors.push(m.text());
});
const ids = [
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
];
const models = ["S02", "S03", "L02"];
await mkdir("/private/tmp/manzizak-fidget-reference-assets/thumbs", {
  recursive: true,
});
const reports = {};
try {
  for (const id of ids) {
    await page.goto("http://127.0.0.1:4354/#/" + id);
    await page.waitForFunction(
      (id) => window.__MANZIZAK__?.report()?.id === id,
      id,
    );
    await page.waitForFunction(
      () => window.__MANZIZAK__.report().audio === "recorded/derived",
    );
    if (models.includes(id))
      await page.waitForFunction(() =>
        window.__MANZIZAK__.report().visualStatus.startsWith("models/"),
      );
    await page.waitForTimeout(400);
    reports[id] = await page.evaluate(() => window.__MANZIZAK__.report());
    await page.screenshot({
      path: "/private/tmp/manzizak-redesign-" + id + ".png",
    });
    await page.screenshot({
      path:
        "/private/tmp/manzizak-fidget-reference-assets/thumbs/" + id + ".png",
      clip: { x: 0, y: 225, width: 390, height: 390 },
    });
  }
  console.log(JSON.stringify({ reports, errors }, null, 2));
} finally {
  await browser.close();
}
