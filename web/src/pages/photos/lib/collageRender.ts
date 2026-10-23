import { templateFor } from './templates';
import { formatRaceTime, formatPace, formatRaceDate, formatDistance, formatMiles } from './raceFormat';
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

  // A thin accent rule along the full-bleed photo band's top and bottom
  // edges — derived from statStrip/resultsBlock rather than a hardcoded
  // fraction, so it stays correct if either ever moves. Without it the
  // photos just stopped at an unmarked line; this frames the block and
  // ties it to the rest of the page instead.
  const ribbonThickness = Math.max(3, pageHeight * 0.003);
  const photoBandTop = (template.statStrip.y + template.statStrip.h) * pageHeight;
  const photoBandBottom = template.resultsBlock.y * pageHeight;
  ctx.fillStyle = accent;
  ctx.fillRect(0, photoBandTop - ribbonThickness, pageWidth, ribbonThickness);
  ctx.fillRect(0, photoBandBottom, pageWidth, ribbonThickness);

  const h = template.header;
  const headerX = h.x * pageWidth;
  const headerY = h.y * pageHeight;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const nameSize = Math.round(pageHeight * 0.032);
  ctx.font = `${nameSize}px system-ui, sans-serif`;
  ctx.fillText(header.name || 'Athlete Name', headerX, headerY);

  // A short accent-colored rule under the name — a small masthead touch
  // so the header has something to anchor it beyond plain stacked text.
  const ruleY = headerY + nameSize * 1.1;
  ctx.fillStyle = accent;
  ctx.fillRect(headerX, ruleY, pageWidth * 0.09, Math.max(2, pageHeight * 0.0022));

  // header.team is blank until BuildModule.tsx's teamName (GET
  // /photos/me) loads, and a coach can clear it entirely — skip it
  // rather than printing a stray leading "· 2026".
  const subtitle = [header.team, header.season].filter(Boolean).join('   ·   ');
  if (subtitle) {
    ctx.fillStyle = MUTED;
    ctx.font = `${Math.round(pageHeight * 0.016)}px system-ui, sans-serif`;
    ctx.fillText(subtitle, headerX, ruleY + pageHeight * 0.012);
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
