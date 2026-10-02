// Phase 1 has no real photo bytes — these are cheap, deterministic
// stand-ins (an inline SVG data URI, not a decoded bitmap) so a 2000-photo
// grid stays light in memory and renders identically on every reload.
// Phase 2 swaps this for a presigned R2 URL without touching any component
// that consumes a photo's `thumbUrl`.

const HUES = [152, 205, 25, 280, 45, 320, 190];

function hashToRange(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  const frac = x - Math.floor(x);
  return min + frac * (max - min);
}

export function placeholderThumbUrl(seed: number, width = 200, height = 134): string {
  const hue = HUES[seed % HUES.length];
  const hue2 = HUES[(seed + 2) % HUES.length];
  const angle = Math.round(hashToRange(seed, 0, 360));
  const blobX = Math.round(hashToRange(seed * 1.7, 10, width - 10));
  const blobY = Math.round(hashToRange(seed * 2.3, 10, height - 10));
  const blobR = Math.round(hashToRange(seed * 3.1, width * 0.08, width * 0.16));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="g" gradientTransform="rotate(${angle})">` +
    `<stop offset="0%" stop-color="hsl(${hue},45%,22%)"/>` +
    `<stop offset="100%" stop-color="hsl(${hue2},40%,14%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#g)"/>` +
    `<circle cx="${blobX}" cy="${blobY}" r="${blobR}" fill="hsl(${hue},30%,55%)" opacity="0.55"/>` +
    `<circle cx="${width - blobX}" cy="${height - blobY * 0.6}" r="${blobR * 0.6}" fill="hsl(${hue2},30%,60%)" opacity="0.4"/>` +
    `</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function placeholderWebUrl(seed: number): string {
  return placeholderThumbUrl(seed, 960, 640);
}
