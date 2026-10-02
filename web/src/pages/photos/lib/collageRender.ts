import { templateFor } from './templates';
import { placeholderWebUrl } from '../data/placeholderPhoto';
import type { TemplateSize } from '../state/types';

export interface CollageHeaderText {
  name: string;
  team: string;
  season: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
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
  photoSeeds: number[],
  header: CollageHeaderText,
): Promise<void> {
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const template = templateFor(templateSize);

  ctx.fillStyle = '#f7f6f2';
  ctx.fillRect(0, 0, pageWidth, pageHeight);

  const images = await Promise.all(photoSeeds.map((seed) => loadImage(placeholderWebUrl(seed))));

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
}
