import { load, onsets, SR } from './lib.mjs';
const [f, from = 0, to = 1e9] = process.argv.slice(2);
const x = load(f); const os = onsets(x);
console.log('dur', (x.length / SR).toFixed(1), 'events', os.length, 'floor', os[0]?.floorDb.toFixed(1));
const sel = os.filter((o) => o.t >= +from && o.t <= +to);
console.log(sel.map((o, k) => `${o.t.toFixed(3)}:${o.peakDb.toFixed(0)}`).join(' '));
