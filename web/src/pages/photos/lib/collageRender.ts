import { templateFor } from './templates';
import type { TemplateSize } from '../state/types';

export interface CollageHeaderText {
  name: string;
  team: string;
  season: string;
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

/** Cover-fit, centered — the spec's cropping rule (no face/subject detection). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const dx = x + (w - drawW) / 2;
  const dy = y + (h - drawH) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
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
    drawCover(ctx, img, rect.x * pageWidth, rect.y * pageHeight, rect.w * pageWidth, rect.h * pageHeight);
  });

  const h = template.header;
  const headerX = h.x * pageWidth;
  const headerY = h.y * pageHeight;
  ctx.fillStyle = '#1f2a22';
  ctx.textBaseline = 'top';
  ctx.font = `${Math.round(pageHeight * 0.032)}px system-ui, sans-serif`;
  ctx.fillText(header.name || 'Athlete Name', headerX, headerY);
  ctx.fillStyle = '#4b5a4f';
  ctx.font = `${Math.round(pageHeight * 0.016)}px system-ui, sans-serif`;
  ctx.fillText(`${header.team} · ${header.season}`, headerX, headerY + pageHeight * 0.042);

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
