// A team's own colors for the app and for anything it exports.
//
// Stored as one JSON object on Team.colors, hex strings only:
//   primary         the brand color (buttons, links, highlights) — light mode
//   primaryDark     the same, for dark mode (optional; derived from primary when unset)
//   accent          the second color (optional)
//   accentDark      the accent for dark mode (optional)
//   exportBackground  the background of exported images (optional)
// Null/missing means "use LeadPack's default". The web app derives readable
// text colors and the in-between surfaces; nothing here stores a CSS value
// other than a plain #rrggbb, so a team cannot inject styles.

const KEYS = ['primary', 'primaryDark', 'accent', 'accentDark', 'exportBackground'];
const HEX = /^#[0-9a-f]{6}$/i;

function normalizeColors(stored) {
  const out = {};
  if (!stored || typeof stored !== 'object') return out;
  for (const k of KEYS) if (typeof stored[k] === 'string' && HEX.test(stored[k])) out[k] = stored[k].toLowerCase();
  return out;
}

/**
 * body: a partial { key: '#rrggbb' | null }. null clears that color.
 * Returns { colors } or { error }.
 */
function applyColorUpdate(stored, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send an object of colors.' };
  const unknown = Object.keys(body).filter((k) => !KEYS.includes(k));
  if (unknown.length) return { error: `Not a team color: ${unknown.join(', ')}` };
  const colors = normalizeColors(stored);
  for (const [k, v] of Object.entries(body)) {
    if (v === null || v === '') delete colors[k];
    else if (typeof v === 'string' && HEX.test(v)) colors[k] = v.toLowerCase();
    else return { error: `${k} must be a color like #1a7f4b.` };
  }
  return { colors };
}

module.exports = { KEYS, normalizeColors, applyColorUpdate };
