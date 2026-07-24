const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam } = require('../middleware/auth');
const {
  resolveActiveSeason,
  deriveGrade,
  deriveGraduationYear,
  isEnrolled,
  hasGraduated,
} = require('../lib/season');

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

    const enriched = athletes.map((a) => {
      const races = resultMap.get(a.id) || [];
      const rosterEntry = rosterById.get(a.id);
      // Prefer the grade recorded on the roster (a coach may have corrected
      // it); otherwise derive it from the stable graduation year.
      const grade = rosterEntry?.grade ?? deriveGrade(a.graduationYear, seasonYear);
      return {
        ...a,
        grade,
        races,
        raceCount: races.length,
        graduated: hasGraduated(a.graduationYear, seasonYear),
        onRoster: hasExplicitRoster
          ? Boolean(rosterEntry && rosterEntry.isActive)
          : races.length > 0 || isEnrolled(a.graduationYear, seasonYear),
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
      grade: deriveGrade(athlete.graduationYear, seasonYear),
      season: seasonYear,
      results: sortedResults,
    });
  } catch (error) {
    console.error('Error in GET /athletes/:athleteId:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/athletes
// Accepts either an explicit graduationYear or a grade + season to derive it
// from — coaches think in grades ("she's a sophomore"), the data model thinks
// in graduation years, so translate at the edge rather than storing the grade.
router.post('/', authenticate, requireTeam, async (req, res) => {
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

    const existing = await prisma.athlete.findFirst({ where: { teamId, name: fullName } });
    if (existing) {
      return res.status(409).json({ msg: 'An athlete with that name already exists on this team.' });
    }

    const athlete = await prisma.athlete.create({
      data: {
        teamId,
        name: fullName,
        graduationYear: gradYear,
        gender: gender || null,
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

    res.status(201).json({ ...athlete, grade: deriveGrade(gradYear, seasonYear) });
  } catch (error) {
    console.error('Error in POST /athletes:', error.message);
    res.status(500).json({ msg: 'Error creating athlete' });
  }
});

router.put('/:athleteId', authenticate, requireTeam, async (req, res) => {
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
    if (gender) updates.gender = gender;

    // Correcting a grade means correcting the graduation year it implies —
    // that keeps every other season's view of this athlete consistent.
    if (graduationYear !== undefined) {
      updates.graduationYear = graduationYear ? parseInt(graduationYear, 10) : null;
    } else if (grade !== undefined) {
      updates.graduationYear = deriveGraduationYear(grade, seasonYear);
    }

    const athlete = await prisma.athlete.update({ where: { id: existing.id }, data: updates });
    res.json({ ...athlete, grade: deriveGrade(athlete.graduationYear, seasonYear) });
  } catch (error) {
    console.error('Error in PUT /athletes/:athleteId:', error.message);
    res.status(500).json({ msg: 'Error updating athlete' });
  }
});

router.delete('/:athleteId', authenticate, requireTeam, async (req, res) => {
  try {
    const existing = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId: req.user.teamId },
    });

    if (!existing) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    await prisma.athlete.delete({ where: { id: existing.id } });
    res.json({ msg: 'Athlete deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /athletes/:athleteId:', error.message);
    res.status(500).json({ msg: 'Error deleting athlete' });
  }
});

module.exports = router;
