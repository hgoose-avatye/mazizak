// Promote the cleared key presets (옥구슬 복숭아 몽돌 찌개 도자기) from the local dev folder to the public build:
//   ~/Music/MANZIZAK/dev-keyboard-audio/presets/<id>.{wav,json}  →  audio-src/sfx/keyboard/<id>.{wav,json}
//
// The recordings come from third parties (YouTube typing videos, ThockHub, a Mechvibes pack). The project owner obtained permission to use them
// in the public build (owner's statement, 2026-11-16). The permission texts are not kept in the repository, so the record says exactly that
// (`clearance` in every shipped JSON). The generators (build-youtube-presets.mjs, clean-peach-v3.mjs,
// build-local-presets.py) keep writing their output with the local-only markers; this script is the one place that turns them into shippable files.
//
// Usage: node scripts/kbsamples/ship-cleared-presets.mjs        (re-runnable; the WAV bytes are copied unchanged and checked against MANIFEST.sha256)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HOME = process.env.HOME;
const SRC = path.join(process.env.MANZIZAK_DEV_KEYBOARD_DIR ?? `${HOME}/Music/MANZIZAK/dev-keyboard-audio`, 'presets');
const MANIFEST = path.join(SRC, '..', 'MANIFEST.sha256');
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../audio-src/sfx/keyboard');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** credit shown in the settings sheet: where each recording comes from */
export const CLEARED = {
  'box-jade': { label: '옥구슬', title: 'Kailh Box Jade sound pack', by: 'Mechvibes pack (author as listed on the pack page)', url: 'https://mechvibes.com/sound-packs/kailh-box-jade' },
  'silent-peach-v3': { label: '복숭아', title: 'Outemu Silent Peach V3 sound test (ThockHub K09)', by: 'ThockHub / the sound-test author', url: 'https://thockhub.com/audio/ct/ultimate-outemu-silent-peach-v3-sound-test-better-than-the-original/' },
  'mongdol-pl87w': { label: '몽돌', title: 'SPM PL87W 몽돌축 ASMR', by: '세계 SEGYE (YouTube)', url: 'https://www.youtube.com/shorts/BgO3pE7VnI8' },
  'jjigae-topre': { label: '찌개', title: '【FAST ASMR】 RealForce R2 (30g) Lubed Topre EC', by: '쟈글링-KeyboardHolic (YouTube)', url: 'https://www.youtube.com/watch?v=TTfTCiwA38c' },
  'dojagi-space65': { label: '도자기', title: 'ASMR | 주말에 듣는 차분한 도자기 키보드 소리 1시간 | SPACE65, BSUN RAW', by: 'tadadak ASMR 타다닥 (YouTube)', url: 'https://www.youtube.com/watch?v=Ry1DJ2xzg6Q' },
};
const manifest = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, 'utf8') : '';
fs.mkdirSync(OUT, { recursive: true });
for (const [id, credit] of Object.entries(CLEARED)) {
  const wav = fs.readFileSync(path.join(SRC, `${id}.wav`));
  const map = JSON.parse(fs.readFileSync(path.join(SRC, `${id}.json`), 'utf8'));
  const listed = new RegExp(`^([0-9a-f]{64})  presets/${id}\\.wav$`, 'm').exec(manifest)?.[1];
  if (listed && listed !== sha(wav)) throw new Error(`${id}.wav does not match MANIFEST.sha256 — refusing to ship a changed file`);
  if (map.file !== `${id}.wav`) throw new Error(`${id}.json points at ${map.file}`);
  // the local-only markers become the clearance record; everything else (entries, processing notes, source detail) is kept as it was
  delete map.usage;
  delete map.rights;
  map.clearance = {
    status: 'permission to use in the public build obtained',
    statedBy: 'project owner',
    statedOn: '2026-11-16',
    note: "The owner's statement; the permission terms are not stored in the repository.",
  };
  map.credit = credit;
  map.wavSha256 = sha(wav);
  fs.writeFileSync(path.join(OUT, `${id}.wav`), wav);
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(map) + '\n');
  console.log(`${id.padEnd(16)} ${(wav.length / 1024).toFixed(0).padStart(4)} KB  ${listed ? 'sha ok' : 'no manifest entry (sha recorded)'}`);
}
