// Meet-to-meet trend for the next shell's Meets → Analysis, computed from
// the Results Grid payload (GET /teams/results-grid): every athlete's time
// in every race column, with each column's meet, distance and date.
//
// Pace (s/mi) is the common measure, so a 2-mile and a 5K sit on one line.
// A team average also moves with who ran, so each meet also reports the
// like-for-like signal: how many athletes beat their own previous race's
// pace, and by how much (median).

const METERS_PER_MILE = 1609.344;

export interface GridColumn {
  name: string;
  meetKey: string;
  distanceMeters: number | null;
  date?: string | null;
}
export interface GridAthlete {
  athleteId: string;
  gender: string;
  results: (number | null)[];
}

export interface MeetTrendPoint {
  key: string;
  /** The Meet's id when the column is a linked meet ("meet:<id>"). */
  meetId: string | null;
  name: string;
  date: string;
  team: number | null;
  boys: number | null;
  girls: number | null;
  runners: number;
  /** Athletes who also ran an earlier meet this season. */
  compared: number;
  /** Of those, how many ran a faster pace than their previous race. */
  faster: number;
  /** Median change in pace against each athlete's previous race; negative = faster. */
  medianChange: number | null;
  /** Times faster than the athlete's best earlier this season at the same distance. */
  seasonBests: number;
  /** Team pace minus the previous meet's; negative = faster. */
  delta: number | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function buildMeetTrend(columns: GridColumn[], athletes: GridAthlete[], inScope?: Set<string> | null): MeetTrendPoint[] {
  // Meets in date order; one meet can have several columns (distances).
  const meets = new Map<string, { name: string; date: string; cols: number[] }>();
  columns.forEach((c, i) => {
    if (!c.date) return;
    const m = meets.get(c.meetKey) ?? { name: c.name, date: c.date, cols: [] };
    if (c.date < m.date) m.date = c.date;
    m.cols.push(i);
    meets.set(c.meetKey, m);
  });
  const ordered = [...meets.entries()].sort(([, a], [, b]) => a.date.localeCompare(b.date));

  const people = athletes.filter((a) => !inScope || inScope.has(a.athleteId));
  const lastPace = new Map<string, number>();
  const bestByDistance = new Map<string, number>();

  const points: MeetTrendPoint[] = ordered.map(([key, m]) => {
    const team: number[] = [];
    const boys: number[] = [];
    const girls: number[] = [];
    const changes: number[] = [];
    let seasonBests = 0;
    for (const a of people) {
      // An athlete runs one race per meet; take the first column they have a time in.
      const col = m.cols.find((ci) => (a.results[ci] ?? 0) > 0 && (columns[ci].distanceMeters ?? 0) > 0);
      if (col == null) continue;
      const time = a.results[col]!;
      const meters = columns[col].distanceMeters!;
      const pace = time / (meters / METERS_PER_MILE);
      team.push(pace);
      if (a.gender === 'M') boys.push(pace);
      else if (a.gender === 'F') girls.push(pace);
      const prev = lastPace.get(a.athleteId);
      if (prev != null) changes.push(pace - prev);
      lastPace.set(a.athleteId, pace);
      const dKey = `${a.athleteId}:${Math.round(meters)}`;
      const best = bestByDistance.get(dKey);
      if (best != null && time < best) seasonBests += 1;
      if (best == null || time < best) bestByDistance.set(dKey, time);
    }
    return {
      key,
      meetId: key.startsWith('meet:') ? key.slice(5) : null,
      name: m.name,
      date: m.date,
      team: mean(team),
      boys: mean(boys),
      girls: mean(girls),
      runners: team.length,
      compared: changes.length,
      faster: changes.filter((c) => c < 0).length,
      medianChange: median(changes),
      seasonBests,
      delta: null,
    };
  });

  const ran = points.filter((p) => p.runners > 0);
  for (let i = 1; i < ran.length; i++) {
    const prev = ran[i - 1].team;
    const cur = ran[i].team;
    ran[i].delta = prev != null && cur != null ? cur - prev : null;
  }
  return ran;
}
