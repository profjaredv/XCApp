// Build spec's upload pipeline, step 3: "The browser draws the image to a
// canvas to produce the 400px and 1600px WebP copies" — LeadPack's server
// never touches image bytes, so resizing happens here, client-side.

/** Cover-fit is for collage cells; a derived copy is a plain, undistorted resize. */
async function resizeLongEdge(file: File, longEdge: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob) throw new Error('Failed to encode WebP.');
    return blob;
  } finally {
    bitmap.close();
  }
}

// Spec's "Storage layout" table: thumb is ~400px/~30KB, web is ~1600px/~250KB.
export function makeThumb(file: File): Promise<Blob> {
  return resizeLongEdge(file, 400, 0.7);
}
export function makeWeb(file: File): Promise<Blob> {
  return resizeLongEdge(file, 1600, 0.82);
}
