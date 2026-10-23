import { templateFor, BACK_TEMPLATE, type TemplateRect } from './templates';
import { formatRaceTime, formatPace, formatRaceDate, formatDistance, formatMiles } from './raceFormat';
import { paceChartData, type PaceDatum } from './paceChart';
import type { AthleteBuildStats, TemplateSize } from '../state/types';

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

// crossOrigin: 'anonymous' is required for the canvas this draws onto to
// stay "untainted" so canvas.toDataURL() (the export in
// modules/BuildModule.tsx) doesn't throw a SecurityError — but setting it
// also means the browser REQUIRES a valid CORS response (R2's bucket CORS
// rule allowing GET, not just PUT — see backend/.env.example) or the image
// fails to load at all (onerror, not a tainted-but-visible image). The
// on-screen preview (components/CollagePreview.tsx) never calls
// toDataURL(), so it has no reason to pay that cost or that risk — this is
// opt-in per call (anonymous = true only for the real export canvas in
// BuildModule.tsx) specifically so a CORS misconfiguration breaks only the
// export, which at least now fails loudly (see renderCollage below),
// rather than silently blanking the preview too.
function loadImage(src: string, anonymous: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (anonymous) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src.slice(0, 80)}`));
    img.src = src;
  });
}

/**
 * Cover-fit math shared with components/CollagePreview.tsx's drag
 * handler, so the two never disagree about where a given focal point
 * puts the image. focalX/focalY (each 0-1, default 0.5 = centered) say
 * where, along whichever axis the cover crop overflows, the crop sits —
 * 0 pins it to the top/left of the overflow, 1 to the bottom/right. When
 * an axis has no overflow (the frame and image share that axis's aspect
 * exactly), its focal value has no visible effect.
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

/** Cover-fit, offset by the athlete's chosen focal point — the Build module's "move to see faces" control. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  focalX = 0.5,
  focalY = 0.5,
) {
  const { drawW, drawH, dx, dy } = coverFitOffset(w, h, img.width, img.height, focalX, focalY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + dx, y + dy, drawW, drawH);
  ctx.restore();
}

/** Truncates text with an ellipsis so it fits maxWidth, rather than overflowing into the next column. */
function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

const INK = '#1f2a22';
const MUTED = '#4b5a4f';
const RULE = '#cfcabd';
// The app's own --accent (see index.css) — oklch is a plain valid CSS
// color string, so canvas can use it directly with no hex conversion to
// keep in sync by hand.
const ACCENT = 'oklch(0.68 0.17 45)';

function drawStatStrip(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, pageW: number, pageH: number, stats: AthleteBuildStats | null, accent: string) {
  if (!stats) return;
  // The career PR leads, bolded in ink with a small accent mark ahead of
  // it — a flat run of same-weight gray text was the "boring" part; this
  // gives the one number a coach actually cares most about some visual
  // weight instead of blending into the rest of the line.
  const prText = stats.careerBest5kSec != null ? `PR ${formatRaceTime(stats.careerBest5kSec)} (5K)` : null;
  const rest: string[] = [];
  if (stats.totalMiles != null) rest.push(formatMiles(stats.totalMiles));
  if (stats.averagePaceSecPerMile != null) rest.push(`${formatPace(stats.averagePaceSecPerMile)} avg`);
  rest.push(`${stats.totalRaces} race${stats.totalRaces === 1 ? '' : 's'}`);
  if (!prText && rest.length === 0) return;

  const x = rect.x * pageW;
  const y = rect.y * pageH + rect.h * pageH * 0.5;
  const fontSize = Math.round(pageH * 0.0165);
  ctx.textBaseline = 'middle';

  const markSize = fontSize * 0.42;
  ctx.fillStyle = accent;
  ctx.fillRect(x, y - markSize / 2, markSize, markSize);

  let cursorX = x + markSize + fontSize * 0.45;
  if (prText) {
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = INK;
    ctx.fillText(prText, cursorX, y);
    cursorX += ctx.measureText(prText).width + fontSize * 0.7;
  }
  if (rest.length > 0) {
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = MUTED;
    ctx.fillText(rest.join('   ·   '), cursorX, y);
  }
}

/**
 * "Best by distance" (one line) + the season's full race list (a table,
 * split into two columns once there are more rows than one column can
 * hold cleanly) — the bottom third of the page. Never throws: a missing
 * or short stats object just draws less, the same "degrade, don't break"
 * choice as a missing photo drawing a gray box instead of failing the
 * whole render.
 */
function drawResultsBlock(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, pageW: number, pageH: number, stats: AthleteBuildStats | null, accent: string) {
  if (!stats || (stats.bestByDistance.length === 0 && stats.races.length === 0)) return;

  const left = rect.x * pageW;
  const top = rect.y * pageH;
  const width = rect.w * pageW;
  const labelSize = Math.round(pageH * 0.0125);
  const rowSize = Math.round(pageH * 0.0125);
  // The photo band above runs full-bleed right up to this rect's own top
  // edge (templates.ts's own comment: "no gap on either side") — without
  // this, "SEASON BEST BY DISTANCE" started drawing exactly on that same
  // line, reading as text crammed against the bottom photo's edge instead
  // of its own block.
  let cursorY = top + rowSize * 1.2;

  ctx.textBaseline = 'top';

  // --- Best by distance: one line, e.g. "5K 17:32  ·  2 Mile 11:05" ---
  if (stats.bestByDistance.length > 0) {
    ctx.fillStyle = accent;
    ctx.font = `700 ${labelSize}px system-ui, sans-serif`;
    ctx.fillText('SEASON BEST BY DISTANCE', left, cursorY);
    cursorY += labelSize * 1.6;

    ctx.fillStyle = INK;
    ctx.font = `${rowSize}px system-ui, sans-serif`;
    const line = stats.bestByDistance
      .map((d) => `${formatDistance(d.distanceLabel, d.distanceMeters)} ${formatRaceTime(d.timeSec)}`)
      .join('   ·   ');
    ctx.fillText(truncateToWidth(ctx, line, width), left, cursorY);
    cursorY += rowSize * 1.9;
  }

  if (stats.races.length === 0) return;

  ctx.strokeStyle = RULE;
  ctx.lineWidth = Math.max(1, pageH * 0.0006);
  ctx.beginPath();
  ctx.moveTo(left, cursorY);
  ctx.lineTo(left + width, cursorY);
  ctx.stroke();
  cursorY += rowSize * 0.9;

  ctx.fillStyle = accent;
  ctx.font = `700 ${labelSize}px system-ui, sans-serif`;
  ctx.fillText('RACES THIS SEASON', left, cursorY);
  cursorY += labelSize * 1.6;

  // Two columns once there are enough rows that one column would run out
  // of room — keeps a short season (a handful of meets) as one easy-to-
  // scan list instead of an oddly sparse second column.
  const tableTop = cursorY;
  const tableHeight = top + rect.h * pageH - tableTop;
  const rowHeight = rowSize * 1.45;
  const maxRowsPerColumn = Math.max(1, Math.floor(tableHeight / rowHeight));
  const twoColumns = stats.races.length > maxRowsPerColumn;
  const columnCount = twoColumns ? 2 : 1;
  const rowsPerColumn = Math.ceil(stats.races.length / columnCount);
  const shown = stats.races.slice(0, rowsPerColumn * columnCount);
  const overflow = stats.races.length - shown.length;
  const columnWidth = width / columnCount - (twoColumns ? pageW * 0.015 : 0);
  const dateColW = columnWidth * 0.16;
  const timeColW = columnWidth * 0.2;
  const nameColW = columnWidth - dateColW - timeColW;

  ctx.font = `${rowSize}px system-ui, sans-serif`;
  shown.forEach((race, i) => {
    const col = Math.floor(i / rowsPerColumn);
    const rowInCol = i % rowsPerColumn;
    const x = left + col * (columnWidth + pageW * 0.015);
    const y = tableTop + rowInCol * rowHeight;

    ctx.fillStyle = MUTED;
    ctx.fillText(formatRaceDate(race.date), x, y);

    ctx.fillStyle = INK;
    ctx.fillText(truncateToWidth(ctx, race.raceName, nameColW - pageW * 0.01), x + dateColW, y);

    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    ctx.fillText(formatRaceTime(race.timeSec), x + dateColW + nameColW + timeColW, y);
    ctx.textAlign = 'left';
  });

  if (overflow > 0) {
    const noteY = tableTop + Math.min(rowsPerColumn, maxRowsPerColumn) * rowHeight;
    if (noteY < top + rect.h * pageH) {
      ctx.fillStyle = MUTED;
      ctx.font = `italic ${rowSize}px system-ui, sans-serif`;
      ctx.fillText(`+${overflow} more this season`, left, noteY);
    }
  }
}

export async function renderCollage(
  canvas: HTMLCanvasElement,
  pageWidth: number,
  pageHeight: number,
  templateSize: TemplateSize,
  photoUrls: string[],
  header: CollageHeaderText,
  // true only for the hidden export canvas (BuildModule.tsx's
  // handleExport) — see loadImage's own comment on why the preview must
  // not set this.
  requireExportableCanvas = false,
  // null while stats are still loading, or for an athlete with no race
  // results yet — the stat strip and results block simply draw nothing in
  // that case, same "degrade, don't break" choice as a missing photo.
  stats: AthleteBuildStats | null = null,
  // Per-slot crop position, aligned 1:1 with photoUrls — the Build
  // module's "move the photo to see faces" drag (components/CollagePreview.tsx).
  // undefined/missing entries default to centered, same as no focal point
  // ever having been saved for that photo.
  focalPoints: (FocalPoint | undefined)[] = [],
  // The team's own accent (a color readable on this light page); the app's default otherwise.
  accent: string = ACCENT,
): Promise<void> {
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const template = templateFor(templateSize);

  ctx.fillStyle = '#f7f6f2';
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  drawMarginStripes(ctx, pageWidth, pageHeight, accent);

  // Per-photo, not Promise.all: one broken/expired URL must not blank the
  // other four slots along with it — same "one bad file doesn't sink the
  // rest" principle as the upload and Google Photos import pipelines. Each
  // failure is logged with which slot and why, instead of the whole
  // render silently producing an empty page (the actual bug report this
  // fixed: the canvas looked "blank" because one rejected load used to
  // reject everything via Promise.all, and the caller's `void` on this
  // promise swallowed that rejection with no error at all).
  const images = await Promise.all(
    photoUrls.map((url, i) =>
      url
        ? loadImage(url, requireExportableCanvas).catch((error) => {
            console.error(`Collage slot ${i}: ${error.message}`);
            return null;
          })
        : Promise.resolve(null),
    ),
  );
  const failedCount = images.filter((img, i) => !img && photoUrls[i]).length;

  template.slots.forEach((rect, i) => {
    const img = images[i];
    if (!img) {
      ctx.fillStyle = '#e5e2da';
      ctx.fillRect(rect.x * pageWidth, rect.y * pageHeight, rect.w * pageWidth, rect.h * pageHeight);
      return;
    }
    const focal = focalPoints[i];
    drawCover(ctx, img, rect.x * pageWidth, rect.y * pageHeight, rect.w * pageWidth, rect.h * pageHeight, focal?.x, focal?.y);
  });

  // A thin angled "racing stripe" accent rule along the full-bleed photo
  // band's top and bottom edges — derived from statStrip/resultsBlock
  // rather than a hardcoded fraction, so it stays correct if either ever
  // moves. The slant is deliberately modest (a few multiples of the
  // ribbon's own thickness) — enough to read as a dynamic sports-poster
  // stripe rather than a straight rule, not so much that it visibly
  // crosses into the straight-edged photos it frames.
  const ribbonThickness = Math.max(3, pageHeight * 0.003);
  const ribbonSkew = ribbonThickness * 3;
  const photoBandTop = (template.statStrip.y + template.statStrip.h) * pageHeight;
  const photoBandBottom = template.resultsBlock.y * pageHeight;
  drawAngledRibbon(ctx, photoBandTop - ribbonThickness, ribbonThickness, pageWidth, ribbonSkew, accent);
  drawAngledRibbon(ctx, photoBandBottom, ribbonThickness, pageWidth, ribbonSkew, accent);

  const h = template.header;
  const headerX = h.x * pageWidth;
  const headerY = h.y * pageHeight;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  // Bold and uppercase — a poster headline, not a form label. This used
  // to be the same weight as the body text around it, which read as
  // "plain" rather than something built for an XC team banquet wall.
  const nameSize = Math.round(pageHeight * 0.036);
  ctx.font = `700 ${nameSize}px system-ui, sans-serif`;
  ctx.fillText((header.name || 'Athlete Name').toUpperCase(), headerX, headerY);

  // A short accent-colored rule under the name — a small masthead touch
  // so the header has something to anchor it beyond plain stacked text.
  const ruleY = headerY + nameSize * 1.15;
  ctx.fillStyle = accent;
  ctx.fillRect(headerX, ruleY, pageWidth * 0.1, Math.max(3, pageHeight * 0.0028));

  // header.team is blank until BuildModule.tsx's teamName (GET
  // /photos/me) loads, and a coach can clear it entirely — skip it
  // rather than printing a stray leading "· 2026" (the season now lives
  // in the badge on the header's right edge instead, see below).
  if (header.team) {
    ctx.fillStyle = MUTED;
    ctx.font = `${Math.round(pageHeight * 0.016)}px system-ui, sans-serif`;
    ctx.fillText(header.team, headerX, ruleY + pageHeight * 0.013);
  }

  // Season badge, right-aligned against the header's own right margin —
  // replaces the plain "· 2026" text suffix the subtitle used to carry,
  // same bib-style badge the back page's header also uses.
  if (header.season) {
    drawBadge(ctx, headerX + h.w * pageWidth, headerY, header.season, pageHeight, accent);
  }

  drawStatStrip(ctx, template.statStrip, pageWidth, pageHeight, stats, accent);
  drawResultsBlock(ctx, template.resultsBlock, pageWidth, pageHeight, stats, accent);

  // The export canvas (requireExportableCanvas) is the one place a failed
  // load is worth refusing over, rather than just drawing a gray box and
  // moving on — a coach printing this for a senior banquet needs to know
  // it's missing a photo, not discover it after handing out a page with a
  // hole in it. The on-screen preview already shows that same gray box, so
  // this never throws there.
  if (requireExportableCanvas && failedCount > 0) {
    throw new Error(
      `${failedCount} of ${photoUrls.filter(Boolean).length} photo${failedCount === 1 ? '' : 's'} failed to load — ` +
        'often a CORS setting on the image storage bucket (it needs to allow GET, not just PUT). Check the browser console for which one(s).',
    );
  }
}

// ---------------------------------------------------------------------------
// Shared decorative helpers, used by both the front (photo) page above and
// the back (stats) page below — one consistent "racing stripe" / bib-badge
// visual language across both sides of the printed sheet.
// ---------------------------------------------------------------------------

/**
 * A thin accent band with a deliberate, modest diagonal slant instead of a
 * plain horizontal rect — the front page's "racing stripe" framing the
 * photo band's top and bottom edges. `y` is the band's un-slanted left
 * edge position; the right edge shifts up by `skew`.
 */
function drawAngledRibbon(ctx: CanvasRenderingContext2D, y: number, thickness: number, pageW: number, skew: number, accent: string) {
  ctx.save();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(pageW, y - skew);
  ctx.lineTo(pageW, y - skew + thickness);
  ctx.lineTo(0, y + thickness);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Thin diagonal accent stripes confined to narrow bands at the very left
 * and right page edges — outside the 0.06 content margin every real
 * element already respects, so this is pure framing, never competing with
 * text or photos.
 */
function drawMarginStripes(ctx: CanvasRenderingContext2D, pageW: number, pageH: number, accent: string) {
  const marginW = pageW * 0.045;
  const stripeW = Math.max(2, pageW * 0.0025);
  const gap = pageW * 0.013;
  const skew = marginW * 1.6;

  ctx.save();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.14;
  for (const bandX of [0, pageW - marginW]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(bandX, 0, marginW, pageH);
    ctx.clip();
    for (let x = -skew; x < marginW + pageH; x += gap + stripeW) {
      ctx.beginPath();
      ctx.moveTo(bandX + x, 0);
      ctx.lineTo(bandX + x + skew, pageH);
      ctx.lineTo(bandX + x + skew + stripeW, pageH);
      ctx.lineTo(bandX + x + stripeW, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * A small rounded, accent-filled "bib" badge — e.g. the season year —
 * shared by the front and back headers. Positioned by its RIGHT edge
 * (rightX) rather than its left, since both callers right-align it
 * against the header's own right margin and the badge's width depends on
 * the text itself (an unknown until this measures it).
 */
function drawBadge(ctx: CanvasRenderingContext2D, rightX: number, y: number, text: string, pageH: number, accent: string) {
  const fontSize = Math.round(pageH * 0.014);
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  const textW = ctx.measureText(text).width;
  const padX = fontSize * 0.7;
  const h = fontSize * 1.9;
  const w = textW + padX * 2;
  const r = h / 2;
  const x = rightX - w;

  ctx.save();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f7f6f2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + fontSize * 0.04);
  ctx.restore();

  return w;
}

// ---------------------------------------------------------------------------
// Back page — a fixed, stats-only layout (lib/templates.ts's BACK_TEMPLATE),
// printed on the reverse of the photo page so a coach can hand out one
// double-sided sheet instead of a photo-only page. See pdfExport.ts for how
// the two get combined.
// ---------------------------------------------------------------------------

interface Highlight {
  label: string;
  value: string;
}

/** Career PR, season best, best mile (when the athlete has one on record), and season mileage — whichever of these the data actually supports. */
function buildHighlights(stats: AthleteBuildStats): Highlight[] {
  const highlights: Highlight[] = [];
  if (stats.careerBest5kSec != null) {
    highlights.push({ label: 'Career PR (5K)', value: formatRaceTime(stats.careerBest5kSec) });
  }
  const seasonBest5k = stats.bestByDistance.find((d) => (d.distanceLabel ?? '').toUpperCase().includes('5K'));
  if (seasonBest5k) {
    highlights.push({ label: 'Season Best (5K)', value: formatRaceTime(seasonBest5k.timeSec) });
  }
  // Within 50m of exactly one mile — the same tolerance band a results
  // import would bucket as "1 Mile" rather than something else nearby.
  const bestMile = stats.bestByDistance.find((d) => d.distanceMeters != null && Math.abs(d.distanceMeters - 1609.34) < 50);
  if (bestMile) {
    highlights.push({ label: 'Best Mile', value: formatRaceTime(bestMile.timeSec) });
  }
  if (stats.totalMiles != null) {
    highlights.push({ label: 'Season Miles', value: formatMiles(stats.totalMiles) });
  }
  return highlights.slice(0, 4);
}

/** A row of up to four highlight cards — the back page's "at a glance" summary. */
function drawHighlightCards(ctx: CanvasRenderingContext2D, rect: TemplateRect, pageW: number, pageH: number, stats: AthleteBuildStats | null, accent: string) {
  if (!stats) return;
  const highlights = buildHighlights(stats);
  if (highlights.length === 0) return;

  const left = rect.x * pageW;
  const top = rect.y * pageH;
  const width = rect.w * pageW;
  const height = rect.h * pageH;
  const gap = pageW * 0.012;
  const cardW = (width - gap * (highlights.length - 1)) / highlights.length;

  highlights.forEach((hl, i) => {
    const x = left + i * (cardW + gap);
    ctx.fillStyle = '#efece2';
    ctx.fillRect(x, top, cardW, height);
    ctx.fillStyle = accent;
    ctx.fillRect(x, top, cardW, Math.max(2, pageH * 0.0026));

    const valueSize = Math.round(pageH * 0.026);
    ctx.fillStyle = INK;
    ctx.font = `700 ${valueSize}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const padX = cardW * 0.1;
    ctx.fillText(hl.value, x + padX, top + height * 0.22);

    const labelSize = Math.round(pageH * 0.012);
    ctx.fillStyle = MUTED;
    ctx.font = `700 ${labelSize}px system-ui, sans-serif`;
    ctx.fillText(hl.label.toUpperCase(), x + padX, top + height * 0.66);
  });
}

/**
 * The pace-over-time line chart, drawn directly on this canvas (not the
 * on-screen BuildPaceChart.tsx, which uses recharts/SVG and only ever
 * renders in the DOM) — same data pipeline (lib/paceChart.ts's
 * paceChartData), independent drawing code, since recharts has no way to
 * paint onto a plain CanvasRenderingContext2D.
 */
function drawPaceChartCanvas(ctx: CanvasRenderingContext2D, rect: TemplateRect, pageW: number, pageH: number, data: PaceDatum[], isCareer: boolean, accent: string) {
  const left = rect.x * pageW;
  const top = rect.y * pageH;
  const width = rect.w * pageW;
  const height = rect.h * pageH;

  const labelSize = Math.round(pageH * 0.0135);
  ctx.fillStyle = accent;
  ctx.font = `700 ${labelSize}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`PACE ${isCareer ? '— CAREER' : '— THIS SEASON'}`, left, top);

  const chartTop = top + labelSize * 1.9;
  const chartHeight = height - labelSize * 1.9 - pageH * 0.025; // room for x-axis labels below
  if (data.length < 2 || chartHeight <= 0) {
    ctx.fillStyle = MUTED;
    ctx.font = `${Math.round(pageH * 0.013)}px system-ui, sans-serif`;
    ctx.fillText('Not enough races yet to chart a trend.', left, chartTop);
    return;
  }

  const paces = data.map((d) => d.pace);
  const minPace = Math.min(...paces);
  const maxPace = Math.max(...paces);
  const pad = Math.max(5, (maxPace - minPace) * 0.15);
  const yMin = minPace - pad;
  const yMax = maxPace + pad;
  const plotX = (i: number) => left + (data.length === 1 ? width / 2 : (i / (data.length - 1)) * width);
  const plotY = (pace: number) => chartTop + chartHeight - ((pace - yMin) / (yMax - yMin)) * chartHeight;

  // Gridlines, three evenly spaced.
  ctx.strokeStyle = RULE;
  ctx.lineWidth = Math.max(1, pageH * 0.0005);
  ctx.fillStyle = MUTED;
  ctx.font = `${Math.round(pageH * 0.011)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 2; i++) {
    const pace = yMin + ((yMax - yMin) * i) / 2;
    const y = plotY(pace);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + width, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(formatPace(pace), left - pageW * 0.008, y);
  }

  // The trend line itself, plus a dot per race.
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, pageH * 0.0018);
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = plotX(i);
    const y = plotY(d.pace);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = accent;
  data.forEach((d, i) => {
    ctx.beginPath();
    ctx.arc(plotX(i), plotY(d.pace), Math.max(2.5, pageH * 0.0022), 0, Math.PI * 2);
    ctx.fill();
  });

  // X-axis: first and last race date only — a label per point would
  // collide on a full season's worth of races.
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(data[0].label, left, chartTop + chartHeight + pageH * 0.006);
  ctx.textAlign = 'right';
  ctx.fillText(data[data.length - 1].label, left + width, chartTop + chartHeight + pageH * 0.006);
}

/** The season's races as a vertical timeline — a connecting rule with one dot and row per race, in place of the front page's plain table. */
function drawSeasonTimeline(ctx: CanvasRenderingContext2D, rect: TemplateRect, pageW: number, pageH: number, stats: AthleteBuildStats | null, accent: string) {
  if (!stats || stats.races.length === 0) return;

  const left = rect.x * pageW;
  const top = rect.y * pageH;
  const width = rect.w * pageW;
  const height = rect.h * pageH;

  const labelSize = Math.round(pageH * 0.0135);
  ctx.fillStyle = accent;
  ctx.font = `700 ${labelSize}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('SEASON TIMELINE', left, top);

  const listTop = top + labelSize * 1.9;
  const rowSize = Math.round(pageH * 0.0135);
  const rowHeight = rowSize * 1.9;
  const maxRows = Math.max(1, Math.floor((height - labelSize * 1.9) / rowHeight));
  const shown = stats.races.slice(0, maxRows);
  const overflow = stats.races.length - shown.length;

  const dotX = left + pageW * 0.006;
  // The connecting rule behind every dot, drawn first so the dots and text sit on top of it.
  if (shown.length > 1) {
    ctx.strokeStyle = RULE;
    ctx.lineWidth = Math.max(1, pageH * 0.0012);
    ctx.beginPath();
    ctx.moveTo(dotX, listTop + rowHeight * 0.5);
    ctx.lineTo(dotX, listTop + (shown.length - 1) * rowHeight + rowHeight * 0.5);
    ctx.stroke();
  }

  const dateColX = dotX + pageW * 0.022;
  const dateColW = width * 0.1;
  const timeColW = width * 0.14;
  const nameColX = dateColX + dateColW;
  const nameColW = width - (nameColX - left) - timeColW;

  shown.forEach((race, i) => {
    const rowCenterY = listTop + i * rowHeight + rowHeight * 0.5;

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(dotX, rowCenterY, Math.max(3, pageH * 0.0026), 0, Math.PI * 2);
    ctx.fill();

    ctx.textBaseline = 'middle';
    ctx.font = `${rowSize}px system-ui, sans-serif`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'left';
    ctx.fillText(formatRaceDate(race.date), dateColX, rowCenterY);

    ctx.fillStyle = INK;
    ctx.fillText(truncateToWidth(ctx, race.raceName, nameColW - pageW * 0.01), nameColX, rowCenterY);

    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    ctx.fillText(formatRaceTime(race.timeSec), left + width, rowCenterY);
  });

  if (overflow > 0) {
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'left';
    ctx.font = `italic ${rowSize}px system-ui, sans-serif`;
    ctx.fillText(`+${overflow} more this season`, dateColX, listTop + shown.length * rowHeight + rowHeight * 0.1);
  }
}

/**
 * The back page: highlight cards, the pace trend chart, and the season
 * timeline — printed on the reverse of the photo page (see pdfExport.ts).
 * Same "degrade, don't break" rule as the front page's own stat blocks —
 * a null/thin stats object just draws less, never throws.
 */
export function renderCollageBack(
  canvas: HTMLCanvasElement,
  pageWidth: number,
  pageHeight: number,
  header: CollageHeaderText,
  stats: AthleteBuildStats | null = null,
  accent: string = ACCENT,
): void {
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#f7f6f2';
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  drawMarginStripes(ctx, pageWidth, pageHeight, accent);

  const t = BACK_TEMPLATE;
  const headerX = t.header.x * pageWidth;
  const headerY = t.header.y * pageHeight;
  const nameSize = Math.round(pageHeight * 0.024);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${nameSize}px system-ui, sans-serif`;
  ctx.fillText((header.name || 'Athlete Name').toUpperCase(), headerX, headerY);

  const subtitleY = headerY + nameSize * 1.35;
  const subtitle = [header.team, 'Season Recap'].filter(Boolean).join('   ·   ');
  ctx.fillStyle = MUTED;
  ctx.font = `${Math.round(pageHeight * 0.0135)}px system-ui, sans-serif`;
  ctx.fillText(subtitle, headerX, subtitleY);

  if (header.season) {
    const headerRight = headerX + t.header.w * pageWidth;
    drawBadge(ctx, headerRight, headerY, header.season, pageHeight, accent);
  }

  drawHighlightCards(ctx, t.highlightCards, pageWidth, pageHeight, stats, accent);

  const { data, isCareer } = paceChartData(stats);
  drawPaceChartCanvas(ctx, t.paceChart, pageWidth, pageHeight, data, isCareer, accent);

  drawSeasonTimeline(ctx, t.timeline, pageWidth, pageHeight, stats, accent);
}
