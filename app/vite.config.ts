import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ command, isPreview }) => {
  const fidgetDir =
    command === "serve" && !isPreview
      ? process.env.MANZIZAK_LOCAL_FIDGET_DIR
      : undefined;
  // read-only, loopback-only window onto the sounds of an installed reference app, for listening comparisons in lab-compare.html.
  // Nothing is copied into the repository or the build (scripts/check-dist.mjs forbids the route name in dist/).
  const originalDir =
    command === "serve" && !isPreview
      ? process.env.MANZIZAK_ORIGINAL_APP_DIR
      : undefined;
  // same idea for the installed 뿌왁 app (squish_<name>_mallang_N.wav at the bundle root)
  const wakppuDir =
    command === "serve" && !isPreview
      ? process.env.MANZIZAK_ORIGINAL_WAKPPU_DIR
      : undefined;
  const localDir =
    command === "serve" && !isPreview
      ? process.env.MANZIZAK_LOCAL_AUDIO_DIR
      : undefined;
  // permanent home of the owner's YouTube keyboard presets (몽돌 / 찌개 / 도자기), outside the repository (dev server only)
  const ytPresetDir = (() => {
    if (command !== "serve" || isPreview || process.env.VITEST) return undefined; // unit tests see the plain (disabled) state
    const d = path.join(process.env.MANZIZAK_DEV_KEYBOARD_DIR ?? path.join(homedir(), "Music/MANZIZAK/dev-keyboard-audio"), "presets");
    return existsSync(d) ? d : undefined;
  })();
  return {
    define: {
      "import.meta.env.VITE_LOCAL_KEY_PRESETS": JSON.stringify(
        localDir || ytPresetDir ? "1" : "0",
      ),
      "import.meta.env.VITE_LOCAL_FIDGETS": JSON.stringify(
        fidgetDir ? "1" : "0",
      ),
      // "1" only on the dev server started with MANZIZAK_ORIGINAL_APP_DIR (owner-chosen stand-in sounds from the installed reference app)
      "import.meta.env.VITE_ORIGINAL_SOUNDS": JSON.stringify(
        (originalDir || wakppuDir) && process.env.MANZIZAK_ORIGINAL_SOUNDS !== "0" ? "1" : "0",
      ),
      // "0": keep the local reference meshes but play only the licensed sound pools
      "import.meta.env.VITE_LOCAL_FIDGET_AUDIO": JSON.stringify(
        process.env.MANZIZAK_LOCAL_FIDGET_AUDIO === "0" ? "0" : "1",
      ),
    },
    plugins: [
      // dev only, loopback only: lab-compare.html posts the listener's verdicts here so they land in a git-ignored file
      ...(command === "serve" && !isPreview
        ? [
            {
              name: "manzizak-lab-verdicts",
              configureServer(server: import("vite").ViteDevServer) {
                server.middlewares.use("/__lab-verdicts", async (req, res) => {
                  const loop = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
                  if (!loop || req.method !== "POST") { res.statusCode = loop ? 405 : 403; return res.end(); }
                  let body = "";
                  for await (const c of req) { body += c; if (body.length > 2e6) { res.statusCode = 413; return res.end(); } }
                  try {
                    JSON.parse(body);
                    const { mkdir, writeFile } = await import("node:fs/promises");
                    await mkdir(r("./bench-out"), { recursive: true });
                    await writeFile(r("./bench-out/lab-verdicts.json"), body);
                    res.statusCode = 204;
                  } catch { res.statusCode = 400; }
                  res.end();
                });
              },
            },
          ]
        : []),
      ...(wakppuDir
        ? [
            {
              name: "manzizak-original-wakppu-sounds",
              configureServer(server: import("vite").ViteDevServer) {
                server.middlewares.use("/__original-wakppu", async (req, res, next) => {
                  const loop = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
                  if (!loop) { res.statusCode = 403; return res.end("loopback only"); }
                  const m = /^\/(squish_[a-z]+_mallang_\d+\.wav)$/.exec(decodeURIComponent((req.url ?? "/").split("?")[0]));
                  if (!m) return next();
                  try {
                    const data = await readFile(path.join(wakppuDir, m[1]));
                    res.setHeader("Content-Type", "audio/wav");
                    res.setHeader("Cache-Control", "no-store");
                    res.end(data);
                  } catch {
                    res.statusCode = 404;
                    res.end("unavailable");
                  }
                });
              },
            },
          ]
        : []),
      ...(originalDir
        ? [
            {
              name: "manzizak-original-app-sounds",
              configureServer(server: import("vite").ViteDevServer) {
                server.middlewares.use("/__original-wak", async (req, res, next) => {
                  const loop = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
                  if (!loop) { res.statusCode = 403; return res.end("loopback only"); }
                  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
                  try {
                    if (url === "/index.json") {
                      const { readdir } = await import("node:fs/promises");
                      const out: Record<string, string[]> = {};
                      for (const cat of ["wak", "crunch"])
                        for (const d of await readdir(path.join(originalDir, cat), { withFileTypes: true }))
                          if (d.isDirectory()) out[`${cat}/${d.name}`] = (await readdir(path.join(originalDir, cat, d.name))).filter((f) => /\.(mp3|wav)$/i.test(f)).sort();
                      res.setHeader("Content-Type", "application/json");
                      res.setHeader("Cache-Control", "no-store");
                      return res.end(JSON.stringify(out));
                    }
                    const m = /^\/((?:wak|crunch)\/[a-z0-9_-]+\/[A-Za-z0-9_.-]+\.(?:mp3|wav))$/i.exec(url);
                    if (!m) return next();
                    const data = await readFile(path.join(originalDir, m[1]));
                    res.setHeader("Content-Type", /\.wav$/i.test(m[1]) ? "audio/wav" : "audio/mpeg");
                    res.setHeader("Cache-Control", "no-store");
                    res.end(data);
                  } catch {
                    res.statusCode = 404;
                    res.end("unavailable");
                  }
                });
              },
            },
          ]
        : []),
      ...(fidgetDir
        ? [
            {
              name: "manzizak-local-fidget-references",
              configureServer(server: import("vite").ViteDevServer) {
                server.middlewares.use(async (req, res, next) => {
                  const match =
                    /^\/__local-fidgets\/(manifest\.json|models\/[a-z_]+\.glb|audio\/[a-z0-9_]+\.wav|thumbs\/[A-Z0-9]+\.png)$/.exec(
                      (req.url ?? "").split("?")[0],
                    );
                  if (!match) return next();
                  try {
                    const data = await readFile(path.join(fidgetDir, match[1]));
                    res.setHeader(
                      "Content-Type",
                      match[1].endsWith(".json")
                        ? "application/json"
                        : match[1].endsWith(".wav")
                          ? "audio/wav"
                          : match[1].endsWith(".png")
                            ? "image/png"
                            : "model/gltf-binary",
                    );
                    res.setHeader("Cache-Control", "no-store");
                    res.end(data);
                  } catch {
                    res.statusCode = 404;
                    res.end("Local reference unavailable");
                  }
                });
              },
            },
          ]
        : []),
      ...(localDir || ytPresetDir
        ? [
            {
              name: "manzizak-local-keyboard-audio",
              configureServer(server) {
                server.middlewares.use(async (req, res, next) => {
                  const match =
                    /^\/__local-keyboard\/(oil-king|boba-u4t|box-jade|silent-peach-v3|silent-peach-v3\.orig|mongdol-pl87w|jjigae-topre|dojagi-space65)\.(json|wav)$/.exec(
                      (req.url ?? "").split("?")[0],
                    );
                  if (!match) return next();
                  try {
                    // the three YouTube presets come from the permanent folder when it exists, the rest from MANZIZAK_LOCAL_AUDIO_DIR
                    const yt = /^(mongdol-pl87w|jjigae-topre|dojagi-space65)$/.test(match[1]);
                    const dir = yt && ytPresetDir ? ytPresetDir : localDir;
                    if (!dir) throw new Error("no folder");
                    const data = await readFile(
                      path.join(dir, `${match[1]}.${match[2]}`),
                    );
                    res.setHeader(
                      "Content-Type",
                      match[2] === "json" ? "application/json" : "audio/wav",
                    );
                    res.setHeader("Cache-Control", "no-store");
                    res.end(data);
                  } catch {
                    res.statusCode = 404;
                    res.end("Local audio file unavailable");
                  }
                });
              },
            },
          ]
        : []),
    ],
    base: "./",
    server: { host: true },
    build: {
      rollupOptions: {
        input: {
          main: r("./index.html"),
          audio: r("./audio-test.html"),
          labSound: r("./lab-sound.html"),
          keyboardCompare: r("./keyboard-compare.html"),
        },
      },
    },
  };
});
