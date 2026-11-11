import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ command, isPreview }) => {
  const localDir = command === 'serve' && !isPreview ? process.env.MANZIZAK_LOCAL_AUDIO_DIR : undefined;
  return {
    define: { 'import.meta.env.VITE_LOCAL_KEY_PRESETS': JSON.stringify(localDir ? '1' : '0') },
    plugins: localDir ? [{
      name: 'manzizak-local-keyboard-audio',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const match = /^\/__local-keyboard\/(oil-king|boba-u4t|box-jade|silent-peach-v3)\.(json|wav)$/.exec((req.url ?? '').split('?')[0]);
          if (!match) return next();
          try {
            const data = await readFile(path.join(localDir, `${match[1]}.${match[2]}`));
            res.setHeader('Content-Type', match[2] === 'json' ? 'application/json' : 'audio/wav');
            res.setHeader('Cache-Control', 'no-store');
            res.end(data);
          } catch { res.statusCode = 404; res.end('Local audio file unavailable'); }
        });
      },
    }] : [],
    base: './',
    server: { host: true },
    build: {
      rollupOptions: {
        input: {
          main: r('./index.html'),
          audio: r('./audio-test.html'),
          labSound: r('./lab-sound.html'),
          keyboardCompare: r('./keyboard-compare.html'),
        },
      },
    },
  };
});
