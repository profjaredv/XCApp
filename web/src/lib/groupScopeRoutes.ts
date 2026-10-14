// Which "next" pages respect the group scope (docs/leadpack-new-ui-trial.md
// §3.3): Today (group strip), Train, Athletes, Season → Groups tab, and a
// meet's Results tab. Everywhere else the chip is hidden — a page that
// can't honor the scope must not appear to.
export function scopeAppliesTo(teamSubpath: string, search: string): boolean {
  const path = teamSubpath.replace(/^\/+|\/+$/g, '');
  const tab = new URLSearchParams(search).get('tab');
  if (path === '' || path === 'today' || path === 'train' || path === 'athletes') return true;
  if (path === 'season') return tab === 'byGroup';
  if (/^meet\/[^/]+$/.test(path)) return tab === 'results';
  return false;
}
