const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole, requireLinkedAthlete } = require('../middleware/auth');
const {
  resolveActiveSeason,
  deriveGrade,
  deriveGraduationYear,
  isEnrolled,
  hasGraduated,
} = require('../lib/season');
const { normalizeGender } = require('../lib/gender');
const calculationService = require('../services/performance/calculationService');

// GET /api/athletes?season=&activeOnly=&search=
//
// Returns the roster for a season. "Roster" has a specific meaning here:
//
//   * If the coach has an explicit SeasonRoster for that season, that IS the
//     roster — even if nobody has raced yet. This is what makes a new season
//     with no results still show a full team instead of an empty screen.
//   * Otherwise the roster is inferred: anyone who raced that season, plus
//     anyone still enrolled (grades 9-12) by graduation year.
//
// Grade is always derived for the requested season, never read off the
// athlete record, so looking at 2024 shows 2024 grades even after a 2025
// import has happened.
router.get('/', authenticate, requireTeam, async (req, res) => {
  const { season, activeOnly, search } = req.query;
  const teamId = req.user.teamId;

  try {
    const seasonYear = await resolveActiveSeason(teamId, season);
    const onlyActive = String(activeOnly ?? 'true').toLowerCase() !== 'false';

    const athletes = await prisma.athlete.findMany({
      where: {
        teamId,
        ...(search && search.trim() !== '' ? { name: { contains: search.trim(), mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    });

    const results = await prisma.result.findMany({
      where: { teamId, athleteId: { in: athletes.map((a) => a.id) }, race: { season: seasonYear } },
      include: { race: true },
    });

    const resultMap = new Map();
    results.forEach((result) => {
      if (!resultMap.has(result.athleteId)) resultMap.set(result.athleteId, []);
      resultMap.get(result.athleteId).push(result);
    });

    // An explicit roster for this season, if the coach has one.
    const seasonRow = await prisma.season.findFirst({
      where: { teamId, year: seasonYear },
      select: { id: true },
    });
    const rosterEntries = seasonRow
      ? await prisma.seasonRoster.findMany({ where: { seasonId: seasonRow.id } })
      : [];
    const rosterById = new Map(rosterEntries.map((entry) => [entry.athleteId, entry]));
    const hasExplicitRoster = rosterEntries.length > 0;

    // Invite status per athlete — lets the roster UI show "Invited" /
    // "Accepted" without a separate request per row.
    const invites = await prisma.athleteInvite.findMany({
      where: { athleteId: { in: athletes.map((a) => a.id) } },
    });
    const inviteByAthleteId = new Map(invites.map((i) => [i.athleteId, i]));

    const enriched = athletes.map((a) => {
      const races = resultMap.get(a.id) || [];
      const rosterEntry = rosterById.get(a.id);
      const invite = inviteByAthleteId.get(a.id);
      // Prefer the grade recorded on the roster (a coach may have corrected
      // it); otherwise derive it from the stable graduation year.
      const grade = rosterEntry?.grade ?? deriveGrade(a.graduationYear, seasonYear);
      return {
        ...a,
        // Old imports/scrapes wrote raw values like 'Men'/'Women' before
        // write-time normalization existed — normalize on read too so
        // already-bad rows don't vanish from gender-split views (Groups).
        gender: normalizeGender(a.gender),
        grade,
        races,
        raceCount: races.length,
        graduated: hasGraduated(a.graduationYear, seasonYear),
        onRoster: hasExplicitRoster
          ? Boolean(rosterEntry && rosterEntry.isActive)
          : races.length > 0 || isEnrolled(a.graduationYear, seasonYear),
        // Set by a roster sync (routes/teams.js POST /scrape-roster) when
        // this athlete no longer appears on Athletic.net — a review signal
        // for the coach, never an automatic removal.
        flaggedForRemoval: Boolean(rosterEntry?.flaggedForRemoval),
        // Truthy exactly when this roster row is linked to an account —
        // matches the roster UI's `if (athlete.user)` check.
        user: a.userId || undefined,
        invite: invite
          ? { status: invite.status, email: invite.email, sentAt: invite.createdAt, acceptedAt: invite.acceptedAt }
          : undefined,
        // T1: captain designation lives on the per-season SeasonRoster row.
        // seasonId is included so the roster UI can call
        // PATCH /api/seasons/:id/roster/:athleteId without a second request
        // just to look up which season it's looking at.
        isCaptain: Boolean(rosterEntry?.isCaptain),
        captainNotes: rosterEntry?.captainNotes ?? null,
        seasonId: seasonRow?.id ?? null,
      };
    });

    const filtered = onlyActive ? enriched.filter((a) => a.onRoster || a.raceCount > 0) : enriched;

    res.json(filtered);
  } catch (error) {
    console.error('Error in GET /athletes:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.get('/:athleteId', authenticate, requireTeam, async (req, res) => {
  const { season } = req.query;

  try {
    const athlete = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId: req.user.teamId },
    });

    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    const seasonYear = await resolveActiveSeason(req.user.teamId, season);

    const results = await prisma.result.findMany({
      where: { athleteId: athlete.id, race: { season: seasonYear } },
      include: { race: true },
    });

    const sortedResults = results.sort((a, b) => new Date(a.race?.date || 0) - new Date(b.race?.date || 0));

    res.json({
      ...athlete,
      gender: normalizeGender(athlete.gender),
      grade: deriveGrade(athlete.graduationYear, seasonYear),
      season: seasonYear,
      results: sortedResults,
    });
  } catch (error) {
    console.error('Error in GET /athletes/:athleteId:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/athletes/:athleteId/races?limit=5
//
// An athlete's most recent races, across all seasons — the VDOT/performance
// calculator seeds its predictions from whichever race the coach picks here.
// This endpoint didn't exist; the frontend called it unconditionally, so
// every request 404'd (compounding a separate bug where the athlete picker
// couldn't identify a specific athlete at all — see the `id` fix on the
// frontend). Distance is returned in miles, matching what the calculator's
// Riegel's-formula code expects.
router.get('/:athleteId/races', authenticate, requireTeam, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 5, 25);

  try {
    const athlete = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId: req.user.teamId },
    });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    const results = await prisma.result.findMany({
      where: { athleteId: athlete.id, time: { gt: 0 } },
      include: { race: true },
      orderBy: { race: { date: 'desc' } },
      take: limit,
    });

    const races = results
      .filter((r) => r.race && r.race.distanceMeters)
      .map((r) => ({
        id: r.id,
        // T5: race reflections key off the Race, not the Result — this
        // endpoint only ever returned Result.id before, which race
        // reflections have no use for. Purely additive field, existing
        // consumers (the VDOT calculator) only ever read the fields above.
        raceId: r.race.id,
        raceName: r.race.name,
        date: r.race.date,
        distance: r.race.distanceMeters / 1609.34,
        time: r.time,
      }));

    res.json(races);
  } catch (error) {
    console.error('Error in GET /athletes/:athleteId/races:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/athletes
// Accepts either an explicit graduationYear or a grade + season to derive it
// from — coaches think in grades ("she's a sophomore"), the data model thinks
// in graduation years, so translate at the edge rather than storing the grade.
router.post('/', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { firstName, lastName, name, graduationYear, grade, season, gender } = req.body;
  const teamId = req.user.teamId;

  const fullName = (name || [firstName, lastName].filter(Boolean).join(' ')).trim();
  if (!fullName) {
    return res.status(400).json({ msg: 'Athlete name is required' });
  }

  try {
    const seasonYear = await resolveActiveSeason(teamId, season);
    const gradYear = graduationYear
      ? parseInt(graduationYear, 10)
      : deriveGraduationYear(grade, seasonYear);

    // No same-name rejection here (Build Spec Phase 2 step 5): a 120-person
    // roster having two "Jack Smith"s is normal, and athletes(team_id, name)
    // is no longer a unique constraint the database would enforce anyway.

    const athlete = await prisma.athlete.create({
      data: {
        teamId,
        name: fullName,
        graduationYear: gradYear,
        gender: normalizeGender(gender),
      },
    });

    // Put the new athlete on the season roster straight away, so adding
    // someone mid-preseason (before any results exist) actually shows up.
    if (gradYear !== null && isEnrolled(gradYear, seasonYear)) {
      const seasonRow = await prisma.season.upsert({
        where: { teamId_year_sport: { teamId, year: seasonYear, sport: 'XC' } },
        update: {},
        create: { teamId, year: seasonYear, sport: 'XC' },
      });
      await prisma.seasonRoster.upsert({
        where: { seasonId_athleteId: { seasonId: seasonRow.id, athleteId: athlete.id } },
        update: { isActive: true, grade: deriveGrade(gradYear, seasonYear) },
        create: {
          seasonId: seasonRow.id,
          athleteId: athlete.id,
          grade: deriveGrade(gradYear, seasonYear),
          isActive: true,
        },
      });
    }

    // A new athlete changes the roster calculateAllMetrics derives its
    // grade/gender breakdowns from, even before they've raced — same
    // fire-and-forget trigger every other roster-affecting write uses.
    calculationService
      .calculateAllMetrics(teamId, seasonYear)
      .catch((calcError) => console.error(`Error recalculating metrics after adding athlete for season ${seasonYear}:`, calcError.message));

    res.status(201).json({ ...athlete, grade: deriveGrade(gradYear, seasonYear) });
  } catch (error) {
    console.error('Error in POST /athletes:', error.message);
    res.status(500).json({ msg: 'Error creating athlete' });
  }
});

router.put('/:athleteId', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { firstName, lastName, name, graduationYear, grade, season, gender } = req.body;
  const teamId = req.user.teamId;

  try {
    const existing = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId },
    });

    if (!existing) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    const seasonYear = await resolveActiveSeason(teamId, season);

    const updates = {};
    const fullName = (name || [firstName, lastName].filter(Boolean).join(' ')).trim();
    if (fullName) updates.name = fullName;
    if (gender) updates.gender = normalizeGender(gender) ?? undefined;

    // Correcting a grade means correcting the graduation year it implies —
    // that keeps every other season's view of this athlete consistent.
    if (graduationYear !== undefined) {
      updates.graduationYear = graduationYear ? parseInt(graduationYear, 10) : null;
    } else if (grade !== undefined) {
      updates.graduationYear = deriveGraduationYear(grade, seasonYear);
    }

    const athlete = await prisma.athlete.update({ where: { id: existing.id }, data: updates });

    // Only gender/graduationYear feed calculationService's breakdowns —
    // a bare name edit doesn't need a recompute.
    if ('gender' in updates || 'graduationYear' in updates) {
      calculationService
        .calculateAllMetrics(teamId, seasonYear)
        .catch((calcError) => console.error(`Error recalculating metrics after editing athlete for season ${seasonYear}:`, calcError.message));
    }

    res.json({ ...athlete, grade: deriveGrade(athlete.graduationYear, seasonYear) });
  } catch (error) {
    console.error('Error in PUT /athletes/:athleteId:', error.message);
    res.status(500).json({ msg: 'Error updating athlete' });
  }
});

router.delete('/:athleteId', authenticate, requireTeam, requireRole(['HEAD_COACH']), async (req, res) => {
  const teamId = req.user.teamId;
  try {
    const existing = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId },
    });

    if (!existing) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    // The athlete's own AthleteSeasonMetrics rows cascade-delete with them
    // (schema FK), but TeamSeasonMetrics (team-wide totals/averages) has no
    // FK to Athlete at all — it would keep counting this athlete's results
    // in the team's numbers forever otherwise. Read which seasons they
    // actually raced in before the delete cascades their Results away.
    const seasonsRaced = await prisma.result.findMany({
      where: { athleteId: existing.id },
      select: { race: { select: { season: true } } },
    });
    const affectedSeasons = [...new Set(seasonsRaced.map((r) => r.race.season))];

    await prisma.athlete.delete({ where: { id: existing.id } });

    for (const season of affectedSeasons) {
      calculationService
        .calculateAllMetrics(teamId, season)
        .catch((calcError) => console.error(`Error recalculating metrics after deleting athlete for season ${season}:`, calcError.message));
    }

    res.json({ msg: 'Athlete deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /athletes/:athleteId:', error.message);
    res.status(500).json({ msg: 'Error deleting athlete' });
  }
});

// ---------------------------------------------------------------------------
// Coach-initiated invite: unlike a claim (routes/team.js), the coach already
// knows exactly which athlete this is, so accepting the token IS the
// approval — no separate review step.
// ---------------------------------------------------------------------------

const INVITE_TTL_DAYS = 30;

// POST /api/athletes/:athleteId/invite
router.post('/:athleteId/invite', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { email } = req.body;
  const teamId = req.user.teamId;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ msg: 'A valid email is required.' });
  }

  try {
    const athlete = await prisma.athlete.findFirst({ where: { id: req.params.athleteId, teamId } });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found.' });
    }
    if (athlete.userId) {
      return res.status(409).json({ msg: 'This athlete is already linked to an account.' });
    }

    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    // One invite per athlete — resending overwrites the token (a fresh link)
    // rather than accumulating history.
    const invite = await prisma.athleteInvite.upsert({
      where: { athleteId: athlete.id },
      update: { email, status: 'pending', expiresAt, acceptedAt: null },
      create: { athleteId: athlete.id, teamId, email, expiresAt },
    });

    // No email service is wired up (see MIGRATION_STATUS.md) — the coach
    // copies/sends this link themselves, same as the join code already works.
    res.status(201).json({
      msg: `Invite ready for ${athlete.name}.`,
      token: invite.token,
      invite: { token: invite.token, email: invite.email, expiresAt: invite.expiresAt },
    });
  } catch (error) {
    console.error('Error creating invite:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/athletes/accept-invite
// Authenticated: the token identifies the athlete; the session identifies
// who is claiming them.
router.post('/accept-invite', authenticate, async (req, res) => {
  const { token } = req.body;
  const userId = req.user.id;

  if (!token) {
    return res.status(400).json({ msg: 'Invite token is required.' });
  }

  try {
    const invite = await prisma.athleteInvite.findUnique({
      where: { token },
      include: { athlete: true, team: true },
    });

    if (!invite || invite.status !== 'pending') {
      return res.status(404).json({ msg: 'This invite is no longer valid.' });
    }
    if (invite.expiresAt < new Date()) {
      return res.status(410).json({ msg: 'This invite has expired. Ask your coach to resend it.' });
    }
    if (invite.athlete.userId && invite.athlete.userId !== userId) {
      return res.status(409).json({ msg: 'This athlete is already linked to a different account.' });
    }

    const [athlete] = await prisma.$transaction([
      prisma.athlete.update({ where: { id: invite.athleteId }, data: { userId } }),
      prisma.athleteInvite.update({
        where: { id: invite.id },
        data: { status: 'accepted', acceptedAt: new Date() },
      }),
      prisma.user.update({ where: { id: userId }, data: { teamId: invite.teamId } }),
      prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: invite.teamId, userId } },
        update: {},
        create: { teamId: invite.teamId, userId, role: 'ATHLETE' },
      }),
    ]);

    res.json({
      msg: `Welcome to ${invite.team.name}!`,
      athleteId: athlete.id,
      athleteName: athlete.name,
      teamId: invite.teamId,
      athleticTeamId: invite.team.athleticTeamId,
    });
  } catch (error) {
    console.error('Error accepting invite:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// Athlete self-service: logging your own training runs. Deliberately a
// separate model from Result/Race (see schema.prisma) — a self-reported run
// must never be able to corrupt race history or team-wide meet aggregates.
// Every route here is scoped by req.user.linkedAthlete.id, never a param, so
// there's no way to read or write another athlete's training log.
// ---------------------------------------------------------------------------

const VALID_LOG_TYPES = new Set(['easy', 'long', 'tempo', 'interval', 'race', 'other']);

// GET /api/athletes/me/training-logs?limit=
router.get('/me/training-logs', authenticate, requireLinkedAthlete, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  try {
    const logs = await prisma.trainingLog.findMany({
      where: { athleteId: req.user.linkedAthlete.id },
      orderBy: { date: 'desc' },
      take: limit,
    });
    res.json(logs);
  } catch (error) {
    console.error('Error in GET /athletes/me/training-logs:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/athletes/me/training-logs
router.post('/me/training-logs', authenticate, requireLinkedAthlete, async (req, res) => {
  const { date, type, distanceMi, durationSec, notes } = req.body;

  if (!date || Number.isNaN(new Date(date).getTime())) {
    return res.status(400).json({ msg: 'A valid date is required.' });
  }
  if (!type || !VALID_LOG_TYPES.has(type)) {
    return res.status(400).json({ msg: `Type must be one of: ${[...VALID_LOG_TYPES].join(', ')}` });
  }
  if (distanceMi !== undefined && distanceMi !== null && (typeof distanceMi !== 'number' || distanceMi < 0)) {
    return res.status(400).json({ msg: 'Distance must be a non-negative number.' });
  }
  if (durationSec !== undefined && durationSec !== null && (!Number.isInteger(durationSec) || durationSec < 0)) {
    return res.status(400).json({ msg: 'Duration must be a non-negative whole number of seconds.' });
  }

  try {
    const log = await prisma.trainingLog.create({
      data: {
        athleteId: req.user.linkedAthlete.id,
        date: new Date(date),
        type,
        distanceMi: distanceMi ?? null,
        durationSec: durationSec ?? null,
        notes: notes || null,
      },
    });
    res.status(201).json(log);
  } catch (error) {
    console.error('Error in POST /athletes/me/training-logs:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/athletes/me/training-logs/:logId
router.delete('/me/training-logs/:logId', authenticate, requireLinkedAthlete, async (req, res) => {
  try {
    const log = await prisma.trainingLog.findFirst({
      where: { id: req.params.logId, athleteId: req.user.linkedAthlete.id },
    });
    if (!log) {
      return res.status(404).json({ msg: 'Training log not found.' });
    }
    await prisma.trainingLog.delete({ where: { id: log.id } });
    res.json({ msg: 'Deleted' });
  } catch (error) {
    console.error('Error in DELETE /athletes/me/training-logs/:logId:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
