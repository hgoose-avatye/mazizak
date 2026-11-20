import { describe, expect, it } from 'vitest';
import { GF_CONFIG, SDK_FILE } from '../src/sdk/gf';

// node modules through a variable, as the other tests do (tsconfig has no node types)
const fsName = 'node:fs', cryptoName = 'node:crypto';
const fs = (await import(/* @vite-ignore */ fsName)) as { readdirSync(p: URL): string[]; readFileSync(p: URL, enc?: string): Uint8Array & string };
const { createHash } = (await import(/* @vite-ignore */ cryptoName)) as { createHash(a: string): { update(b: Uint8Array): { digest(e: string): string } } };
const at = (p: string) => new URL(`../${p}`, import.meta.url);

describe('GfSDK vendor file', () => {
  it('is the pinned 0.38.18 build (same file as colorpop/boltpop) and the only one', () => {
    const files = fs.readdirSync(at('public/vendor')).filter((f) => f.startsWith('gf-sdk'));
    expect(files).toEqual([SDK_FILE.replace('vendor/', '')]);
    expect(createHash('sha256').update(fs.readFileSync(at(`public/${SDK_FILE}`))).digest('hex')).toBe('21d84bc83211d694abb85d373d1a211a71e56cab98bbd222c4d14811e2bd25ae');
  });

  it('appName matches apps-in-toss.config.ts', () => {
    expect(fs.readFileSync(at('apps-in-toss.config.ts'), 'utf8')).toContain(`appName: '${GF_CONFIG.appName}'`);
  });
});
