// LeadPack Photos collage — the printed two-sided artifact (front: photos,
// back: stats/race history/team photo). This is a from-scratch
// implementation of the approved Design Canvas mockup ("LeadPack Collage:
// Build Spec") — earlier drafts iterated on this file's geometry blind
// (hand-computed canvas math with no way to see the rendered result);
// every number below instead traces back to a specific line in that spec
// or the mockup's own HTML, not a guess.
//
// Coordinate system (spec section 1): every position/size below is a
// "design unit" on an 816 x 1056 page (US Letter at 96 px/in). `scale =
// pageWidth / 816` turns a design unit into a real pixel at whatever
// canvas size is actually rendering — the on-screen preview (850x1100) and
// the full-res export (2550x3300) share every drawing function below,
// only `scale` differs.

import { HERO, PANELS, PANEL_LEAN, heroPixelRect, type PhotoPanel } from './templates';
import { formatRaceTime, formatRaceDate, formatRaceDistance } from './raceFormat';
import { ensureCollageFontsLoaded, DISPLAY_FONT, BODY_FONT } from './collageFonts';
import { drawQrCode } from './qrCode';
import type { AthleteBuildStats, AthleteRaceResult } from '../state/types';

export interface CollageHeaderText {
  name: string;
  team: string;
  season: string;
}

/** A photo's chosen crop position within its slot — see coverFitOffset below. */
export interface FocalPoint {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Palette (build spec section 2). Only `accent` is a customizable team
// token; everything else is fixed. accentDark/accentLight are derived from
// `accent` at render time (deriveAccentShades below) rather than being
// separate tokens a caller has to keep in sync with it.
// ---------------------------------------------------------------------------

const PAPER = '#f7f6f2';
const INK = '#1f2a22';
const MUTED = '#4b5a4f';
const RULE = '#cfcabd';
const DEFAULT_ACCENT = '#2b6cb0';

/**
 * Lets the browser's own CSS color parser resolve whatever string `accent`
 * is (hex, oklch, named, …) into concrete sRGB bytes, via a throwaway 1x1
 * canvas — simplest reliable way to derive two more shades from an
 * arbitrary, team-chosen color without a full color-space library.
 */
function resolveRgb(cssColor: string): [number, number, number] {
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const probeCtx = probe.getContext('2d')!;
  probeCtx.fillStyle = cssColor;
  probeCtx.fillRect(0, 0, 1, 1);
  const [r, g, b] = probeCtx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, l];
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

const hslCss = (h: number, s: number, l: number) => `hsl(${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%)`;

/**
 * accentDark: lightness scaled to ~70% of the accent's own (spec section
 * 2's exact rule — verified against the default accent #2b6cb0 /
 * accentDark #1d4f8c pair, whose lightness ratio is ~0.70) so small
 * accent-colored text (coach labels, the chart's PR label) keeps passing
 * contrast on the paper background regardless of which hue a team picks.
 * accentLight (logo ridge only) blends toward white, tuned to land on the
 * default accent/accentLight pair (#2b6cb0 -> #5b9be0) the mockup uses.
 */
function deriveAccentShades(accent: string): { dark: string; light: string } {
  const [h, s, l] = rgbToHsl(...resolveRgb(accent));
  return {
    dark: hslCss(h, s, l * 0.7),
    light: hslCss(h, s + (1 - s) * 0.2, l + (1 - l) * 0.35),
  };
}

// ---------------------------------------------------------------------------
// Low-level drawing helpers shared by the front and back pages.
// ---------------------------------------------------------------------------

// crossOrigin: 'anonymous' is required for the canvas this draws onto to
// stay "untainted" so canvas.toDataURL() (the export in
// modules/BuildModule.tsx) doesn't throw a SecurityError — but setting it
// also means the browser REQUIRES a valid CORS response (R2's bucket CORS
// rule allowing GET, not just PUT) or the image fails to load at all
// (onerror, not a tainted-but-visible image). The on-screen preview never
// calls toDataURL(), so it has no reason to pay that cost — this is opt-in
// per call (anonymous = true only for the real export canvas in
// BuildModule.tsx).
function loadImage(src: string, anonymous: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (anonymous) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src.slice(0, 80)}`));
    img.src = src;
  });
}

/** Like loadImage, but never rejects — a missing/broken custom logo just means "fall back to the drawn roundel", never a failed render (not even for the export canvas; branding is cosmetic, not content a coach is missing). */
function loadOptionalImage(url: string | null | undefined, anonymous: boolean): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return loadImage(url, anonymous).catch((error) => {
    console.error(`Collage logo failed to load, falling back to the drawn logo: ${error.message}`);
    return null;
  });
}

/**
 * Cover-fit math shared with components/CollagePreview.tsx's drag handler,
 * so the two never disagree about where a given focal point puts the
 * image. focalX/focalY (each 0-1, default 0.5 = centered) say where, along
 * whichever axis the cover crop overflows, the crop sits — 0 pins it to
 * the top/left of the overflow, 1 to the bottom/right.
 */
export function coverFitOffset(frameW: number, frameH: number, imgW: number, imgH: number, focalX = 0.5, focalY = 0.5) {
  const scale = Math.max(frameW / imgW, frameH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const overflowX = drawW - frameW;
  const overflowY = drawH - frameH;
  return {
    drawW,
    drawH,
    overflowX,
    overflowY,
    dx: -overflowX * focalX,
    dy: -overflowY * focalY,
  };
}

/** Draws `img` cover-fit into the (x,y,w,h) frame. No clip of its own — the caller sets up whatever clip path (rect/circle/polygon) applies first. */
function drawImageCoverFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, focalX = 0.5, focalY = 0.5) {
  const { drawW, drawH, dx, dy } = coverFitOffset(w, h, img.width, img.height, focalX, focalY);
  ctx.drawImage(img, x + dx, y + dy, drawW, drawH);
}

function polygonPath(ctx: CanvasRenderingContext2D, points: [number, number][]) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

function fillPolygon(ctx: CanvasRenderingContext2D, points: [number, number][], color: string) {
  ctx.save();
  polygonPath(ctx, points);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Design-unit points (see this file's header comment) -> real pixels. */
function scalePoints(points: [number, number][], scale: number): [number, number][] {
  return points.map(([x, y]) => [x * scale, y * scale]);
}

/** Truncates text with an ellipsis so it fits maxWidth, rather than overflowing into the next column. Expects ctx.font already set. */
function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function trackedTextWidth(ctx: CanvasRenderingContext2D, text: string, trackingPx: number): number {
  let width = 0;
  for (const ch of text) width += ctx.measureText(ch).width;
  return width + trackingPx * Math.max(0, text.length - 1);
}

/**
 * Draws letter-spaced ("tracked") caps labels glyph by glyph — the build
 * spec's own documented fallback for ctx.letterSpacing ("check the
 * browsers you target"), used unconditionally rather than branching on
 * support, so output doesn't depend on which Chromium version renders it.
 * Expects ctx.font and ctx.fillStyle already set. Returns the total width,
 * which callers that right-align a multi-part line (e.g. a legend's dot +
 * label) need to position what comes before it.
 */
function fillTrackedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, trackingPx: number, align: 'left' | 'right' | 'center'): number {
  const total = trackedTextWidth(ctx, text, trackingPx);
  let cursor = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + trackingPx;
  }
  ctx.textAlign = prevAlign;
  return total;
}

/**
 * The mandatory name auto-shrink (build spec section 6): shrinks `text`'s
 * font until it fits maxWidth, stopping at ~60% of the full size, then
 * truncates with an ellipsis if it still doesn't fit even there. Applies
 * regardless of whether Barlow Condensed or the Arial Narrow fallback
 * ended up loaded — this only ever measures whatever ctx.font actually
 * resolved to.
 */
function fitNameFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, fullSize: number, fontFamily: string, weight: number): { fontSize: number; text: string } {
  const minSize = fullSize * 0.6;
  let size = fullSize;
  const step = Math.max(1, fullSize * 0.01);
  ctx.font = `${weight} ${size}px ${fontFamily}`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size = Math.max(minSize, size - step);
    ctx.font = `${weight} ${size}px ${fontFamily}`;
  }
  const finalText = ctx.measureText(text).width > maxWidth ? truncateToWidth(ctx, text, maxWidth) : text;
  return { fontSize: size, text: finalText };
}

/** Greedily wraps `text` onto at most `maxLines` lines within maxWidth, truncating the last line with an ellipsis if even it overflows. Expects ctx.font already set. */
function wrapToLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  let i = 0;
  while (i < words.length) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;
    const fits = ctx.measureText(candidate).width <= maxWidth;
    const isLastAllowedLine = lines.length === maxLines - 1;
    if (!fits && current && isLastAllowedLine) break; // out of lines — stop accumulating, truncate what's left below
    if (!fits && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    i++;
  }
  if (lines.length < maxLines) {
    const rest = [current, ...words.slice(i)].filter(Boolean).join(' ');
    lines.push(ctx.measureText(rest).width > maxWidth ? truncateToWidth(ctx, rest, maxWidth) : rest);
  }
  return lines;
}

/** Draws `img` contain-fit (not cropped, unlike every photo elsewhere on the page — a logo's own proportions matter) centered in the (x,y,size,size) box. */
function drawImageContainFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, size: number) {
  const scale = Math.min(size / img.width, size / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img, x + (size - drawW) / 2, y + (size - drawH) / 2, drawW, drawH);
}

/**
 * The logo — a team's own uploaded image if they set one (Build settings;
 * replaces the drawn logo everywhere it appears, at the same size and
 * position, contain-fit rather than cropped), otherwise the shared XC
 * roundel (build spec section 3, item 6), drawn once as a function rather
 * than per-athlete, used at 96x96 on the front and 60x60 on the back.
 * Everything in the roundel below is in the mockup's own 100-unit box;
 * ctx.scale(unit, unit) turns that into whatever pixel size `size` asks
 * for without needing a second, hand-converted copy of every coordinate.
 */
function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, accent: string, accentLight: string, customLogoImg: HTMLImageElement | null) {
  if (customLogoImg) {
    drawImageContainFit(ctx, customLogoImg, x, y, size);
    return;
  }
  const unit = size / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(unit, unit);

  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(50, 50, 50, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(50, 50, 43, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = PAPER;
  ctx.font = `800 40px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('XC', 50, 52);

  ctx.strokeStyle = accentLight;
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(24, 78);
  ctx.lineTo(38, 66);
  ctx.lineTo(47, 73);
  ctx.lineTo(61, 58);
  ctx.lineTo(76, 78);
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Front page — build spec section 3.
// ---------------------------------------------------------------------------

function panelBbox(panel: PhotoPanel, pageWidth: number, pageHeight: number) {
  return { x: panel.rect.x * pageWidth, y: panel.rect.y * pageHeight, w: panel.rect.w * pageWidth, h: panel.rect.h * pageHeight };
}

/**
 * A panel's actual (slanted) visible edge — see lib/templates.ts's
 * PhotoPanel/PANEL_LEAN. 'left' panels (A, C) keep their full top edge and
 * lose PANEL_LEAN off the bottom-right corner; 'right' panels (B, D) lose
 * it off the top-left corner instead.
 */
function panelPolygon(panel: PhotoPanel, pageWidth: number, pageHeight: number, scale: number): [number, number][] {
  const { x, y, w, h } = panelBbox(panel, pageWidth, pageHeight);
  const lean = PANEL_LEAN * scale;
  if (panel.lean === 'left') {
    return [[x, y], [x + w, y], [x + w - lean, y + h], [x, y + h]];
  }
  return [[x + lean, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

function drawPanelPhoto(ctx: CanvasRenderingContext2D, panel: PhotoPanel, img: HTMLImageElement | null, pageWidth: number, pageHeight: number, scale: number, focal: FocalPoint | undefined) {
  const bbox = panelBbox(panel, pageWidth, pageHeight);
  ctx.save();
  polygonPath(ctx, panelPolygon(panel, pageWidth, pageHeight, scale));
  ctx.clip();
  if (img) {
    const f = focal ?? { x: 0.5, y: panel.focusY };
    drawImageCoverFit(ctx, img, bbox.x, bbox.y, bbox.w, bbox.h, f.x, f.y);
  } else {
    // Fewer than 5 photos is out of scope (the template-size picker is
    // gone), but build spec section 6 still asks for a graceful fallback
    // rather than a crash.
    ctx.fillStyle = RULE;
    ctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
  }
  ctx.restore();
}

function drawHeroCircle(ctx: CanvasRenderingContext2D, pageWidth: number, pageHeight: number, img: HTMLImageElement | null, focal: FocalPoint | undefined) {
  const hero = heroPixelRect(HERO, pageWidth, pageHeight);
  const cx = hero.x + hero.w / 2;
  const cy = hero.y + hero.h / 2;

  // Build spec section 3, item 5: "draw the image clipped to r=210, then
  // stroke a circle at r=203 with lineWidth 14 in paper" — mathematically
  // identical to the mockup's own border-box circle (clip photo to r=196,
  // ring occupies 196-210) but simpler: the paper ring just paints over
  // the photo's own outer 14px band afterward.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, hero.radius, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    const f = focal ?? { x: 0.5, y: 0.5 };
    drawImageCoverFit(ctx, img, hero.x, hero.y, hero.w, hero.h, f.x, f.y);
  } else {
    ctx.fillStyle = RULE;
    ctx.fillRect(hero.x, hero.y, hero.w, hero.h);
  }
  ctx.restore();

  const ringWidth = (14 / 210) * hero.radius;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, hero.radius - ringWidth / 2, 0, Math.PI * 2);
  ctx.lineWidth = ringWidth;
  ctx.strokeStyle = PAPER;
  ctx.stroke();
  ctx.restore();
}

function drawFrontTextBlock(ctx: CanvasRenderingContext2D, scale: number, header: CollageHeaderText, stats: AthleteBuildStats | null, accent: string) {
  const d = (n: number) => n * scale;
  const left = d(156);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const teamLine = [header.team || 'Team', header.season ? `${header.season} Season` : null].filter(Boolean).join(' · ').toUpperCase();
  ctx.font = `600 ${d(14)}px ${BODY_FONT}`;
  ctx.fillStyle = MUTED;
  fillTrackedText(ctx, teamLine, left, d(838), 0.16 * d(14), 'left');

  const name = (header.name || 'Athlete Name').toUpperCase();
  const fullNameSize = d(66);
  ctx.fillStyle = INK;
  const { fontSize, text } = fitNameFont(ctx, name, d(776) - left, fullNameSize, DISPLAY_FONT, 800);
  ctx.font = `800 ${fontSize}px ${DISPLAY_FONT}`;
  ctx.fillText(text, left, d(866));

  // Bottom row — rule, GRADE (left), CAREER-BEST 5K (right), all sharing
  // one baseline regardless of each piece's own font size.
  ctx.strokeStyle = INK;
  ctx.lineWidth = d(2);
  ctx.beginPath();
  ctx.moveTo(d(40), d(964));
  ctx.lineTo(d(776), d(964));
  ctx.stroke();

  const baselineY = d(1010);
  ctx.textBaseline = 'alphabetic';

  ctx.textAlign = 'right';
  const timeText = stats?.careerBest5kSec != null ? formatRaceTime(stats.careerBest5kSec) : '-';
  ctx.font = `800 ${d(34)}px ${DISPLAY_FONT}`;
  ctx.fillStyle = accent;
  ctx.fillText(timeText, d(776), baselineY);
  const timeWidth = ctx.measureText(timeText).width;

  ctx.font = `600 ${d(14)}px ${BODY_FONT}`;
  ctx.fillStyle = MUTED;
  fillTrackedText(ctx, 'CAREER-BEST 5K', d(776) - timeWidth - d(10), baselineY, 0.12 * d(14), 'right');

  ctx.textAlign = 'left';
  // "GRADE 10 · 2026" — season sits right next to grade rather than only
  // appearing in the small team line above, per the coach's own request.
  const gradeText = [stats?.grade != null ? `GRADE ${stats.grade}` : 'GRADE -', header.season || null].filter(Boolean).join(' · ');
  ctx.font = `600 ${d(16)}px ${BODY_FONT}`;
  ctx.fillStyle = MUTED;
  fillTrackedText(ctx, gradeText, d(40), baselineY, 0.12 * d(16), 'left');
}

/**
 * The front page: four angled photo panels around a big circled hero
 * photo, the athlete's name, and a single headline stat — build spec
 * section 3. `photoUrls`/`focalPoints` are aligned with picks order: index
 * 0 is always the hero (picks[0]), indices 1-4 fill panels A-D in order.
 */
export async function renderCollage(
  canvas: HTMLCanvasElement,
  pageWidth: number,
  pageHeight: number,
  photoUrls: string[],
  header: CollageHeaderText,
  // true only for the hidden export canvas (BuildModule.tsx's
  // handleExport) — see loadImage's own comment on why the preview must
  // not set this.
  requireExportableCanvas = false,
  // null while stats are still loading, or for an athlete with no race
  // results yet — the bottom-row PR and grade just show "-" in that case.
  stats: AthleteBuildStats | null = null,
  // Per-slot crop position, aligned 1:1 with photoUrls — the Build
  // module's "move the photo to see faces" drag. undefined/missing
  // entries default to each panel's own focus (see lib/templates.ts's
  // PhotoPanel.focusY), not always dead-center.
  focalPoints: (FocalPoint | undefined)[] = [],
  // The team's own Build-settings accent (a color readable on this light
  // page), independent of the app's own live theme; the design's default
  // otherwise.
  accent: string = DEFAULT_ACCENT,
  // A team's own uploaded logo (Build settings) — null uses the drawn XC
  // roundel instead. Same crossOrigin/URL-shape split as every photo:
  // pass the presigned URL for the preview, the same-origin blob URL
  // (photosService.getCollageLogoBlobUrl) for the export.
  logoUrl: string | null = null,
): Promise<void> {
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  await ensureCollageFontsLoaded();
  const scale = pageWidth / 816;
  const { light: accentLight } = deriveAccentShades(accent);

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, pageWidth, pageHeight);

  const heroFocal = focalPoints[0];
  const panelFocalPoints = focalPoints.slice(1);

  // Per-photo, not Promise.all: one broken/expired URL must not blank the
  // other four slots along with it.
  const [images, logoImg] = await Promise.all([
    Promise.all(
      photoUrls.map((url, i) =>
        url
          ? loadImage(url, requireExportableCanvas).catch((error) => {
              console.error(`Collage slot ${i}: ${error.message}`);
              return null;
            })
          : Promise.resolve(null),
      ),
    ),
    loadOptionalImage(logoUrl, requireExportableCanvas),
  ]);
  const failedCount = images.filter((img, i) => !img && photoUrls[i]).length;
  const heroImg = images[0] ?? null;
  const panelImages = images.slice(1);

  PANELS.forEach((panel, i) => drawPanelPhoto(ctx, panel, panelImages[i] ?? null, pageWidth, pageHeight, scale, panelFocalPoints[i]));

  ctx.fillStyle = accent;
  ctx.fillRect(0, 406 * scale, pageWidth, 8 * scale);

  // The slanted bottom cut: paper erases the panels' lower slice, then the
  // accent stripe sits right on that new edge.
  fillPolygon(ctx, scalePoints([[0, 818], [816, 748], [816, 1056], [0, 1056]], scale), PAPER);
  fillPolygon(ctx, scalePoints([[0, 810], [816, 740], [816, 748], [0, 818]], scale), accent);

  // The hero is drawn last, deliberately overlapping both the row gap bar
  // and the stripe cut above.
  drawHeroCircle(ctx, pageWidth, pageHeight, heroImg, heroFocal);

  drawLogo(ctx, 40 * scale, 836 * scale, 96 * scale, accent, accentLight, logoImg);
  drawFrontTextBlock(ctx, scale, header, stats, accent);

  // The export canvas (requireExportableCanvas) is the one place a failed
  // load is worth refusing over, rather than just drawing a gray box and
  // moving on — a coach printing this for a senior banquet needs to know
  // it's missing a photo, not discover it after handing out a page with a
  // hole in it.
  if (requireExportableCanvas && failedCount > 0) {
    throw new Error(
      `${failedCount} of ${photoUrls.filter(Boolean).length} photo${failedCount === 1 ? '' : 's'} failed to load — ` +
        'often a CORS setting on the image storage bucket (it needs to allow GET, not just PUT). Check the browser console for which one(s).',
    );
  }
}

// ---------------------------------------------------------------------------
// Back page — build spec section 4 (stat tiles, race table, pace chart,
// coaches, team photo, LeadPack/QR card). A fixed, stats-only layout —
// unlike the front it has no photo picks, so it doesn't vary per athlete
// beyond the numbers/text/photo plugged into it.
// ---------------------------------------------------------------------------

function drawBackHeader(ctx: CanvasRenderingContext2D, scale: number, header: CollageHeaderText, stats: AthleteBuildStats | null, accent: string, accentLight: string, logoImg: HTMLImageElement | null) {
  const d = (n: number) => n * scale;
  drawLogo(ctx, d(40), d(36), d(60), accent, accentLight, logoImg);

  const nameX = d(116);
  const maxNameWidth = d(776) - nameX;
  const fullSize = d(36);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = INK;
  const name = (header.name || 'Athlete Name').toUpperCase();
  const { fontSize, text } = fitNameFont(ctx, name, maxNameWidth, fullSize, DISPLAY_FONT, 800);
  const nameTop = d(38);
  ctx.font = `800 ${fontSize}px ${DISPLAY_FONT}`;
  ctx.fillText(text, nameX, nameTop);

  // Positioned off the FULL (unshrunk) name size, not the shrunk one — a
  // long name must not also shove the subtitle line around.
  const subtitleTop = nameTop + fullSize + d(6);
  const parts = [header.team || 'Team', header.season ? `${header.season} Season` : null, `Grade ${stats?.grade ?? '-'}`].filter(Boolean);
  ctx.font = `600 ${d(14)}px ${BODY_FONT}`;
  ctx.fillStyle = MUTED;
  fillTrackedText(ctx, parts.join(' · ').toUpperCase(), nameX, subtitleTop, 0.16 * d(14), 'left');
}

function backTileValue(stats: AthleteBuildStats | null, pick: (s: AthleteBuildStats) => string | null): string {
  if (!stats) return '-';
  return pick(stats) ?? '-';
}

function drawStatTiles(ctx: CanvasRenderingContext2D, scale: number, stats: AthleteBuildStats | null, accent: string) {
  const d = (n: number) => n * scale;
  const tiles: { value: string; label: string; accent: boolean }[] = [
    { value: backTileValue(stats, (s) => (s.careerBest5kSec != null ? formatRaceTime(s.careerBest5kSec) : null)), label: 'CAREER-BEST 5K', accent: true },
    { value: backTileValue(stats, (s) => String(s.totalRaces)), label: 'RACES', accent: false },
    { value: backTileValue(stats, (s) => (s.totalMiles != null ? (Number.isInteger(s.totalMiles) ? String(s.totalMiles) : s.totalMiles.toFixed(1)) : null)), label: 'RACE MILES', accent: false },
    { value: backTileValue(stats, (s) => (s.averagePaceSecPerMile != null ? formatRaceTime(s.averagePaceSecPerMile) : null)), label: 'AVG PACE / MILE', accent: false },
  ];

  const left = d(40);
  const top = d(114);
  const totalWidth = d(776) - left;
  const gap = d(12);
  const colWidth = (totalWidth - gap * (tiles.length - 1)) / tiles.length;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  tiles.forEach((tile, i) => {
    const x = left + i * (colWidth + gap);
    ctx.fillStyle = tile.accent ? accent : INK;
    ctx.fillRect(x, top, colWidth, d(3));

    const valueTop = top + d(3) + d(6);
    ctx.font = `800 ${d(58)}px ${DISPLAY_FONT}`;
    ctx.fillStyle = tile.accent ? accent : INK;
    ctx.fillText(tile.value, x, valueTop);

    const labelTop = valueTop + d(58) + d(4);
    ctx.font = `600 ${d(14)}px ${BODY_FONT}`;
    ctx.fillStyle = MUTED;
    fillTrackedText(ctx, tile.label, x, labelTop, 0.08 * d(14), 'left');
  });
}

/**
 * Which races the table prints (build spec section 6): every race up to
 * 15; past that, every "best" race plus the latest, capped at 14 overall
 * (trimming the oldest non-latest best rows first if even that overflows),
 * always kept in date order.
 */
function selectRacesForTable(races: AthleteRaceResult[], bestByDistance: AthleteBuildStats['bestByDistance']): AthleteRaceResult[] {
  if (races.length <= 15) return races;
  const key = (r: { raceName: string; date: string }) => `${r.raceName}|${r.date}`;
  const isBest = (r: AthleteRaceResult) => bestByDistance.some((b) => b.raceName === r.raceName && b.date === r.date);
  const latestKey = key(races[races.length - 1]);
  const keep = new Set(races.filter(isBest).map(key));
  keep.add(latestKey);

  let kept = races.filter((r) => keep.has(key(r)));
  if (kept.length > 14) {
    const trimmable = kept.filter((r) => key(r) !== latestKey);
    const dropCount = kept.length - 14;
    const dropKeys = new Set(trimmable.slice(0, dropCount).map(key));
    kept = kept.filter((r) => !dropKeys.has(key(r)));
  }
  return kept;
}

function drawRaceTable(ctx: CanvasRenderingContext2D, scale: number, stats: AthleteBuildStats | null, accent: string) {
  if (!stats || stats.races.length === 0) return;
  const d = (n: number) => n * scale;
  const left = d(40);
  const top = d(232);
  const width = d(440);

  ctx.strokeStyle = INK;
  ctx.lineWidth = d(2);
  ctx.beginPath();
  ctx.moveTo(left, top + d(28));
  ctx.lineTo(left + width, top + d(28));
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${d(14)}px ${BODY_FONT}`;
  ctx.fillStyle = INK;
  fillTrackedText(ctx, 'EVERY RACE', left, top + d(14), 0.12 * d(14), 'left');

  ctx.font = `500 ${d(13)}px ${BODY_FONT}`;
  const legendText = 'Best at that distance';
  const legendTextWidth = ctx.measureText(legendText).width;
  const dotRadius = d(4.5);
  const legendGap = d(6);
  const legendTotalWidth = dotRadius * 2 + legendGap + legendTextWidth;
  const legendDotX = left + width - legendTotalWidth + dotRadius;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(legendDotX, top + d(14), dotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MUTED;
  ctx.fillText(legendText, legendDotX + dotRadius + legendGap, top + d(14));

  const selected = selectRacesForTable(stats.races, stats.bestByDistance);
  const rowHeight = d(Math.min(30, Math.max(24, 372 / selected.length)));
  const dotColW = d(12);
  const dateColW = d(46);
  const distColW = d(50);
  const timeColW = d(48);
  const colGap = d(8);
  const nameColW = width - dotColW - dateColW - distColW - timeColW - colGap * 4;
  const fontSize = d(15);

  let rowTop = top + d(28);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const race of selected) {
    const rowCenterY = rowTop + rowHeight / 2;
    const isBest = stats.bestByDistance.some((b) => b.raceName === race.raceName && b.date === race.date);
    let x = left;

    if (isBest) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(x + dotColW / 2, rowCenterY, d(4.5), 0, Math.PI * 2);
      ctx.fill();
    }
    x += dotColW + colGap;

    ctx.font = `${fontSize}px ${BODY_FONT}`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'left';
    ctx.fillText(formatRaceDate(race.date), x, rowCenterY);
    x += dateColW + colGap;

    ctx.fillStyle = INK;
    ctx.fillText(truncateToWidth(ctx, race.raceName, nameColW), x, rowCenterY);
    x += nameColW + colGap;

    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    ctx.fillText(formatRaceDistance(race.distanceLabel, race.distanceMeters), x + distColW, rowCenterY);
    x += distColW + colGap;

    ctx.font = `${isBest ? 700 : 500} ${fontSize}px ${BODY_FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(formatRaceTime(race.timeSec), x + timeColW, rowCenterY);

    ctx.strokeStyle = RULE;
    ctx.lineWidth = d(1);
    ctx.beginPath();
    ctx.moveTo(left, rowTop + rowHeight);
    ctx.lineTo(left + width, rowTop + rowHeight);
    ctx.stroke();

    rowTop += rowHeight;
  }
}

interface PacePoint {
  raceName: string;
  dateMs: number;
  pace: number;
  timeSec: number;
  distanceMeters: number;
}

/**
 * Build spec section 5. Plots only races over a mile (drops the mile time
 * trial); x is proportional to days since the first PLOTTED race rather
 * than an even index-based spread, so a long gap between two races reads
 * as a gap on the chart. Anchoring day 0 to the first plotted race rather
 * than the season's literal first race (which the spec's own worked
 * example anchors to) produces identical relative spacing either way —
 * (dayIndex - dayMin) is invariant to a shift in the epoch.
 */
function buildPacePoints(races: AthleteRaceResult[]): PacePoint[] {
  return races
    .filter((r): r is AthleteRaceResult & { distanceMeters: number } => r.distanceMeters != null && r.distanceMeters > 1609.344)
    .map((r) => ({ raceName: r.raceName, dateMs: new Date(r.date).getTime(), timeSec: r.timeSec, distanceMeters: r.distanceMeters, pace: r.timeSec / (r.distanceMeters / 1609.344) }))
    .filter((r) => !Number.isNaN(r.dateMs))
    .sort((a, b) => a.dateMs - b.dateMs);
}

/** Draws the pace chart into a `chartLeft`,`chartTop`-anchored 272x176 (design-unit) box. Returns false (drawing nothing) when there isn't enough data to chart a trend. */
function drawPaceChart(ctx: CanvasRenderingContext2D, scale: number, chartLeft: number, chartTop: number, stats: AthleteBuildStats | null, accent: string, accentDark: string): boolean {
  if (!stats) return false;
  const d = (n: number) => n * scale;
  const points = buildPacePoints(stats.races);
  if (points.length < 2) return false;

  const firstMs = points[0].dateMs;
  const lastMs = points[points.length - 1].dateMs;
  const dayIndex = (ms: number) => (ms - firstMs) / 86400000;
  const dayMax = dayIndex(lastMs);
  const plotX = (ms: number) => chartLeft + d(26) + (dayMax > 0 ? dayIndex(ms) / dayMax : 0.5) * d(226);

  const paces = points.map((p) => p.pace);
  const lo = Math.floor(Math.min(...paces) / 10) * 10;
  const hi = Math.ceil(Math.max(...paces) / 10) * 10;
  const plotY = (pace: number) => chartTop + d(14) + (hi > lo ? (pace - lo) / (hi - lo) : 0.5) * d(118);
  const baselineY = chartTop + d(140);

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `${d(13)}px ${BODY_FONT}`;
  ctx.fillStyle = MUTED;
  ctx.strokeStyle = RULE;
  ctx.lineWidth = d(1);
  for (let v = Math.ceil((lo + 1) / 30) * 30; v < hi; v += 30) {
    const y = plotY(v);
    ctx.beginPath();
    ctx.moveTo(chartLeft + d(26), y);
    ctx.lineTo(chartLeft + d(272), y);
    ctx.stroke();
    ctx.fillText(formatRaceTime(v), chartLeft + d(20), y);
  }

  ctx.strokeStyle = MUTED;
  ctx.lineWidth = d(1);
  ctx.beginPath();
  ctx.moveTo(chartLeft + d(26), baselineY);
  ctx.lineTo(chartLeft + d(272), baselineY);
  ctx.stroke();

  // The race matching careerBest5kSec gets a highlighted dot + label —
  // skipped (bestIndex stays -1) when that PR belongs to an earlier season
  // and simply isn't one of this season's plotted points.
  const bestIndex = points.findIndex((p) => Math.abs(p.distanceMeters - 5000) < 50 && stats.careerBest5kSec != null && Math.abs(p.timeSec - stats.careerBest5kSec) < 0.5);

  ctx.strokeStyle = INK;
  ctx.lineWidth = d(2.5);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = plotX(p.dateMs);
    const y = plotY(p.pace);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = INK;
  points.forEach((p, i) => {
    if (i === bestIndex) return;
    ctx.beginPath();
    ctx.arc(plotX(p.dateMs), plotY(p.pace), d(3.5), 0, Math.PI * 2);
    ctx.fill();
  });
  if (bestIndex >= 0) {
    const p = points[bestIndex];
    const x = plotX(p.dateMs);
    const y = plotY(p.pace);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x, y, d(7), 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 ${d(13)}px ${BODY_FONT}`;
    ctx.fillStyle = accentDark;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${formatRaceTime(p.pace)} · 5K best`, x, y - d(12));
  }

  // X axis: the first plotted race's month at the left edge (no tick —
  // it's just "whichever month we're starting in"), then a tick + centered
  // label at every month boundary the plotted range actually crosses.
  const monthName = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  ctx.font = `${d(13)}px ${BODY_FONT}`;
  ctx.fillStyle = MUTED;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(monthName(firstMs), chartLeft + d(26), chartTop + d(160));

  const first = new Date(firstMs);
  let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  while (cursor.getTime() <= lastMs) {
    const x = plotX(cursor.getTime());
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = d(1);
    ctx.beginPath();
    ctx.moveTo(x, baselineY);
    ctx.lineTo(x, baselineY + d(6));
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(monthName(cursor.getTime()), x, chartTop + d(160));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return true;
}

function drawCoachesSection(ctx: CanvasRenderingContext2D, scale: number, originX: number, top: number, coaches: AthleteBuildStats['coaches'], accentDark: string) {
  const d = (n: number) => n * scale;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  ctx.strokeStyle = INK;
  ctx.lineWidth = d(2);
  ctx.beginPath();
  ctx.moveTo(originX, top + d(28));
  ctx.lineTo(originX + d(272), top + d(28));
  ctx.stroke();
  ctx.font = `600 ${d(14)}px ${BODY_FONT}`;
  ctx.fillStyle = INK;
  fillTrackedText(ctx, 'COACHES', originX, top + d(7), 0.12 * d(14), 'left');

  const bodyTop = top + d(28) + d(8);
  const colGap = d(12);
  const colWidth = (d(272) - colGap) / 2;
  const rightX = originX + colWidth + colGap;
  const labelLineHeight = d(16);
  const nameLineHeight = d(22);

  // Each group (head coach, coaches, volunteers) draws only if it has
  // content — an empty group's label+list is hidden outright, and the
  // other column keeps its own position regardless (build spec section
  // 6), since rightX/bodyTop never depend on the left column's content.
  let leftY = bodyTop;
  if (coaches.headCoach) {
    ctx.font = `600 ${d(12)}px ${BODY_FONT}`;
    ctx.fillStyle = accentDark;
    fillTrackedText(ctx, 'HEAD COACH', originX, leftY, 0.1 * d(12), 'left');
    leftY += labelLineHeight;
    ctx.font = `${d(14)}px ${BODY_FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(coaches.headCoach, originX, leftY);
    leftY += nameLineHeight + d(10);
  }
  if (coaches.coaches.length > 0) {
    ctx.font = `600 ${d(12)}px ${BODY_FONT}`;
    ctx.fillStyle = accentDark;
    fillTrackedText(ctx, 'COACHES', originX, leftY, 0.1 * d(12), 'left');
    leftY += labelLineHeight;
    ctx.font = `${d(14)}px ${BODY_FONT}`;
    ctx.fillStyle = INK;
    for (const name of coaches.coaches) {
      ctx.fillText(name, originX, leftY);
      leftY += nameLineHeight;
    }
  }

  if (coaches.volunteers.length > 0) {
    let rightY = bodyTop;
    ctx.font = `600 ${d(12)}px ${BODY_FONT}`;
    ctx.fillStyle = accentDark;
    fillTrackedText(ctx, 'VOLUNTEER COACHES', rightX, rightY, 0.1 * d(12), 'left');
    rightY += labelLineHeight;
    ctx.font = `${d(14)}px ${BODY_FONT}`;
    ctx.fillStyle = INK;
    for (const name of coaches.volunteers) {
      ctx.fillText(name, rightX, rightY);
      rightY += nameLineHeight;
    }
  }
}

/** The back page's right column: the pace chart section, then coaches — one function because the coaches section's top depends on whether the chart drew anything (build spec section 5: "if fewer than 2 plottable races, hide the chart and let the coaches section move up"). */
function drawRightColumn(ctx: CanvasRenderingContext2D, scale: number, originX: number, stats: AthleteBuildStats | null, accent: string, accentDark: string) {
  const d = (n: number) => n * scale;
  const sectionTop = d(232);

  ctx.strokeStyle = INK;
  ctx.lineWidth = d(2);
  ctx.beginPath();
  ctx.moveTo(originX, sectionTop + d(28));
  ctx.lineTo(originX + d(272), sectionTop + d(28));
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${d(14)}px ${BODY_FONT}`;
  ctx.fillStyle = INK;
  fillTrackedText(ctx, 'PACE PER MILE', originX, sectionTop + d(14), 0.12 * d(14), 'left');

  const chartTop = sectionTop + d(28) + d(6);
  const hadChart = drawPaceChart(ctx, scale, originX, chartTop, stats, accent, accentDark);

  let coachesTop: number;
  if (hadChart) {
    const captionTop = chartTop + d(176) + d(2);
    ctx.font = `${d(13)}px ${BODY_FONT}`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Higher is faster. Races over 1 mile only.', originX, captionTop);
    coachesTop = captionTop + d(16) + d(18);
  } else {
    coachesTop = chartTop + d(18);
  }

  drawCoachesSection(ctx, scale, originX, coachesTop, stats?.coaches ?? { headCoach: null, coaches: [], volunteers: [] }, accentDark);
}

function drawBackTeamPhoto(ctx: CanvasRenderingContext2D, scale: number, img: HTMLImageElement | null, accent: string) {
  fillPolygon(ctx, scalePoints([[0, 728], [816, 692], [816, 700], [0, 736]], scale), accent);

  const bboxX = 0;
  const bboxY = 692 * scale;
  const bboxW = 816 * scale;
  const bboxH = 364 * scale;
  ctx.save();
  polygonPath(ctx, scalePoints([[0, 744], [816, 708], [816, 1056], [0, 1056]], scale));
  ctx.clip();
  if (img) {
    // Anchored to the bottom (focalY 1.0), matching the mockup's own
    // object-position: 50% 100% on this shared team photo.
    drawImageCoverFit(ctx, img, bboxX, bboxY, bboxW, bboxH, 0.5, 1.0);
  } else {
    ctx.fillStyle = RULE;
    ctx.fillRect(bboxX, bboxY, bboxW, bboxH);
  }
  ctx.restore();
}

function drawQrCard(ctx: CanvasRenderingContext2D, scale: number, qrUrl: string) {
  const d = (n: number) => n * scale;
  const qrSize = d(60);
  const gap = d(10);
  const padLeft = d(8);
  const padRight = d(12);
  const padTop = d(8);
  const padBottom = d(8);
  const maxTextWidth = d(120);

  const titleFontSize = d(15);
  ctx.font = `800 ${titleFontSize}px ${DISPLAY_FONT}`;
  const titleLines = wrapToLines(ctx, 'CREATED WITH LEADPACK', maxTextWidth, 2);
  const titleWidth = Math.max(...titleLines.map((l) => ctx.measureText(l).width));
  const titleLineHeight = titleFontSize * 1.05;

  const subtitleText = 'View your data here.';
  const subtitleFontSize = d(13);
  ctx.font = `${subtitleFontSize}px ${BODY_FONT}`;
  const subtitleWidth = ctx.measureText(subtitleText).width;
  const subtitleLineHeight = subtitleFontSize * 1.2;

  // Sized from measureText rather than hard-coded (build spec section 4,
  // item 7) — the text column width is whichever actually-measured line
  // is widest, capped at the mockup's own 120-unit max.
  const textColumnWidth = Math.min(maxTextWidth, Math.max(titleWidth, subtitleWidth));
  const textColumnHeight = titleLines.length * titleLineHeight + d(2) + subtitleLineHeight;
  const contentHeight = Math.max(qrSize, textColumnHeight);
  const cardWidth = padLeft + qrSize + gap + textColumnWidth + padRight;
  const cardHeight = padTop + contentHeight + padBottom;

  const cardRight = d(776);
  const cardBottom = d(1016);
  const cardX = cardRight - cardWidth;
  const cardY = cardBottom - cardHeight;

  ctx.fillStyle = PAPER;
  ctx.fillRect(cardX, cardY, cardWidth, cardHeight);

  const qrX = cardX + padLeft;
  const qrY = cardY + padTop + (contentHeight - qrSize) / 2;
  drawQrCode(ctx, qrUrl, qrX, qrY, qrSize, INK, PAPER);

  const textX = qrX + qrSize + gap;
  let textY = cardY + padTop + (contentHeight - textColumnHeight) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 ${titleFontSize}px ${DISPLAY_FONT}`;
  ctx.fillStyle = INK;
  for (const line of titleLines) {
    ctx.fillText(line, textX, textY);
    textY += titleLineHeight;
  }
  textY += d(2);
  ctx.font = `${subtitleFontSize}px ${BODY_FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(subtitleText, textX, textY);
}

/**
 * The back page: header, stat tiles, the full race table, the pace chart,
 * coaches (split by role), a full-bleed team photo, and the LeadPack/QR
 * card whose target is the athlete's own self-registration invite link
 * (AthleteBuildStats.qrUrl — backend/lib/photoBuildStats.js). Same
 * "degrade, don't break" rule as the front page — a null stats object or
 * a group photo that fails to load just draws less, never throws, even
 * for the export canvas: the group photo is one shared team asset reused
 * across every athlete's export, never worth failing a whole batch over.
 */
export async function renderCollageBack(
  canvas: HTMLCanvasElement,
  pageWidth: number,
  pageHeight: number,
  header: CollageHeaderText,
  stats: AthleteBuildStats | null = null,
  // null until a coach sets one (Build module) — see lib/photosAccess.js's
  // setGroupPhoto.
  groupPhotoUrl: string | null = null,
  requireExportableCanvas = false,
  // Same Build-settings accent/logo as the front page — see renderCollage's
  // own comments.
  accent: string = DEFAULT_ACCENT,
  logoUrl: string | null = null,
): Promise<void> {
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  await ensureCollageFontsLoaded();
  const scale = pageWidth / 816;
  const { dark: accentDark, light: accentLight } = deriveAccentShades(accent);

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, pageWidth, pageHeight);

  const logoImg = await loadOptionalImage(logoUrl, requireExportableCanvas);
  drawBackHeader(ctx, scale, header, stats, accent, accentLight, logoImg);
  drawStatTiles(ctx, scale, stats, accent);
  drawRaceTable(ctx, scale, stats, accent);
  drawRightColumn(ctx, scale, 504 * scale, stats, accent, accentDark);

  let groupImg: HTMLImageElement | null = null;
  if (groupPhotoUrl) {
    try {
      groupImg = await loadImage(groupPhotoUrl, requireExportableCanvas);
    } catch (error) {
      console.error(`Collage back page: group photo failed to load: ${(error as Error).message}`);
    }
  }
  drawBackTeamPhoto(ctx, scale, groupImg, accent);

  if (stats?.qrUrl) drawQrCard(ctx, scale, stats.qrUrl);
}
