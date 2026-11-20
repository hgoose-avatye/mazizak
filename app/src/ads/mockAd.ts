/**
 * Stand-in for the Apps in Toss full-screen ad, for trying the ad gate in a browser (`?ads=mock`, `?ads=mock-fail`).
 * Loaded only with those query values (rewarded.ts imports it on demand), so it is not part of the app's normal startup.
 *
 * Looks and behaves like a video ad without a video file (the deploy stays small): a 15 s animation drawn on a canvas,
 * a "광고" badge, a progress bar, "N초 후 건너뛰기" that becomes "건너뛰기" after 5 s, and "닫기" at the end.
 * Rewarded-ad semantics, as the SDK reports them: skipping = `dismissed` without reward; watching to the end =
 * `userEarnedReward`, then `dismissed` on 닫기. The clock pauses while the page is hidden.
 *
 * The content is a made-up promo for this app (no real advertiser). Lengths for quick checks: `&adsec=3&adskip=1`.
 */
import type { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';

type Sdk = { loadFullScreenAd: typeof loadFullScreenAd; showFullScreenAd: typeof showFullScreenAd };

const num = (name: string, fallback: number) => {
  const v = Number(new URLSearchParams(location.search).get(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const CSS = `
.mock-ad { position: fixed; inset: 0; z-index: 100; background: #101512; color: #fff; font-family: var(--font-meta, system-ui); user-select: none; -webkit-user-select: none; }
.mock-ad canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.mock-ad-badge { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); left: 14px; padding: 3px 8px; border-radius: 6px; background: #000a; font-size: 12px; font-weight: 700; letter-spacing: .5px; }
.mock-ad-skip { position: absolute; right: 14px; bottom: calc(env(safe-area-inset-bottom, 0px) + 30px); min-width: 108px; height: 40px; padding: 0 14px; border: 1px solid #ffffff55; border-radius: 6px; background: #000b; color: #fff; font: 600 14px/1 var(--font-meta, system-ui); cursor: pointer; }
.mock-ad-skip:disabled { color: #ffffffb0; cursor: default; }
.mock-ad-bar { position: absolute; left: 0; right: 0; bottom: env(safe-area-inset-bottom, 0px); height: 4px; background: #ffffff33; }
.mock-ad-bar i { display: block; height: 100%; width: 0; background: #ffd23f; }
`;

export function mockSdk(mode: 'mock' | 'mock-fail'): Sdk {
  if (!document.getElementById('mock-ad-css')) {
    const st = document.createElement('style'); st.id = 'mock-ad-css'; st.textContent = CSS; document.head.append(st);
  }
  const loadFullScreenAd = Object.assign(
    ((p) => {
      const t = setTimeout(() => (mode === 'mock' ? p.onEvent({ type: 'loaded' }) : p.onError(new Error('No fill'))), 300);
      return () => clearTimeout(t);
    }) as Sdk['loadFullScreenAd'],
    { isSupported: () => true },
  );
  const showFullScreenAd = Object.assign(
    ((p) => {
      // `&adorder=late`: report the reward after `dismissed`, as the native SDK sometimes does
      const late = new URLSearchParams(location.search).get('adorder') === 'late';
      let earned = false;
      const reward = () => p.onEvent({ type: 'userEarnedReward', data: { unitType: 'toy', unitAmount: 1 } });
      const stop = playAd(num('adsec', 15), num('adskip', 5), {
        rewarded: () => (late ? (earned = true) : reward()),
        closed: () => { p.onEvent({ type: 'dismissed' }); if (late && earned) setTimeout(reward, 400); },
      });
      p.onEvent({ type: 'requested' });
      p.onEvent({ type: 'show' });
      p.onEvent({ type: 'impression' });
      return stop;
    }) as Sdk['showFullScreenAd'],
    { isSupported: () => true },
  );
  return { loadFullScreenAd, showFullScreenAd };
}

function playAd(length: number, skipAt: number, on: { rewarded(): void; closed(): void }): () => void {
  const el = document.createElement('div');
  el.className = 'mock-ad';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '광고');
  el.innerHTML = '<canvas aria-hidden="true"></canvas><span class="mock-ad-badge">광고</span><button type="button" class="mock-ad-skip" disabled></button><div class="mock-ad-bar" role="progressbar" aria-label="광고 진행" aria-valuemin="0" aria-valuemax="100"><i></i></div>';
  document.body.append(el);
  const canvas = el.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  const skip = el.querySelector<HTMLButtonElement>('.mock-ad-skip')!;
  const bar = el.querySelector<HTMLElement>('.mock-ad-bar')!;
  const fill = bar.querySelector('i')!;

  let t = 0, last = performance.now(), raf = 0, done = false, gone = false;
  const close = () => { if (gone) return; gone = true; cancelAnimationFrame(raf); el.remove(); on.closed(); };
  skip.onclick = close; // before the end: skipped (no reward); after: 닫기

  const frame = (now: number) => {
    t = Math.min(length, t + Math.min(0.25, (now - last) / 1000)); // real time on slow frames; a hidden page gets no frames, so the clock waits
    last = now;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = el.clientWidth, h = el.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(g, w, h, t, length);
    const pct = (t / length) * 100;
    fill.style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    if (t >= length) {
      if (!done) { done = true; skip.disabled = false; skip.textContent = '닫기 ✕'; skip.classList.add('mock-ad-close'); on.rewarded(); }
    } else if (t >= skipAt) {
      if (skip.disabled) { skip.disabled = false; skip.textContent = '건너뛰기 ▸'; }
    } else skip.textContent = `${Math.ceil(skipAt - t)}초 후 건너뛰기`;
    if (!done) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame((n) => { last = n; frame(n); });
  return () => { gone = true; cancelAnimationFrame(raf); el.remove(); };
}

// ---------- the "video": three short scenes scaled to the ad's length ----------
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
const fade = (t: number, a: number, b: number, edge = 0.4) => Math.min(ease((t - a) / edge), ease((b - t) / edge));

function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, squash: number): void {
  const rx = r * (1 + squash * 0.35), ry = r * (1 - squash * 0.35);
  g.save();
  g.fillStyle = '#0000001f';
  g.beginPath(); g.ellipse(x, y + ry * 0.98, rx * 0.9, r * 0.14, 0, 0, Math.PI * 2); g.fill();
  const grad = g.createRadialGradient(x - rx * 0.35, y - ry * 0.45, r * 0.1, x, y, r * 1.2);
  grad.addColorStop(0, '#ffffffcc'); grad.addColorStop(0.25, color); grad.addColorStop(1, color);
  g.fillStyle = grad;
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, alpha: number, weight = 800): void {
  if (alpha <= 0) return;
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = '#1f3327';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${weight} ${size}px SUITE, SUIT, system-ui, sans-serif`;
  g.fillText(s, x, y + (1 - alpha) * 12);
  g.restore();
}

function draw(g: CanvasRenderingContext2D, w: number, h: number, t: number, length: number): void {
  const k = 15 / length; // the storyboard is written for 15 s
  const s = t * k;
  const hue = 140 + 25 * Math.sin(s * 0.35);
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, `hsl(${hue} 45% 90%)`); bg.addColorStop(1, `hsl(${hue + 40} 55% 84%)`);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const u = Math.min(w, h), cx = w / 2, cy = h * 0.45;

  // floating dots
  g.fillStyle = '#ffffff55';
  for (let i = 0; i < 14; i++) {
    const px = ((i * 97 + s * 18 * (1 + (i % 3))) % (w + 40)) - 20;
    const py = (i * 61) % h + Math.sin(s + i) * 10;
    g.beginPath(); g.arc(px, py, 3 + (i % 4) * 2, 0, Math.PI * 2); g.fill();
  }

  if (s < 5.4) {
    // 1 · a squishy drops in, gets pressed, and slowly rises back
    const drop = ease(s / 0.9);
    const press = s > 1.6 && s < 4.4 ? Math.sin(Math.min(1, (s - 1.6) / 0.35) * Math.PI / 2) * (s < 2.6 ? 1 : Math.max(0, 1 - (s - 2.6) / 1.8)) : 0;
    const bounce = s < 1.6 ? Math.exp(-(s - 0.9) * 5) * Math.sin((s - 0.9) * 16) * 0.25 * (s > 0.9 ? 1 : 0) : 0;
    blob(g, cx, cy - (1 - drop) * h * 0.5, u * 0.22, '#f2a7b8', Math.max(press * 0.9, bounce));
    if (press > 0.05) { // a fingertip
      g.fillStyle = '#ffffffb0';
      g.beginPath(); g.arc(cx + u * 0.04, cy - u * 0.22 * (1 - press * 0.3) - u * 0.07, u * 0.05, 0, Math.PI * 2); g.fill();
    }
    text(g, '꾹— 눌러 보세요', cx, h * 0.76, u * 0.075, fade(s, 1.2, 5.2));
  } else if (s < 10.4) {
    // 2 · three toys bob in turn
    const colors = ['#f6d36b', '#9fd6a4', '#b9a7f2'];
    colors.forEach((c, i) => {
      const a = ease((s - 5.2 - i * 0.3) / 0.6);
      const bob = Math.sin((s - i * 0.5) * 3.2);
      blob(g, cx + (i - 1) * u * 0.3, cy + (1 - a) * u * 0.4 - Math.max(0, bob) * u * 0.05, u * 0.12, c, Math.max(0, -bob) * 0.5);
    });
    text(g, '말랑이 10가지 · 키보드 10가지', cx, h * 0.72, u * 0.06, fade(s, 5.8, 10.2));
    text(g, '매일 3가지는 무료', cx, h * 0.72 + u * 0.1, u * 0.05, fade(s, 6.6, 10.2), 600);
  } else {
    // 3 · end card
    const a = ease((s - 10.2) / 0.6);
    blob(g, cx, cy - u * 0.05, u * 0.14 * a, '#9fd6a4', Math.max(0, Math.sin(s * 2.4)) * 0.25);
    text(g, '만지작', cx, cy + u * 0.2, u * 0.14, a);
    text(g, '오늘도 손끝으로 쉬어 가요', cx, cy + u * 0.33, u * 0.05, ease((s - 10.8) / 0.6), 600);
  }
}
