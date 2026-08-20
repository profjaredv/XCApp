const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole, requireLinkedAthlete } = require('../middleware/auth');
const { buildMeetMappingProposal } = require('../lib/meetMapping');
const { parseTeamCalendar } = require('../lib/icalMeets');

// T4 (Team Management handoff), simplified per the Schedule rework: meet
// operations — the Meet parent entity (name/date/location/home-or-away)
// and its scraped-race import flows. Mounted at /api/meet-ops,
// deliberately NOT /api/meets — that path already serves routes/meets.js,
// a legacy analytics endpoint that treats each Race row as its own "meet"
// (the exact "Race but no parent" gap this file fills). See the Meet
// model's comment in schema.prisma for the full story; that file is left
// alone since renaming it isn't in scope here.
//
// Coach-facing entry/seed-time/bib editing, meet-day logistics, and the
// printable roster were removed: results sync (routes/meets.js) already
// supplies what's needed once a race is scraped, and a coach no longer
// hand-manages entries here. MeetEntry rows are still read (never
// written) to power the athlete-facing "you are entered" status below and
// in routes/today.js — that's the one thing this simplification kept.
const COACH_ROLES = ['HEAD_COACH', 'COACH'];
// B4 (LeadPack Master Build Handoff): athletes get a "Meets" nav item
// pointing at this same list, read-only. Volunteer coaches get the full
// PROGRAM section of the nav spine (everything but Setup), which includes
// Meets, so they need at least read access here too — the COACH_ROLES-only
// gate above only ever covered entry/logistics *management*, never applied
// to viewing the list.
const LIST_VIEW_ROLES = ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH', 'ATHLETE'];

// GET /api/meet-ops?seasonId=
router.get('/', authenticate, requireTeam, requireRole(LIST_VIEW_ROLES), async (req, res) => {
  const { seasonId } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const meets = await prisma.meet.findMany({
      where: { seasonId },
      include: {
        races: { select: { id: true, name: true, distance: true } },
      },
      orderBy: { date: 'asc' },
    });

    // Athlete/read-only view: attach their own entry status per race so the
    // list is self-contained (B4 — "Meets, read-only") without a second
    // round trip. Coaches don't get this field; "my status" isn't a
    // meaningful concept for someone managing every athlete's entries.
    const linkedAthleteId = req.user.linkedAthlete?.id;
    let myEntriesByRaceId = new Map();
    if (linkedAthleteId) {
      const raceIds = meets.flatMap((m) => m.races.map((r) => r.id));
      const myEntries = raceIds.length
        ? await prisma.meetEntry.findMany({
            where: { athleteId: linkedAthleteId, raceId: { in: raceIds } },
            select: { raceId: true, status: true },
          })
        : [];
      myEntriesByRaceId = new Map(myEntries.map((e) => [e.raceId, e.status]));
    }

    res.json(
      meets.map((m) => ({
        id: m.id,
        name: m.name,
        date: m.date,
        location: m.location,
        isHome: m.isHome,
        races: linkedAthleteId
          ? m.races.map((r) => ({ ...r, myEntryStatus: myEntriesByRaceId.get(r.id) ?? 'NOT_ENTERED' }))
          : m.races,
      }))
    );
  } catch (error) {
    console.error('Error fetching meets:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/meet-ops — most Meet rows come from the coach-confirmed
// scripts/applyMeetMapping.js backfill; this covers an upcoming meet that
// hasn't been scraped yet and needs entries/logistics set up in advance.
router.post('/', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { seasonId, name, date, location, isHome } = req.body;
  if (!seasonId || !name || !date) {
    return res.status(400).json({ msg: 'seasonId, name, and date are required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const meet = await prisma.meet.create({
      data: {
        teamId: req.user.teamId,
        seasonId,
        name: name.trim(),
        date: new Date(date),
        location: location || null,
        isHome: isHome ?? null,
      },
    });
    res.status(201).json(meet);
  } catch (error) {
    console.error('Error creating meet:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/meet-ops/import/propose?seasonId= — groups this season's races
// that don't already belong to a Meet by an exact (team, season, date)
// match (lib/meetMapping.js — the same logic scripts/proposeMeetMapping.js
// uses for a whole-team, all-seasons CLI pass, scoped here to one season
// and reachable without shell access). Read-only: proposes, writes
// nothing. A coach reviews and edits names in the UI, then POSTs the
// confirmed list to /import below — never auto-created.
router.get('/import/propose', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { seasonId } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const races = await prisma.race.findMany({
      where: { teamId: req.user.teamId, season: season.year, meetId: null },
      select: { id: true, name: true, date: true, location: true },
    });

    const { meets } = buildMeetMappingProposal({
      races: races.map((r) => ({ ...r, teamId: req.user.teamId, seasonId: season.id })),
    });

    res.json(
      meets.map((m) => ({
        proposedName: m.proposedName,
        location: m.location,
        date: m.date,
        raceNames: m.raceNames,
        raceCount: m.raceCount,
        raceIds: m.raceIds,
      }))
    );
  } catch (error) {
    console.error('Error proposing meet import:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/meet-ops/import — creates a Meet per confirmed entry and links
// its races. Only ever called with what a coach reviewed from the
// propose step above; nothing here re-derives groupings on its own.
router.post('/import', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { seasonId, meets } = req.body;
  if (!seasonId || !Array.isArray(meets) || meets.length === 0) {
    return res.status(400).json({ msg: 'seasonId and a non-empty meets array are required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const results = await prisma.$transaction(async (tx) => {
      const applied = [];
      for (const entry of meets) {
        if (!entry.name || !String(entry.name).trim() || !entry.date || !Array.isArray(entry.raceIds) || entry.raceIds.length === 0) {
          continue;
        }

        // These races may already carry the Athletic.net meet ID from
        // results scraping. If a Meet already exists for that ID (e.g. a
        // coach imported this meet from the team's calendar feed before
        // results were scraped), attach to it instead of creating a
        // second Meet row for the same real-world meet.
        const groupRaces = await tx.race.findMany({
          where: { id: { in: entry.raceIds }, teamId: req.user.teamId },
          select: { athleticMeetId: true },
        });
        const distinctIds = new Set(groupRaces.map((r) => r.athleticMeetId).filter(Boolean));
        const sharedAthleticMeetId = distinctIds.size === 1 ? [...distinctIds][0] : null;

        const meet = sharedAthleticMeetId
          ? await tx.meet.upsert({
              where: { teamId_seasonId_athleticMeetId: { teamId: req.user.teamId, seasonId, athleticMeetId: sharedAthleticMeetId } },
              update: {},
              create: {
                teamId: req.user.teamId,
                seasonId,
                athleticMeetId: sharedAthleticMeetId,
                name: String(entry.name).trim(),
                date: new Date(entry.date),
                location: entry.location || null,
              },
            })
          : await tx.meet.create({
              data: {
                teamId: req.user.teamId,
                seasonId,
                name: String(entry.name).trim(),
                date: new Date(entry.date),
                location: entry.location || null,
              },
            });
        const updateResult = await tx.race.updateMany({
          where: { id: { in: entry.raceIds }, teamId: req.user.teamId, meetId: null },
          data: { meetId: meet.id },
        });
        applied.push({ id: meet.id, name: meet.name, raceCount: updateResult.count });
      }
      return applied;
    });

    res.status(201).json({ msg: `Imported ${results.length} meet(s).`, meets: results });
  } catch (error) {
    console.error('Error importing meets:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/meet-ops/import/propose-calendar?seasonId= — an alternative
// source for the same "propose, coach confirms, then import" flow above,
// meant for preseason (before any results exist to group) or mid-season
// schedule changes: pulls the team's own Athletic.net calendar feed
// (https://www.athletic.net/CrossCountry/Print/ical.ashx) rather than
// grouping already-scraped races. That feed is a plain public .ics
// endpoint meant for calendar-app subscriptions — no login, no browser
// rendering needed, unlike the team's Angular schedule page. Read-only.
router.get('/import/propose-calendar', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { seasonId } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const [season, team] = await Promise.all([
      prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } }),
      prisma.team.findUnique({ where: { id: req.user.teamId }, select: { athleticTeamId: true } }),
    ]);
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }
    if (!team?.athleticTeamId) {
      return res.status(400).json({ msg: 'This team has no linked Athletic.net school ID to import from.' });
    }

    const url = `https://www.athletic.net/CrossCountry/Print/ical.ashx?SchoolID=${encodeURIComponent(team.athleticTeamId)}&S=${season.year}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let icsText;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        return res.status(502).json({ msg: `Athletic.net returned an error (${response.status}) fetching the team calendar.` });
      }
      icsText = await response.text();
    } catch (fetchError) {
      console.error('Error fetching Athletic.net calendar feed:', fetchError.message);
      return res.status(502).json({ msg: 'Could not reach Athletic.net to fetch the team calendar.' });
    } finally {
      clearTimeout(timeout);
    }

    const calendarMeets = parseTeamCalendar(icsText);
    const athleticMeetIds = calendarMeets.map((m) => m.athleticMeetId);

    const [existingMeets, unlinkedRaces] = await Promise.all([
      prisma.meet.findMany({
        where: { teamId: req.user.teamId, seasonId, athleticMeetId: { in: athleticMeetIds } },
        select: { athleticMeetId: true },
      }),
      prisma.race.findMany({
        where: { teamId: req.user.teamId, season: season.year, meetId: null, athleticMeetId: { in: athleticMeetIds } },
        select: { athleticMeetId: true },
      }),
    ]);
    const alreadyImported = new Set(existingMeets.map((m) => m.athleticMeetId));
    const unlinkedCountById = new Map();
    for (const r of unlinkedRaces) {
      unlinkedCountById.set(r.athleticMeetId, (unlinkedCountById.get(r.athleticMeetId) || 0) + 1);
    }

    res.json(
      calendarMeets.map((m) => ({
        athleticMeetId: m.athleticMeetId,
        name: m.name,
        date: m.date,
        location: m.location,
        alreadyImported: alreadyImported.has(m.athleticMeetId),
        unlinkedRaceCount: unlinkedCountById.get(m.athleticMeetId) || 0,
      }))
    );
  } catch (error) {
    console.error('Error proposing calendar import:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/meet-ops/import-calendar — creates/updates a Meet per confirmed
// calendar entry, keyed on Athletic.net's own meet ID so re-running this
// (or running it after the race-based import above has already created
// some of these meets from scraped results) never duplicates a row. Any
// already-scraped, not-yet-linked races for the same meet ID get linked in
// the same pass, so a coach doesn't have to separately group them later.
router.post('/import-calendar', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { seasonId, meets } = req.body;
  if (!seasonId || !Array.isArray(meets) || meets.length === 0) {
    return res.status(400).json({ msg: 'seasonId and a non-empty meets array are required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const results = await prisma.$transaction(async (tx) => {
      const applied = [];
      for (const entry of meets) {
        if (!entry.athleticMeetId || !entry.name || !String(entry.name).trim() || !entry.date) {
          continue;
        }
        const meet = await tx.meet.upsert({
          where: {
            teamId_seasonId_athleticMeetId: {
              teamId: req.user.teamId,
              seasonId,
              athleticMeetId: String(entry.athleticMeetId),
            },
          },
          update: {
            name: String(entry.name).trim(),
            date: new Date(entry.date),
            location: entry.location || null,
          },
          create: {
            teamId: req.user.teamId,
            seasonId,
            athleticMeetId: String(entry.athleticMeetId),
            name: String(entry.name).trim(),
            date: new Date(entry.date),
            location: entry.location || null,
          },
        });
        const linkResult = await tx.race.updateMany({
          where: { teamId: req.user.teamId, athleticMeetId: String(entry.athleticMeetId), meetId: null },
          data: { meetId: meet.id },
        });
        applied.push({ id: meet.id, name: meet.name, linkedRaceCount: linkResult.count });
      }
      return applied;
    });

    res.status(201).json({ msg: `Imported ${results.length} meet(s).`, meets: results });
  } catch (error) {
    console.error('Error importing meets from calendar:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/meet-ops/mine — the athlete meet card: the next upcoming meet
// for their team and their own entry status for it. "A non-entered
// athlete sees that they are not entered rather than a blank screen" —
// entry always resolves to a real object, defaulting to NOT_ENTERED with
// no race attached, never null/undefined.
router.get('/mine', authenticate, requireLinkedAthlete, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const meet = await prisma.meet.findFirst({
      where: { teamId: req.user.teamId, date: { gte: today } },
      orderBy: { date: 'asc' },
      include: { races: true },
    });

    if (!meet) {
      return res.json({ meet: null, race: null, entry: null });
    }

    const raceIds = meet.races.map((r) => r.id);
    const entryRow = await prisma.meetEntry.findFirst({
      where: { raceId: { in: raceIds }, athleteId: req.user.linkedAthlete.id },
    });
    const race = entryRow ? meet.races.find((r) => r.id === entryRow.raceId) : null;

    res.json({
      meet: { id: meet.id, name: meet.name, date: meet.date, location: meet.location, isHome: meet.isHome },
      race: race ? { id: race.id, name: race.name, distance: race.distance } : null,
      entry: {
        status: entryRow?.status ?? 'NOT_ENTERED',
        bibNumber: entryRow?.bibNumber ?? null,
        seedTimeSec: entryRow?.seedTimeSec ?? null,
        notes: entryRow?.notes ?? null,
      },
    });
  } catch (error) {
    console.error('Error fetching athlete meet card:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/meet-ops/:meetId — detail (races only). Placed after the more
// specific /:meetId/* routes above so it doesn't shadow them.
router.get('/:meetId', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  try {
    const meet = await prisma.meet.findFirst({
      where: { id: req.params.meetId, teamId: req.user.teamId },
      include: { races: true },
    });
    if (!meet) {
      return res.status(404).json({ msg: 'Meet not found.' });
    }
    res.json(meet);
  } catch (error) {
    console.error('Error fetching meet:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/meet-ops/:meetId
router.put('/:meetId', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { name, date, location, isHome } = req.body;
  try {
    const meet = await prisma.meet.findFirst({ where: { id: req.params.meetId, teamId: req.user.teamId } });
    if (!meet) {
      return res.status(404).json({ msg: 'Meet not found.' });
    }
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (date !== undefined) updates.date = new Date(date);
    if (location !== undefined) updates.location = location;
    if (isHome !== undefined) updates.isHome = isHome;
    const updated = await prisma.meet.update({ where: { id: meet.id }, data: updates });
    res.json(updated);
  } catch (error) {
    console.error('Error updating meet:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
