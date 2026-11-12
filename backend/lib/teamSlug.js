// A team's LeadPack address: /t/<slug>. Made from the team's name, owned by
// LeadPack, and independent of any results provider. The Athletic.net team
// id is still stored (Team.athleticTeamId) and still used to build links
// out to Athletic.net, but it is no longer how a team is addressed here.

const RESERVED = new Set(['new', 'admin', 'api', 'join', 'login', 'start', 'team', 'teams', 'demo']);

/** "St. Mary's High School" -> "st-marys". Empty when nothing usable is left. */
function slugifyTeamName(name) {
  const base = String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // "High School" says nothing a URL needs; drop it when a name remains.
  const trimmed = base.replace(/-(senior-)?high-school$|-hs$/, '');
  return (trimmed || base).slice(0, 48).replace(/-+$/, '');
}

/**
 * The first free slug for this name: "ridgeview", then "ridgeview-2", ...
 * `taken(slug)` resolves true when a slug is already in use.
 */
async function uniqueTeamSlug(name, taken) {
  let base = slugifyTeamName(name);
  // A slug of only digits would read as a provider id, and a reserved word
  // would collide with a route.
  if (!base || /^\d+$/.test(base) || RESERVED.has(base)) base = base ? `team-${base}` : 'team';
  for (let n = 1; n < 500; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new Error('Could not find a free team address.');
}

/** uniqueTeamSlug against the teams table (works with a transaction client too). */
function uniqueTeamSlugInDb(db, name) {
  return uniqueTeamSlug(name, async (slug) =>
    Boolean(await db.team.findUnique({ where: { slug }, select: { id: true } }))
  );
}

/**
 * Finds a team by what a URL carries: its LeadPack slug, or (for links
 * shared before slugs existed) its Athletic.net id.
 */
async function findTeamByAddress(db, address, select) {
  const key = String(address || '').trim();
  if (!key) return null;
  const bySlug = await db.team.findUnique({ where: { slug: key.toLowerCase() }, ...(select ? { select } : {}) });
  if (bySlug) return bySlug;
  return db.team.findUnique({ where: { athleticTeamId: key }, ...(select ? { select } : {}) });
}

module.exports = { slugifyTeamName, uniqueTeamSlug, uniqueTeamSlugInDb, findTeamByAddress };
