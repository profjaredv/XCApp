// The database half of the Results Grid paste import (see lib/gridPaste.js
// for the rules and the pure planner). Takes the Prisma client as an
// argument so the route owns the connection.

const { planGridPaste, validatePasteBody } = require('./gridPaste');
const { deriveGraduationYear } = require('./season');

async function loadPasteState(db, teamId, season) {
  const seasonRow = await db.season.findUnique({ where: { teamId_year_sport: { teamId, year: season, sport: 'XC' } } });
  const [meets, races, athletes, aliasIds, nameAliases, roster] = await Promise.all([
    db.meet.findMany({ where: { teamId, season: { year: season } }, select: { id: true, name: true, date: true, athleticMeetId: true } }),
    db.race.findMany({ where: { teamId, season }, select: { id: true, name: true, date: true, distance: true, meetId: true } }),
    db.athlete.findMany({ where: { teamId }, select: { id: true, name: true, preferredName: true, gender: true, graduationYear: true, athleticAthleteId: true } }),
    db.athleteAliasId.findMany({ where: { teamId }, select: { athleteId: true, athleticAthleteId: true } }),
    db.athleteAlias.findMany({ where: { teamId }, select: { athleteId: true, alias: true } }),
    seasonRow ? db.seasonRoster.findMany({ where: { seasonId: seasonRow.id }, select: { athleteId: true, grade: true, isActive: true } }) : Promise.resolve([]),
  ]);
  const raceIds = races.map((r) => r.id);
  const results = raceIds.length
    ? await db.result.findMany({ where: { teamId, raceId: { in: raceIds } }, select: { id: true, athleteId: true, raceId: true, time: true, status: true } })
    : [];
  return {
    seasonRow,
    existing: { meets, races, athletes, aliasIds, nameAliases, results, roster },
    seasonRange: { start: seasonRow?.startDate ?? null, end: seasonRow?.endDate ?? null },
  };
}

/** Read-only: what would this paste do? Writes nothing. */
async function previewGridPaste(db, team, body) {
  const bad = validatePasteBody(body);
  if (bad) return { ok: false, message: bad };
  const season = Number(body.season);
  const state = await loadPasteState(db, team.id, season);
  const plan = planGridPaste({ season, grids: body.grids, seasonRange: state.seasonRange, existing: state.existing, decisions: body.decisions || {} });
  return { ok: true, plan };
}

/**
 * Applies the paste. Recomputes the plan from current data, refuses while
 * anything is unresolved, and does nothing at all when there is nothing new.
 */
async function commitGridPaste(db, team, body) {
  const bad = validatePasteBody(body);
  if (bad) return { ok: false, status: 400, message: bad };
  const season = Number(body.season);
  const state = await loadPasteState(db, team.id, season);
  const plan = planGridPaste({ season, grids: body.grids, seasonRange: state.seasonRange, existing: state.existing, decisions: body.decisions || {} });
  if (plan.errors.length) return { ok: false, status: 400, message: plan.errors[0] };
  if (plan.summary.needsReview > 0) {
    return { ok: false, status: 409, message: `${plan.summary.needsReview} item(s) still need a decision before importing.`, plan };
  }
  if (!plan.hasChanges) return { ok: true, applied: false, summary: plan.summary };

  const w = plan.writes;
  const planMeetByKey = new Map(plan.meets.map((m) => [m.key, m]));

  await db.$transaction(
    async (tx) => {
      const seasonRow = await tx.season.upsert({
        where: { teamId_year_sport: { teamId: team.id, year: season, sport: 'XC' } },
        update: {},
        create: { teamId: team.id, year: season, sport: 'XC' },
      });

      // Meets: the same fields the manual meet route sets (routes/meetOps.js POST /).
      const meetIdByKey = new Map();
      for (const m of plan.meets) if (m.status === 'existing') meetIdByKey.set(m.key, m.meetId);
      for (const key of w.meets) {
        const m = planMeetByKey.get(key);
        const created = await tx.meet.create({
          data: { teamId: team.id, seasonId: seasonRow.id, name: m.name, date: new Date(`${m.date}T00:00:00.000Z`), athleticMeetId: m.athleticMeetId || null },
        });
        meetIdByKey.set(key, created.id);
      }
      for (const b of w.meetIdBackfills) {
        await tx.meet.update({ where: { id: b.meetId }, data: { athleticMeetId: b.athleticMeetId } });
      }

      // Athletes.
      const athleteIdByKey = new Map();
      for (const a of plan.athletes) if (a.status === 'existing') athleteIdByKey.set(a.key, a.athleteId);
      for (const a of plan.athletes) {
        if (a.status !== 'new') continue;
        const created = await tx.athlete.create({
          data: {
            teamId: team.id,
            name: a.name,
            gender: a.gender === 'Women' ? 'F' : 'M',
            graduationYear: a.grade != null ? deriveGraduationYear(a.grade, season) : null,
            athleticAthleteId: a.athleticAthleteId || null,
          },
        });
        athleteIdByKey.set(a.key, created.id);
      }
      for (const u of w.athleteUpdates) await tx.athlete.update({ where: { id: u.athleteId }, data: u.data });
      if (w.aliases.length) {
        await tx.athleteAlias.createMany({ data: w.aliases.map((x) => ({ teamId: team.id, athleteId: x.athleteId, alias: x.alias })), skipDuplicates: true });
      }
      for (const r of w.roster) {
        const athleteId = r.athleteId || athleteIdByKey.get(r.athleteKey);
        await tx.seasonRoster.upsert({
          where: { seasonId_athleteId: { seasonId: seasonRow.id, athleteId } },
          update: { isActive: true, ...(r.grade != null ? { grade: r.grade } : {}) },
          create: { seasonId: seasonRow.id, athleteId, grade: r.grade ?? null, isActive: true },
        });
      }

      // Races: one per meet + distance, keyed the way the old import keyed them.
      const raceIdByKey = new Map();
      for (const r of w.races) {
        const meetId = r.meetId || meetIdByKey.get(r.meetKey) || null;
        if (r.existingId) {
          raceIdByKey.set(r.key, r.existingId);
          if (!r.existingMeetId && meetId) await tx.race.update({ where: { id: r.existingId }, data: { meetId } });
          continue;
        }
        const date = new Date(`${r.dateIso}T00:00:00.000Z`);
        const created = await tx.race.upsert({
          where: { teamId_name_date_distance: { teamId: team.id, name: r.name, date, distance: r.distance } },
          update: { ...(meetId ? { meetId } : {}) },
          create: {
            teamId: team.id,
            name: r.name,
            date,
            distance: r.distance,
            distanceMeters: r.distanceMeters,
            season,
            meetId,
            athleticMeetId: r.athleticMeetId || null,
          },
        });
        raceIdByKey.set(r.key, created.id);
      }

      // Results: create what is new, update only what changed.
      const creates = [];
      for (const r of w.results) {
        const athleteId = r.athleteId || athleteIdByKey.get(r.athleteKey);
        const raceId = r.raceId || raceIdByKey.get(r.raceKey);
        if (r.op === 'create') {
          creates.push({ athleteId, raceId, teamId: team.id, time: r.time, status: r.status, grade: r.grade });
        } else {
          await tx.result.update({ where: { id: r.id }, data: { time: r.time, status: r.status, ...(r.grade != null ? { grade: r.grade } : {}) } });
        }
      }
      for (let i = 0; i < creates.length; i += 500) {
        await tx.result.createMany({ data: creates.slice(i, i + 500), skipDuplicates: true });
      }

      const imported = team.importedSeasons || [];
      const updatedSeasons = [...new Set([...imported, season])];
      const newest = Math.max(...updatedSeasons);
      await tx.team.update({
        where: { id: team.id },
        data: {
          importedSeasons: updatedSeasons,
          currentSeason: Number.isFinite(team.currentSeason) ? Math.max(team.currentSeason, newest) : newest,
        },
      });
    },
    { timeout: 60000, maxWait: 10000 }
  );

  return { ok: true, applied: true, summary: plan.summary };
}

module.exports = { loadPasteState, previewGridPaste, commitGridPaste };
