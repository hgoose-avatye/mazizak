import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
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
});
