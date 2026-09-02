// Name matching for the athlete pickers.
//
// Its own module rather than living beside the component: exporting a
// helper from a file that also exports a component breaks React fast
// refresh, and this is used from both the picker and the groups board.

/** True when every word in `query` appears somewhere in `name`.
 *
 *  Substring, not prefix, and order-independent — coaches search by last
 *  name ("mays"), and a prefix match on "Morgan Mays" would find nothing
 *  for it. "may mor" works as well as "mor may", which is what someone
 *  typing quickly produces. */
export function matchesQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = name.toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}
