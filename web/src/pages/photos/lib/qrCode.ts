import QRCode from 'qrcode';

/**
 * Draws a real, scannable QR code into the canvas — square modules, no
 * smoothing, filling the full `size` x `size` box (build spec section 7).
 * The mockup's own QR is a non-functional placeholder pattern; this
 * encodes `text` for real via the `qrcode` package's low-level `create`,
 * which hands back the raw module matrix rather than an <img>/data URL, so
 * every cell can be drawn as a crisp filled rect instead of a smoothed
 * bitmap. No internal quiet zone is drawn — the caller's own paper-colored
 * card padding (lib/collageRender.ts's LeadPack card, >= 8px) serves as
 * the quiet zone around it.
 */
export function drawQrCode(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, ink: string, paper: string): void {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const count = qr.modules.size;
  const cell = size / count;

  ctx.save();
  ctx.fillStyle = paper;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = ink;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.modules.get(row, col)) continue;
      // Round the position and round UP the size — a hairline of
      // deliberate overlap between adjacent cells, so sub-pixel rounding
      // never leaves a seam of paper showing through the middle of the code.
      ctx.fillRect(Math.round(x + col * cell), Math.round(y + row * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }
  ctx.restore();
}
