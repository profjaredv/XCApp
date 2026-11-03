// A team's own colors → the app's theme tokens and its export palette.
//
// A team picks a few hex colors (backend/lib/teamColors.js stores them).
// Everything the coach did not pick is derived here, and every color the
// app actually uses is nudged until text on it is readable: a pale yellow
// can be a team color, but it cannot be the app's link color on white, so
// the light-mode primary is darkened until it reads, and the dark-mode
// primary is lightened. The settings screen shows both what was picked and
// what the app will use.

export interface TeamColors {
  primary?: string;
  primaryDark?: string;
  accent?: string;
  accentDark?: string;
  exportBackground?: string;
}

export const DEFAULT_PRIMARY = '#1f6f43'; // ≈ the app's default green, for the picker's starting value

interface Oklch { l: number; c: number; h: number }

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function srgbToLinear(v: number) {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(v: number) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToLinear(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** Relative luminance (WCAG) of an oklch color, via sRGB. Out-of-gamut values are clipped. */
function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L3 = l_ ** 3, M3 = m_ ** 3, S3 = s_ ** 3;
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clip(4.0767416621 * L3 - 3.3077115913 * M3 + 0.2309699292 * S3),
    clip(-1.2684380046 * L3 + 2.6097574011 * M3 - 0.3413193965 * S3),
    clip(-0.0041960863 * L3 - 0.7034186147 * M3 + 1.707614701 * S3),
  ];
}

function luminance(rgb: [number, number, number]) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = luminance(oklchToLinear(a));
  const lb = luminance(oklchToLinear(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const rgb = oklchToLinear({ l, c, h }).map((v) => Math.round(linearToSrgb(v) * 255));
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const css = ({ l, c, h }: Oklch, alpha?: number) =>
  `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)}${alpha != null ? ` / ${alpha}` : ''})`;

const DARK_PAGE: Oklch = { l: 0.16, c: 0.02, h: 0 };
const MIN_CONTRAST = 4.5;

/** The color the app will use in light mode: the pick, darkened until white text on it (and it on white) reads. */
export function readableOnLight(hex: string): { hex: string; adjusted: boolean } {
  const o = hexToOklch(hex);
  let l = o.l;
  while (l > 0.1 && contrastRatio({ ...o, l }, { l: 1, c: 0, h: 0 }) < MIN_CONTRAST) l -= 0.01;
  return { hex: oklchToHex({ ...o, l }), adjusted: Math.abs(l - o.l) > 0.004 };
}

/** The color the app will use in dark mode: the pick, lightened until it reads on the dark page. */
export function readableOnDark(hex: string): { hex: string; adjusted: boolean } {
  const o = hexToOklch(hex);
  let l = o.l;
  while (l < 0.95 && contrastRatio({ ...o, l }, DARK_PAGE) < MIN_CONTRAST) l += 0.01;
  return { hex: oklchToHex({ ...o, l }), adjusted: Math.abs(l - o.l) > 0.004 };
}

/** Dark-mode starting color when the team did not pick one: the light pick, lifted. */
function darkFrom(hex: string) {
  const o = hexToOklch(hex);
  return oklchToHex({ ...o, l: Math.max(o.l, 0.72) });
}

export interface ResolvedColors {
  light: { primary: string; primaryAdjusted: boolean; accent: string | null; accentAdjusted: boolean };
  dark: { primary: string; primaryAdjusted: boolean; accent: string | null; accentAdjusted: boolean };
}

export function resolveColors(colors: TeamColors | null | undefined): ResolvedColors | null {
  if (!colors || !isHex(colors.primary)) return null;
  const lp = readableOnLight(colors.primary);
  const dp = readableOnDark(isHex(colors.primaryDark) ? colors.primaryDark : darkFrom(colors.primary));
  const la = isHex(colors.accent) ? readableOnLight(colors.accent) : null;
  const da = isHex(colors.accentDark) ? readableOnDark(colors.accentDark) : isHex(colors.accent) ? readableOnDark(darkFrom(colors.accent)) : null;
  return {
    light: { primary: lp.hex, primaryAdjusted: lp.adjusted, accent: la?.hex ?? null, accentAdjusted: !!la?.adjusted },
    dark: { primary: dp.hex, primaryAdjusted: dp.adjusted, accent: da?.hex ?? null, accentAdjusted: !!da?.adjusted },
  };
}

// L / C of each neutral surface, copied from index.css so the app looks the
// same in the team's hue as it does in the default green.
const LIGHT_SURFACES: Array<[string, number, number]> = [
  ['--background', 0.99, 0.004], ['--foreground', 0.18, 0.025], ['--card-foreground', 0.18, 0.025],
  ['--popover-foreground', 0.18, 0.025], ['--secondary', 0.95, 0.015], ['--secondary-foreground', 0.18, 0.025],
  ['--muted', 0.95, 0.015], ['--muted-foreground', 0.47, 0.03], ['--border', 0.91, 0.015], ['--input', 0.91, 0.015],
  ['--sidebar', 0.99, 0.004], ['--sidebar-foreground', 0.18, 0.025], ['--sidebar-accent', 0.95, 0.015],
  ['--sidebar-accent-foreground', 0.18, 0.025], ['--sidebar-border', 0.91, 0.015],
];
const DARK_SURFACES: Array<[string, number, number]> = [
  ['--background', 0.16, 0.02], ['--foreground', 0.96, 0.01], ['--card', 0.22, 0.025], ['--card-foreground', 0.96, 0.01],
  ['--popover', 0.22, 0.025], ['--popover-foreground', 0.96, 0.01], ['--secondary', 0.29, 0.03],
  ['--secondary-foreground', 0.96, 0.01], ['--muted', 0.29, 0.03], ['--muted-foreground', 0.72, 0.03],
  ['--sidebar', 0.22, 0.025], ['--sidebar-foreground', 0.96, 0.01], ['--sidebar-accent', 0.29, 0.03],
  ['--sidebar-accent-foreground', 0.96, 0.01],
];

function block(mode: 'light' | 'dark', primaryHex: string, accentHex: string | null): string {
  const p = hexToOklch(primaryHex);
  // A gray or black team color keeps neutral surfaces instead of a faint tint.
  const f = Math.min(1, p.c / 0.06);
  const surf = (mode === 'light' ? LIGHT_SURFACES : DARK_SURFACES).map(([name, l, c]) => `${name}:${css({ l, c: c * f, h: p.h })}`);
  const fg = mode === 'light' ? { l: 0.99, c: 0.004 * f, h: p.h } : { l: 0.16, c: 0.02 * f, h: p.h };
  const lines = [
    ...surf,
    `--primary:${css(p)}`, `--primary-foreground:${css(fg)}`, `--ring:${css(p)}`,
    `--sidebar-primary:${css(p)}`, `--sidebar-primary-foreground:${css(fg)}`, `--sidebar-ring:${css(p)}`,
    `--chart-1:${css(p)}`, `--chart-5:${css({ l: mode === 'light' ? 0.5 : 0.6, c: 0.06 * f, h: p.h })}`,
    `--ink:${css({ l: 0.19, c: 0.028 * f, h: p.h })}`, `--ink-foreground:${css({ l: 0.96, c: 0.008 * f, h: p.h })}`,
    `--ink-muted:${css({ l: 0.78, c: 0.02 * f, h: p.h })}`, `--ink-border:${css({ l: 0.34, c: 0.03 * f, h: p.h })}`,
    `--hero-end:${css({ l: 0.3, c: 0.09 * f, h: p.h })}`,
  ];
  if (accentHex) {
    const a = hexToOklch(accentHex);
    const afg = a.l > 0.6 ? { l: 0.16, c: 0.02, h: a.h } : { l: 0.99, c: 0.004, h: a.h };
    lines.push(`--accent:${css(a)}`, `--accent-foreground:${css(afg)}`, `--chart-2:${css(a)}`);
  }
  return lines.join(';');
}

/** The stylesheet that re-colors the app for this team. Empty when the team has no colors set. */
export function buildThemeCss(colors: TeamColors | null | undefined): string {
  const r = resolveColors(colors);
  if (!r) return '';
  return `:root{${block('light', r.light.primary, r.light.accent)}}.dark{${block('dark', r.dark.primary, r.dark.accent)}}`;
}

export interface ExportPalette {
  /** Background of exported images. */
  background: string;
  /** Brand color for glows, highlights and chips on an export. */
  primary: string;
  accent: string;
  /** Accent for exports drawn on light paper (the photo collage), readable on white. */
  paperAccent: string;
}

/** Colors for exported images. Exports are dark slabs in every mode, so the dark-mode colors apply. */
export function exportPalette(colors: TeamColors | null | undefined): ExportPalette | null {
  const r = resolveColors(colors);
  if (!r) return null;
  const bg = isHex(colors?.exportBackground)
    ? (colors!.exportBackground as string)
    : oklchToHex({ l: 0.17, c: 0.03 * Math.min(1, hexToOklch(r.dark.primary).c / 0.06), h: hexToOklch(r.dark.primary).h });
  return { background: bg, primary: r.dark.primary, accent: r.dark.accent ?? r.dark.primary, paperAccent: r.light.accent ?? r.light.primary };
}
