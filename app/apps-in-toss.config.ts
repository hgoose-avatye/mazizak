import { defineConfig } from '@apps-in-toss/web-framework/config';

// Apps in Toss mini-app settings (`npm run build:ait` → `ait build`). appName must match the app registered in the
// Apps in Toss console — 'manzizak' is a placeholder until the console app exists.
export default defineConfig({
  appName: 'manzizak',
  brand: { primaryColor: '#294635' },
  // as gfac-puzzle-game: no back arrow (Android back / ✕ leave), home button, no title over the toy
  navigationBar: { withBackButton: false, withHomeButton: true, withTitle: false },
  webView: { bounces: false, pullToRefreshEnabled: false, overScrollMode: 'never' },
  permissions: [],
  webBundleDir: 'dist',
});
