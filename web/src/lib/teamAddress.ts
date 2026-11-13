// A team's LeadPack address: the part after /t/. It is the team's own slug
// (made from its name), not its Athletic.net id. The id is still on the
// team and still used to link out to Athletic.net; it just isn't how
// LeadPack addresses a team any more.
//
// The Athletic.net id is the fallback only for a team object from an API
// response cached before slugs existed.
interface Addressable {
  slug?: string | null;
  athleticTeamId?: string | null;
  athletic_team_id?: string | null;
}

export function teamAddress(team: Addressable | null | undefined): string | undefined {
  return team?.slug || team?.athleticTeamId || team?.athletic_team_id || undefined;
}

/** "/t/<address><subpath>" for a team; subpath may be empty. */
export function teamHome(team: Addressable | null | undefined, subpath = ''): string {
  const suffix = subpath && !subpath.startsWith('/') ? `/${subpath}` : subpath;
  return `/t/${teamAddress(team) ?? ''}${suffix}`;
}
