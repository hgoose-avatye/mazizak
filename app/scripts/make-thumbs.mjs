// Menu thumbnails: renders of the app's OWN toys (public visuals, no reference models) → public/thumbs/menu/<ID>.jpg and kb-<preset>.jpg
// The main menu shows these instead of a CSS-drawn blob. Re-run after a toy's look changes.
//
// Needs a PLAIN dev server so that no local reference models / folders / key presets are rendered:
//   MANZIZAK_LOCAL_FIDGET_DIR= MANZIZAK_ORIGINAL_APP_DIR= MANZIZAK_ORIGINAL_WAKPPU_DIR= MANZIZAK_ORIGINAL_SOUNDS=0 MANZIZAK_DEV_KEYBOARD_DIR= npx vite --port 4354
//   node scripts/make-thumbs.mjs http://127.0.0.1:4354/            (all)    node scripts/make-thumbs.mjs http://127.0.0.1:4354/ S02,S03   (only these)
// Each page is opened in a 390×844 phone viewport, a square around the toy is cropped and downscaled to 256 px (card thumbnail is 116 px → 2.2× for retina).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:4354/";
const OUT = new URL("../public/thumbs/menu/", import.meta.url).pathname;
const ONLY = process.argv[3]?.split(",").filter(Boolean);
const SIZE = 256;
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(BASE);
await page.waitForFunction(() => window.__MANZIZAK__, null, { timeout: 30000 });

const { toys, keyboards } = await page.evaluate(async () => {
  const cat = await import("/src/toys/fidgets/catalog.ts");
  const kb = await import("/src/toys/keyboard/toy.ts");
  const loc = await import("/src/audio/localKeyPresets.ts");
  // every preset that is enabled in a build WITHOUT local folders = exactly the presets of the public build
  return { toys: cat.FIDGETS.map((f) => f.id), keyboards: Object.keys(kb.KEY_PRESET_INFO).filter((p) => loc.isKeyPresetEnabled(p)) };
});
// square crops (CSS px) around the toy: fidgets centred at (195, 420), the keyboard is wider and taller
// (the wax balls are bigger — the chocolate bar is 315×422 px — so they get the full 390 px viewport width)
const CROP = { toy: { cx: 195, cy: 420, side: 350 }, wax: { cx: 195, cy: 414, side: 390 }, keyboard: { cx: 195, cy: 430, side: 384 } };
const toJpeg = (png) =>
  page.evaluate(async ([b64, size]) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.86).split(",")[1];
  }, [png.toString("base64"), SIZE]);

const jobs = [...toys.map((id) => ({ file: id, hash: `#/${id}`, crop: id.startsWith("W") ? CROP.wax : CROP.toy })), ...keyboards.map((p) => ({ file: `kb-${p}`, hash: `#/keyboard/${p}`, crop: CROP.keyboard }))];
for (const j of jobs.filter((j) => !ONLY || ONLY.includes(j.file))) {
  await page.goto(BASE + j.hash);
  await page.waitForTimeout(400);
  const f0 = await page.evaluate(() => window.__MANZIZAK__.frames());
  // the render loop may sleep while a toy is idle: wait for the first frames, but do not insist on more
  await page.waitForFunction((n) => window.__MANZIZAK__.frames() > n + 5, f0, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2200); // models / textures / idle animation settle
  const { cx, cy, side } = j.crop;
  const png = await page.screenshot({ type: "png", clip: { x: Math.max(0, cx - side / 2), y: cy - side / 2, width: Math.min(side, 390), height: side } });
  const jpg = Buffer.from(await toJpeg(png), "base64");
  writeFileSync(OUT + j.file + ".jpg", jpg);
  console.log(j.file.padEnd(26), `${(jpg.length / 1024).toFixed(1)} KB`);
}
console.log("errors:", errors.length ? errors : "none");
await b.close();
