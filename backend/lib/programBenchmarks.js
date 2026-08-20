// League/state/national average comparisons for the Program tab. No such
// reference dataset exists anywhere in this app yet — no benchmark table
// in the schema, no external ingestion pipeline, nothing to compare a
// team's numbers against. Rather than fabricate placeholder numbers, this
// is the single place a future data source (a manually-curated per-league
// settings table, a scraped state-meet results feed, whatever it turns
// out to be) would plug in. Until one exists this always returns null
// fields, and every caller must treat null as "no benchmark data" and
// render accordingly — never a fabricated number.
function getBenchmark(_season, _gender) {
  return { league: null, state: null, national: null };
}

module.exports = { getBenchmark };
