// Barlow / Barlow Condensed, loaded for <canvas> rendering — build spec
// section 2: "Previous handoffs said 'system fonts only.' That will not
// reproduce this design." A plain <link> stylesheet only affects DOM text;
// a canvas drawImage/fillText needs each face explicitly resolved through
// document.fonts BEFORE the first draw, or that draw measures/paints with
// whatever generic fallback was already available and never catches up
// (there's no later repaint to fix it — this is a one-shot static render,
// not a live DOM layout).
//
// Every font string used by lib/collageRender.ts carries the full fallback
// chain (DISPLAY_FONT/BODY_FONT below) rather than branching on whether the
// web font actually loaded — <canvas> font resolution already falls back
// per the comma list on its own, so awaiting this once before the first
// draw is all that's needed either way: if Barlow Condensed loaded in
// time, the browser uses it; if not (offline, blocked, slow network), it
// silently uses Arial Narrow instead, and the mandatory name auto-shrink
// (build spec section 6) works correctly either way since it always
// measures with whatever font ctx.font actually resolved to.

const GOOGLE_FONTS_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600&display=swap';

export const DISPLAY_FONT = '"Barlow Condensed", "Arial Narrow", "Helvetica Neue Condensed", sans-serif';
export const BODY_FONT = '"Barlow", system-ui, sans-serif';

let fontsReadyPromise: Promise<void> | null = null;

function injectStylesheetLink(): Promise<void> {
  if (document.querySelector('link[data-collage-fonts]')) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = GOOGLE_FONTS_CSS_URL;
    link.setAttribute('data-collage-fonts', 'true');
    // Never block on this: a 404/offline network must still resolve so the
    // caller falls back to Arial Narrow rather than hanging.
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
    setTimeout(resolve, 2000);
  });
}

/**
 * Resolves once Barlow/Barlow Condensed are loaded (or have definitively
 * failed/timed out) — never rejects, since a missing web font is a
 * fallback-metrics case (build spec section 2), not an error. Memoized:
 * every renderCollage/renderCollageBack call awaits this, but the actual
 * network fetch only ever happens once per page session.
 */
export function ensureCollageFontsLoaded(): Promise<void> {
  if (fontsReadyPromise) return fontsReadyPromise;
  fontsReadyPromise = (async () => {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    try {
      await injectStylesheetLink();
      const specs = [
        '600 16px "Barlow Condensed"',
        '700 16px "Barlow Condensed"',
        '800 16px "Barlow Condensed"',
        '400 16px "Barlow"',
        '500 16px "Barlow"',
        '600 16px "Barlow"',
      ];
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
      await Promise.race([Promise.all(specs.map((spec) => document.fonts.load(spec))), timeout]);
    } catch (error) {
      console.error('Collage font loading failed — falling back to Arial Narrow metrics:', error);
    }
  })();
  return fontsReadyPromise;
}
