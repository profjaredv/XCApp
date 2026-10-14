// Ties scraped races to the Meet they belong to by Athletic.net meet ID.
//
// A meet imported from the team's Athletic.net calendar links its races at
// import time (routes/meetOps.js POST /import-calendar), but only the races
// that already exist. Calendar import usually happens BEFORE the meet is
// run, so the races the results scrape creates afterwards arrived with
// meetId null: the meet page showed "No results yet" for a meet whose
// results were sitting in the database, and only Field Results (which
// links its own races) made them appear.
//
// Matching is exact: same team, same Athletic.net meet ID, and the race's
// season equals the meet's season year. Already-linked races are never
// moved, so a coach's own grouping always wins.

/** Pure: which unlinked races go to which meet. */
function planMeetLinks(meets, races) {
  const meetByKey = new Map();
  for (const m of meets) {
    if (!m.athleticMeetId || !Number.isFinite(m.seasonYear)) continue;
    meetByKey.set(`${m.seasonYear}:${m.athleticMeetId}`, m.id);
  }
  const byMeet = new Map();
  for (const r of races) {
    if (r.meetId || !r.athleticMeetId) continue;
    const meetId = meetByKey.get(`${r.season}:${r.athleticMeetId}`);
    if (!meetId) continue;
    if (!byMeet.has(meetId)) byMeet.set(meetId, []);
    byMeet.get(meetId).push(r.id);
  }
  return [...byMeet.entries()].map(([meetId, raceIds]) => ({ meetId, raceIds }));
}

/** Links a team's unlinked races to their meets; returns how many races were linked. */
async function linkRacesToMeets(prisma, teamId, season) {
  const meets = await prisma.meet.findMany({
    where: { teamId, athleticMeetId: { not: null }, ...(season != null ? { season: { year: season } } : {}) },
    select: { id: true, athleticMeetId: true, season: { select: { year: true } } },
  });
  if (meets.length === 0) return 0;
  const races = await prisma.race.findMany({
    where: {
      teamId,
      meetId: null,
      athleticMeetId: { in: meets.map((m) => m.athleticMeetId) },
      ...(season != null ? { season } : {}),
    },
    select: { id: true, season: true, athleticMeetId: true, meetId: true },
  });
  const plan = planMeetLinks(
    meets.map((m) => ({ id: m.id, athleticMeetId: m.athleticMeetId, seasonYear: m.season.year })),
    races
  );
  let linked = 0;
  for (const { meetId, raceIds } of plan) {
    const r = await prisma.race.updateMany({ where: { id: { in: raceIds }, teamId, meetId: null }, data: { meetId } });
    linked += r.count;
  }
  return linked;
}

module.exports = { planMeetLinks, linkRacesToMeets };
