/**
 * SDK windows (missions · attendance · notification sheet) skin = Figma "Theme Dialog" · Ice (teal, 2026-11-20): tilepop's
 * ice-skin.css (skin/ice-skin.css, font = Jua) + colorpop's SDK 0.38 layout script and icons (skin/sdk-skin.js · icon webp).
 * CSS goes in a <style> after its __ASSET_SVG_<name>__ placeholders become this folder's svg URLs; the JS runs once in a
 * <script> after its __ASSET_<name>__ placeholders become webp URLs. sdk-skin.js fills window.__gfRewardIcons and re-lays the SDK cards.
 */
import rawCss from './skin/ice-skin.css?raw';
import js from './skin/sdk-skin.js?raw';

const assets = import.meta.glob<string>('./skin/*.webp', { eager: true, query: '?url', import: 'default' });
const svgs = import.meta.glob<string>('./skin/*.svg', { eager: true, query: '?url', import: 'default' });
// quoted: Vite inlines a small svg as a data URI with ' in it, which an unquoted url() does not allow
const css = rawCss.replace(/__ASSET_SVG_([a-z0-9_]+)__/g, (_, n: string) => JSON.stringify(svgs[`./skin/${n}.svg`] ?? ''));
const assetUrl = (name: string) => {
  const url = assets[`./skin/${name}.webp`];
  if (!url) throw new Error(`sdk skin asset missing: ${name}`);
  return url;
};

let installed = false;
export function installSdkSkin(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const style = document.createElement('style');
  style.id = 'manzizak-sdk-skin';
  style.textContent = css;
  document.head.append(style);
  const script = document.createElement('script');
  script.textContent = js.replace(/__ASSET_([a-z0-9_]+)__/g, (_, n: string) => assetUrl(n));
  document.head.append(script);
  watchHearts();
}

/**
 * 만지작 has no hearts (owner, 2026-11-20: "하트 필요 없음, 포인트로"). The reward kinds and amounts come from the server, so the app
 * cannot turn a heart reward into points; it only shows what is real: "+ 하트 N개" is cut from a reward chip (the points stay), and a
 * mission that pays hearts only (오늘 30분 플레이) is hidden. Paying points for it is a server (economy config) change.
 */
const HEART_PART = /\s*\+\s*하트\s*\d+\s*개/g;
const HEART_ONLY = /^\s*하트\s*\d+\s*개\s*$/;
function stripHearts(root: ParentNode): void {
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  const hide: Element[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue ?? '';
    if (!t.includes('하트')) continue;
    if (HEART_ONLY.test(t)) {
      const row = (n.parentElement as Element | null)?.closest('.gf-rx-row, .sk-rx-card, li');
      if (row) hide.push(row);
    } else if (HEART_PART.test(t)) n.nodeValue = t.replace(HEART_PART, '');
    HEART_PART.lastIndex = 0;
  }
  for (const row of hide) (row as HTMLElement).style.display = 'none';
}
let watching = false;
function watchHearts(): void {
  if (watching) return;
  watching = true;
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; stripHearts(document.body); });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
