// Renders every SFX set to 16-bit WAVs in bench-out/sfx/ for auditioning.
// The WAV writer lives in test/sfx.test.ts (runs the real TS module via vitest).
// Usage: node scripts/render-sfx.mjs
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['vitest', 'run', 'test/sfx.test.ts'], { stdio: 'inherit', env: { ...process.env, DUMP_WAV: '1' } });
process.exit(r.status ?? 1);
