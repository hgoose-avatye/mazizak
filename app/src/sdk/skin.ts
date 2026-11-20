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
}
