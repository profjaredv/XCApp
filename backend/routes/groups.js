const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole, requireLinkedAthlete, hasTeamRole } = require('../middleware/auth');
const { ANY_COACH, FULL_COACH } = require('../lib/teamRoles');
const { getGroupOn, getActiveMembersOf, moveAthleteToGroup, removeAthleteFromGroup, isMembershipActiveOn } = require('../lib/groups');
const { decideCanManageGroup } = require('../lib/groupPermissions');
const { normalizeGender } = require('../lib/gender');
const { deriveGrade } = require('../lib/season');
const { parseDistanceToMeters } = require('../lib/distance');
const { buildAthleteSeasonSummary, summarizeGroup, paceSecPerMile, summarizeGroupAtRace } = require('../lib/groupAnalytics');

const GROUP_TYPES = new Set(['TRAINING', 'CAPTAIN', 'CUSTOM']);

// A head/paid coach can manage any group on their team. A volunteer coach
// can only manage a group they actually lead — T2 is the first place
// VOLUNTEER_COACH's group-scoped access (per its TeamRole comment in
// schema.prisma) becomes a real, checkable thing rather than a role with
// nowhere to apply. Not folded into requireRole: this is a data-scoped
// check (does a GroupLeader row exist for THIS group), not a route-level
// role gate. The actual decision logic lives in lib/groupPermissions.js,
// DB-free and unit-tested; this just fetches what it needs.
async function canManageGroup(req, groupId) {
  const [membership, leaderRow] = await Promise.all([
    prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: req.user.teamId, userId: req.user.id } } }),
    prisma.groupLeader.findFirst({ where: { groupId, userId: req.user.id } }),
  ]);
  return decideCanManageGroup({
    isOwner: req.user.team?.coachUid === req.user.id,
    membership,
    isGroupLeader: Boolean(leaderRow),
  });
}

// GET /api/groups?seasonId=
// Coach-tier roles see every group on the team (including the frontend's
// synthetic "Unassigned" bucket, computed by diffing this full list against
// the roster). An ATHLETE (or captain with no coach role) narrows to only
// the group(s) they're currently an active member of — no visibility into
// team structure or who's unassigned, same "self-scope, don't just hide it
// in the UI" convention as /athletes/me/training-logs.
router.get('/', authenticate, requireTeam, async (req, res) => {
  const { seasonId } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const isCoachTier = await hasTeamRole(req.user, ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH']);
    let groupIdFilter = null;
    if (!isCoachTier) {
      const myMemberships = req.user.linkedAthlete
        ? await prisma.groupMembership.findMany({
            where: { athleteId: req.user.linkedAthlete.id, endDate: null, group: { seasonId } },
            select: { groupId: true },
          })
        : [];
      groupIdFilter = myMemberships.map((m) => m.groupId);
    }

    const groups = await prisma.group.findMany({
      where: { seasonId, ...(groupIdFilter ? { id: { in: groupIdFilter } } : {}) },
      include: {
        leaders: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { memberships: { where: { endDate: null } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    res.json(
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        gender: normalizeGender(g.gender),
        sortOrder: g.sortOrder,
        color: g.color,
        archived: g.archived,
        activeMemberCount: g._count.memberships,
        leaders: g.leaders.map((l) => ({ userId: l.userId, name: l.user.name, email: l.user.email, primary: l.primary })),
      }))
    );
  } catch (error) {
    console.error('Error fetching groups:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/groups/me
// Read-only self-service counterpart to the coach-facing list above: an
// athlete's own current group(s) — TRAINING is exclusive, CAPTAIN/CUSTOM
// can run alongside it (lib/groups.js) — plus each group's other active
// members. This is what an ATHLETE-role account should actually be shown
// instead of the full team roster/group-management screen.
router.get('/me', authenticate, requireTeam, requireLinkedAthlete, async (req, res) => {
  try {
    const today = new Date();
    // A plain endDate: null list would miss an active-but-bounded
    // X_TRAINING stint (see GroupType's schema comment) — same reasoning
    // as getActiveMembersOf below, applied to "my own" side of this query.
    const allMemberships = await prisma.groupMembership.findMany({
      where: { athleteId: req.user.linkedAthlete.id },
      include: { group: true },
    });
    const myMemberships = allMemberships.filter((m) => isMembershipActiveOn(m, today));

    const groups = await Promise.all(
      myMemberships.map(async (m) => {
        const members = await getActiveMembersOf(m.groupId, today);
        const athletes = await prisma.athlete.findMany({
          where: { id: { in: members.map((mem) => mem.athleteId) } },
          select: { id: true, name: true, preferredName: true, gender: true, grade: true },
        });
        const athleteById = new Map(athletes.map((a) => [a.id, a]));
        return {
          id: m.group.id,
          name: m.group.name,
          type: m.group.type,
          gender: normalizeGender(m.group.gender),
          color: m.group.color,
          members: members
            .map((mem) => {
              const athlete = athleteById.get(mem.athleteId);
              if (!athlete) return null;
              return {
                athleteId: mem.athleteId,
                name: athlete.preferredName || athlete.name,
                gender: normalizeGender(athlete.gender),
                grade: athlete.grade,
              };
            })
            .filter(Boolean)
            .sort((a, b) => a.name.localeCompare(b.name)),
        };
      })
    );

    res.json({ groups });
  } catch (error) {
    console.error('Error fetching own groups:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/groups/analytics?seasonId=&groupIds=id1,id2&dataYear=2024 —
// filter analytics to one or more groups' current rosters and compare
// them against each other, normalized to pace (lib/groupAnalytics.js) so
// groups racing different distances are still comparable. Computed live
// from Result/Race rows — deliberately not dependent on the
// AthleteSeasonMetrics cache table or any "run analysis first" step (the
// same gap that used to block viewing an athlete's profile before that
// season's metrics had been calculated).
//
// `seasonId` picks which Group rows define the roster — always the
// season the coach is actively managing groups for, typically the
// current one. `dataYear` (defaults to that season's own year) picks
// which year of results to display for that fixed roster — they're
// deliberately independent: a coach setting up preseason groups for 2026
// can look at what today's roster did in 2024 without 2024 needing its
// own Group rows or even its own Season row (`dataYear` is matched
// straight off `Race.season`, a plain int, same as everywhere else in
// this app that reasons about "which year," including seasons that
// predate the Season table being populated for every year).
//
// The per-athlete "no race yet, fall back to their most recent prior
// season" affordance only applies when `dataYear` equals the group's own
// season — that's the live/preseason case this exists for. Explicitly
// picking a past year is a coach asking "what did this year look like,"
// and substituting a different year's number there would be actively
// misleading, so no fallback happens: an athlete with nothing in that
// specific year just shows no data, honestly.
router.get('/analytics', authenticate, requireTeam, async (req, res) => {
  const { seasonId, groupIds, dataYear: dataYearRaw } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const parsedDataYear = parseInt(dataYearRaw, 10);
    const dataYear = Number.isFinite(parsedDataYear) ? parsedDataYear : season.year;
    const allowFallback = dataYear === season.year;

    const requestedIds =
      typeof groupIds === 'string'
        ? groupIds.split(',').map((s) => s.trim()).filter(Boolean)
        : null;

    const groups = await prisma.group.findMany({
      where: {
        seasonId,
        archived: false,
        // No explicit selection: default to comparing the season's
        // training groups (the natural "compare my squads" case).
        // Captain/Custom groups are only included when asked for by id —
        // they're leadership designations, not performance cohorts.
        ...(requestedIds && requestedIds.length > 0 ? { id: { in: requestedIds } } : { type: 'TRAINING' }),
      },
      include: {
        memberships: {
          where: { endDate: null },
          include: { athlete: { select: { id: true, name: true, preferredName: true, graduationYear: true } } },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const athleteIds = [...new Set(groups.flatMap((g) => g.memberships.map((m) => m.athleteId)))];

    const distanceMeters = (race) => race.distanceMeters ?? parseDistanceToMeters(race.distance);

    let currentByAthlete = new Map();
    let priorByAthlete = new Map();
    if (athleteIds.length > 0) {
      const [currentResults, priorResults] = await Promise.all([
        prisma.result.findMany({
          where: { athleteId: { in: athleteIds }, status: 'FINISHED', time: { gt: 0 }, race: { season: dataYear } },
          select: { athleteId: true, time: true, race: { select: { distance: true, distanceMeters: true } } },
        }),
        allowFallback
          ? prisma.result.findMany({
              where: { athleteId: { in: athleteIds }, status: 'FINISHED', time: { gt: 0 }, race: { season: { lt: dataYear } } },
              select: { athleteId: true, time: true, race: { select: { season: true, distance: true, distanceMeters: true } } },
            })
          : Promise.resolve([]),
      ]);

      for (const r of currentResults) {
        const list = currentByAthlete.get(r.athleteId) || [];
        list.push({ timeSec: r.time, distanceMeters: distanceMeters(r.race) });
        currentByAthlete.set(r.athleteId, list);
      }

      for (const r of priorResults) {
        const yearMap = priorByAthlete.get(r.athleteId) || new Map();
        const list = yearMap.get(r.race.season) || [];
        list.push({ timeSec: r.time, distanceMeters: distanceMeters(r.race) });
        yearMap.set(r.race.season, list);
        priorByAthlete.set(r.athleteId, yearMap);
      }
    }

    const summaryByAthlete = new Map();
    for (const athleteId of athleteIds) {
      const yearMap = priorByAthlete.get(athleteId) || new Map();
      const priorSeasonsByYearDesc = [...yearMap.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([year, races]) => ({ year, races }));
      summaryByAthlete.set(
        athleteId,
        buildAthleteSeasonSummary({
          targetSeason: dataYear,
          currentSeasonRaces: currentByAthlete.get(athleteId) || [],
          priorSeasonsByYearDesc,
        })
      );
    }

    res.json(
      groups.map((g) => {
        const athletes = g.memberships.map((m) => {
          const summary = summaryByAthlete.get(m.athleteId);
          return {
            athleteId: m.athleteId,
            name: m.athlete.preferredName || m.athlete.name,
            grade: deriveGrade(m.athlete.graduationYear, dataYear),
            season: summary?.season ?? null,
            isFallback: summary?.isFallback ?? null,
            raceCount: summary?.raceCount ?? 0,
            bestPaceSecPerMile: summary?.bestPaceSecPerMile ?? null,
            avgPaceSecPerMile: summary?.avgPaceSecPerMile ?? null,
          };
        });
        return {
          id: g.id,
          name: g.name,
          type: g.type,
          gender: normalizeGender(g.gender),
          dataYear,
          athletes,
          summary: summarizeGroup(g.memberships.map((m) => summaryByAthlete.get(m.athleteId))),
        };
      })
    );
  } catch (error) {
    console.error('Error building group analytics:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/groups/captains?seasonId=
// This season's designated captains (SeasonRoster.isCaptain — T1), for the
// "New Group" dialog's captain picker: pick a captain instead of typing a
// group name from scratch, and (frontend) that captain gets auto-added as
// the new group's first member. Each captain also reports whether they're
// already an active member of a CAPTAIN-type group this season, so the
// picker can skip/flag anyone who already has one instead of inviting a
// duplicate.
router.get('/captains', authenticate, requireTeam, async (req, res) => {
  const { seasonId } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const [captainRosterRows, captainMemberships] = await Promise.all([
      prisma.seasonRoster.findMany({
        where: { seasonId, isCaptain: true },
        include: { athlete: { select: { id: true, name: true, preferredName: true, gender: true, grade: true } } },
      }),
      prisma.groupMembership.findMany({
        where: { endDate: null, group: { seasonId, type: 'CAPTAIN' } },
        select: { athleteId: true, group: { select: { id: true, name: true } } },
      }),
    ]);

    const existingGroupByAthleteId = new Map(captainMemberships.map((m) => [m.athleteId, m.group]));

    const captains = captainRosterRows.map((row) => ({
      athleteId: row.athlete.id,
      name: row.athlete.preferredName || row.athlete.name,
      gender: normalizeGender(row.athlete.gender),
      grade: row.athlete.grade,
      existingGroup: existingGroupByAthleteId.get(row.athlete.id) || null,
    }));

    res.json(captains);
  } catch (error) {
    console.error('Error listing captains:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/groups/:id/trend?dataYear= — meet-by-meet pace trend and
// spread for one group's current roster, the group-scoped analog of the
// team-wide Season Pace Trend/Pack Running dashboard charts. Computed
// live from Result/Race rows for the same reason as GET /analytics above
// (no dependency on the MeetPerformanceMetrics cache those team-wide
// charts use, which needs a calculation step to exist first). `dataYear`
// defaults to the group's own season year; explicit past years work the
// same "no fallback substitution, just that year's real data" way
// GET /analytics's dataYear does.
router.get('/:id/trend', authenticate, requireTeam, async (req, res) => {
  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }
    const season = await prisma.season.findFirst({ where: { id: group.seasonId } });
    const parsedDataYear = parseInt(req.query.dataYear, 10);
    const dataYear = Number.isFinite(parsedDataYear) ? parsedDataYear : season?.year;
    if (!Number.isFinite(dataYear)) {
      return res.status(400).json({ msg: 'No data year could be resolved for this group.' });
    }

    const memberships = await prisma.groupMembership.findMany({
      where: { groupId: group.id, endDate: null },
      select: { athleteId: true },
    });
    const athleteIds = memberships.map((m) => m.athleteId);

    if (athleteIds.length === 0) {
      return res.json({ groupId: group.id, groupName: group.name, dataYear, points: [] });
    }

    const results = await prisma.result.findMany({
      where: { athleteId: { in: athleteIds }, status: 'FINISHED', time: { gt: 0 }, race: { season: dataYear } },
      select: { time: true, race: { select: { id: true, name: true, date: true, distance: true, distanceMeters: true } } },
    });

    const pacesByRace = new Map(); // raceId -> { raceName, date, paces: number[] }
    for (const r of results) {
      const distanceMeters = r.race.distanceMeters ?? parseDistanceToMeters(r.race.distance);
      const paceValue = paceSecPerMile(r.time, distanceMeters);
      if (paceValue == null) continue;
      const entry = pacesByRace.get(r.race.id) || { raceName: r.race.name, date: r.race.date, paces: [] };
      entry.paces.push(paceValue);
      pacesByRace.set(r.race.id, entry);
    }

    const points = [...pacesByRace.entries()]
      .map(([raceId, { raceName, date, paces }]) => {
        const summary = summarizeGroupAtRace(paces);
        return summary && { raceId, raceName, date, ...summary };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ groupId: group.id, groupName: group.name, dataYear, points });
  } catch (error) {
    console.error('Error building group trend:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/groups/:id/members
// Roster-assignment-screen shaped: each athlete's most recent season-best
// time, per the doc ("Show each athlete's most recent season-best time on
// their card").
router.get('/:id/members', authenticate, requireTeam, async (req, res) => {
  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }

    const isCoachTier = await hasTeamRole(req.user, ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH']);
    if (!isCoachTier) {
      const ownMembership = req.user.linkedAthlete
        ? await prisma.groupMembership.findFirst({
            where: { groupId: group.id, athleteId: req.user.linkedAthlete.id, endDate: null },
          })
        : null;
      if (!ownMembership) {
        return res.status(403).json({ msg: 'Access denied.' });
      }
    }

    const memberships = await prisma.groupMembership.findMany({
      where: { groupId: group.id, endDate: null },
      include: { athlete: { select: { id: true, name: true, preferredName: true, gender: true, grade: true, graduationYear: true } } },
    });

    res.json(
      memberships.map((m) => ({
        membershipId: m.id,
        athleteId: m.athleteId,
        name: m.athlete.preferredName || m.athlete.name,
        gender: normalizeGender(m.athlete.gender),
        grade: m.athlete.grade,
        startDate: m.startDate,
      }))
    );
  } catch (error) {
    console.error('Error fetching group members:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/groups/athlete/:athleteId/memberships
// Every group this athlete currently belongs to, in one call — training
// group, captain group, any custom groups, and whether they're in cross
// training right now. Purely a cross-reference of tables that already
// exist; it creates no new concept and writes nothing.
//
// Uses isMembershipActiveOn rather than a plain `endDate: null` filter,
// which matters for X_TRAINING specifically: those memberships are bounded
// (see GroupType's schema comment), so a stint that has expired or hasn't
// started yet still has a row and would otherwise show as current.
//
// Coach-tier sees any athlete on their team; an athlete may only ask about
// themselves, so this can't be used to enumerate teammates' assignments.
router.get('/athlete/:athleteId/memberships', authenticate, requireTeam, async (req, res) => {
  try {
    const isCoachTier = await hasTeamRole(req.user, ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH']);
    if (!isCoachTier && req.params.athleteId !== req.user.linkedAthlete?.id) {
      return res.status(403).json({ msg: 'Access denied.' });
    }

    const athlete = await prisma.athlete.findFirst({ where: { id: req.params.athleteId, teamId: req.user.teamId } });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found.' });
    }

    const today = new Date();
    const memberships = await prisma.groupMembership.findMany({
      where: { athleteId: athlete.id },
      include: {
        group: {
          include: {
            season: { select: { year: true } },
            leaders: { include: { user: { select: { id: true, name: true, email: true } } } },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    const active = memberships.filter((m) => isMembershipActiveOn(m, today));

    res.json({
      athleteId: athlete.id,
      groups: active.map((m) => ({
        membershipId: m.id,
        groupId: m.group.id,
        name: m.group.name,
        type: m.group.type,
        gender: normalizeGender(m.group.gender),
        archived: m.group.archived,
        seasonYear: m.group.season?.year ?? null,
        since: m.startDate,
        // Only ever set for a bounded stint (X_TRAINING today) — null for a
        // normal open-ended membership.
        until: m.endDate,
        reason: m.reason,
        // Who runs this group — the point of "which coach's group is this".
        leaders: m.group.leaders.map((l) => ({ userId: l.userId, name: l.user.name, email: l.user.email, primary: l.primary })),
      })),
    });
  } catch (error) {
    console.error('Error fetching athlete memberships:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/groups/athlete/:athleteId/current
// A concrete consumer of getGroupOn, not just its own test — "today" is
// the overwhelmingly common query, e.g. for showing an athlete their own
// current group.
router.get('/athlete/:athleteId/current', authenticate, requireTeam, async (req, res) => {
  const { date, type = 'TRAINING' } = req.query;
  if (!GROUP_TYPES.has(type)) {
    return res.status(400).json({ msg: `type must be one of: ${[...GROUP_TYPES].join(', ')}` });
  }

  try {
    const isCoachTier = await hasTeamRole(req.user, ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH']);
    if (!isCoachTier && req.params.athleteId !== req.user.linkedAthlete?.id) {
      return res.status(403).json({ msg: 'Access denied.' });
    }

    const athlete = await prisma.athlete.findFirst({ where: { id: req.params.athleteId, teamId: req.user.teamId } });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found.' });
    }

    const membership = await getGroupOn(athlete.id, date ? new Date(date) : new Date(), type);
    if (!membership) {
      return res.json({ group: null });
    }
    res.json({
      group: { id: membership.group.id, name: membership.group.name, type: membership.group.type },
      since: membership.startDate,
    });
  } catch (error) {
    console.error('Error resolving athlete\'s current group:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/groups
router.post('/', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { seasonId, name, type, gender, sortOrder, color } = req.body;

  if (!seasonId || !name || !GROUP_TYPES.has(type)) {
    return res.status(400).json({ msg: `seasonId, name, and type (one of ${[...GROUP_TYPES].join(', ')}) are required.` });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const group = await prisma.group.create({
      data: {
        teamId: req.user.teamId,
        seasonId,
        name,
        type,
        gender: normalizeGender(gender),
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        color: color || null,
      },
    });
    res.status(201).json(group);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ msg: 'A group with that name already exists for this season.' });
    }
    console.error('Error creating group:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/groups/:id
router.put('/:id', authenticate, requireTeam, async (req, res) => {
  const { name, sortOrder, color, archived } = req.body;

  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }
    if (!(await canManageGroup(req, group.id))) {
      return res.status(403).json({ msg: 'You do not lead this group.' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (color !== undefined) updates.color = color;
    if (archived !== undefined) updates.archived = Boolean(archived);

    const updated = await prisma.group.update({ where: { id: group.id }, data: updates });
    res.json(updated);
  } catch (error) {
    console.error('Error updating group:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/groups/:id
router.delete('/:id', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }
    await prisma.group.delete({ where: { id: group.id } });
    res.json({ msg: 'Group deleted.' });
  } catch (error) {
    console.error('Error deleting group:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/groups/:id/leaders
// Staff assignment stays coach-level even though editing the group's own
// content (PUT above) can be delegated to a volunteer who already leads it.
router.post('/:id/leaders', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { userId, primary } = req.body;
  if (!userId) {
    return res.status(400).json({ msg: 'userId is required.' });
  }

  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: req.user.teamId, userId } },
    });
    if (!membership || membership.role === 'ATHLETE') {
      return res.status(400).json({ msg: 'That user is not on the coaching staff for this team.' });
    }

    await prisma.$transaction(async (tx) => {
      // Exactly one primary leader per group, enforced here rather than
      // left to the database (which can't express "exactly one true" as a
      // constraint) — per the doc's own instruction.
      if (primary) {
        await tx.groupLeader.updateMany({ where: { groupId: group.id }, data: { primary: false } });
      }
      await tx.groupLeader.upsert({
        where: { groupId_userId: { groupId: group.id, userId } },
        update: { primary: Boolean(primary) },
        create: { groupId: group.id, userId, primary: Boolean(primary) },
      });
    });

    res.status(201).json({ msg: 'Leader assigned.' });
  } catch (error) {
    console.error('Error assigning group leader:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/groups/:id/leaders/:userId
router.delete('/:id/leaders/:userId', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }
    await prisma.groupLeader.deleteMany({ where: { groupId: group.id, userId: req.params.userId } });
    res.json({ msg: 'Leader removed.' });
  } catch (error) {
    console.error('Error removing group leader:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/groups/:id/members
// Move ONE athlete into this group, effective-dated (see lib/groups.js —
// this never updates an existing membership's groupId, it closes the old
// row and opens a new one). Available to a volunteer coach only for a
// group they lead.
router.post('/:id/members', authenticate, requireTeam, async (req, res) => {
  const { athleteId, effectiveDate, reason } = req.body;
  if (!athleteId) {
    return res.status(400).json({ msg: 'athleteId is required.' });
  }

  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }
    if (!(await canManageGroup(req, group.id))) {
      return res.status(403).json({ msg: 'You do not lead this group.' });
    }
    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId: req.user.teamId } });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found.' });
    }

    const membership = await moveAthleteToGroup({
      athleteId,
      groupId: group.id,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      movedById: req.user.id,
      reason: reason || null,
    });

    res.status(201).json(membership);
  } catch (error) {
    console.error('Error moving athlete to group:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/groups/:id/members/:athleteId
// Takes an athlete OUT of this group with nothing opening in its place —
// the other half of POST /:id/members, which only ever moves someone IN.
// Same authorization shape as moving: a volunteer coach may only do this
// for a group they lead.
router.delete('/:id/members/:athleteId', authenticate, requireTeam, async (req, res) => {
  const { effectiveDate, reason } = req.body;

  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }
    if (!(await canManageGroup(req, group.id))) {
      return res.status(403).json({ msg: 'You do not lead this group.' });
    }
    const athlete = await prisma.athlete.findFirst({ where: { id: req.params.athleteId, teamId: req.user.teamId } });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found.' });
    }

    const removed = await removeAthleteFromGroup({
      athleteId: athlete.id,
      groupId: group.id,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      movedById: req.user.id,
      reason: reason || null,
    });
    if (!removed) {
      return res.status(404).json({ msg: 'That athlete is not currently in this group.' });
    }

    res.json(removed);
  } catch (error) {
    console.error('Error removing athlete from group:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

const X_TRAINING_GROUP_NAME = 'Cross Training';
const X_TRAINING_MAX_DAYS = 30;

// The team's one cross-training roster for a season (GroupType.X_TRAINING —
// see its schema comment) — created the first time anyone is sent there,
// never through the regular "New Group" flow (GROUP_TYPES, above, doesn't
// include it), so there's exactly one, not one a coach could accidentally
// duplicate or rename into something else.
async function getOrCreateXTrainingGroup(teamId, seasonId) {
  const existing = await prisma.group.findFirst({ where: { seasonId, type: 'X_TRAINING' } });
  if (existing) return existing;
  return prisma.group.create({
    data: { teamId, seasonId, name: X_TRAINING_GROUP_NAME, type: 'X_TRAINING', sortOrder: 0 },
  });
}

// GET /api/groups/x-training/:seasonId
// "Whatever coach is taking cross-training that day just clicks the box" —
// any coach-tier role, not just whoever sent someone there, since covering
// X-training is often a different coach than the one who assigned it.
// Returns null group (never created yet — nobody's ever been sent) or the
// group plus everyone active TODAY (getActiveMembersOf, not a plain
// endDate: null list — a bounded stint that hasn't arrived yet or already
// expired must not show up here), each with why they're there and which
// training group they'll return to.
router.get('/x-training/:seasonId', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { id: req.params.seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const group = await prisma.group.findFirst({ where: { seasonId: season.id, type: 'X_TRAINING' } });
    if (!group) {
      return res.json({ group: null, members: [] });
    }

    const today = new Date();
    const active = await getActiveMembersOf(group.id, today);
    const athleteIds = active.map((m) => m.athleteId);
    const [athletes, trainingMemberships] = await Promise.all([
      prisma.athlete.findMany({ where: { id: { in: athleteIds } }, select: { id: true, name: true, preferredName: true } }),
      Promise.all(athleteIds.map((athleteId) => getGroupOn(athleteId, today, 'TRAINING'))),
    ]);
    const athleteById = new Map(athletes.map((a) => [a.id, a]));
    const trainingGroupByAthleteId = new Map(athleteIds.map((id, idx) => [id, trainingMemberships[idx]]));

    const members = active
      .map((m) => {
        const athlete = athleteById.get(m.athleteId);
        if (!athlete) return null;
        const trainingMembership = trainingGroupByAthleteId.get(m.athleteId);
        return {
          athleteId: m.athleteId,
          name: athlete.preferredName || athlete.name,
          reason: m.reason,
          since: m.startDate,
          until: m.endDate,
          trainingGroup: trainingMembership ? { id: trainingMembership.group.id, name: trainingMembership.group.name } : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ group: { id: group.id, name: group.name }, members });
  } catch (error) {
    console.error('Error fetching cross-training roster:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/groups/x-training
// Sends one athlete to cross-training for today, or for the next N days —
// a bounded GroupMembership (see moveAthleteToGroup's endDate param), so
// it expires on its own; no separate "send them back" step needed unless
// a coach wants to end it early (DELETE /:id/members/:athleteId, same as
// any other group — removeAthleteFromGroup already finds a bounded-but-
// not-yet-expired row, not just an open-ended one).
//
// Authorized like moving into any other group a volunteer coach might
// lead — but the group being checked is the athlete's CURRENT TRAINING
// group, not X-Training itself (nobody "leads" cross-training in the
// GroupLeader sense; the coach doing the sending is whoever's actually
// leading that athlete's regular squad today). No training group on
// record at all falls back to head/paid-coach only, since there's no
// leader relationship to check.
router.post('/x-training', authenticate, requireTeam, async (req, res) => {
  const { athleteId, seasonId, days, reason } = req.body;
  if (!athleteId || !seasonId) {
    return res.status(400).json({ msg: 'athleteId and seasonId are required.' });
  }
  const dayCount = Number(days);
  if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > X_TRAINING_MAX_DAYS) {
    return res.status(400).json({ msg: `days must be a whole number from 1 to ${X_TRAINING_MAX_DAYS}.` });
  }
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ msg: 'A reason is required.' });
  }

  try {
    const [season, athlete] = await Promise.all([
      prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } }),
      prisma.athlete.findFirst({ where: { id: athleteId, teamId: req.user.teamId } }),
    ]);
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found.' });
    }

    const today = new Date();
    const trainingMembership = await getGroupOn(athleteId, today, 'TRAINING');
    if (trainingMembership) {
      if (!(await canManageGroup(req, trainingMembership.group.id))) {
        return res.status(403).json({ msg: 'You do not lead this athlete\'s training group.' });
      }
    } else if (!(await hasTeamRole(req.user, ['HEAD_COACH', 'COACH']))) {
      return res.status(403).json({ msg: 'This athlete has no current training group — only a head/paid coach can send them to cross-training.' });
    }

    const group = await getOrCreateXTrainingGroup(req.user.teamId, season.id);
    const endDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + dayCount));

    const membership = await moveAthleteToGroup({
      athleteId,
      groupId: group.id,
      effectiveDate: today,
      endDate,
      movedById: req.user.id,
      reason: String(reason).trim(),
    });

    res.status(201).json({ ...membership, group: { id: group.id, name: group.name } });
  } catch (error) {
    console.error('Error sending athlete to cross-training:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/groups/assign
// The bulk assignment screen's save action: every change in one
// transaction, per the doc ("Save writes all changes in one transaction").
// Head/paid-coach only — a volunteer coach moving athletes one at a time
// into their own group uses POST /:id/members above instead.
router.post('/assign', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { assignments, effectiveDate } = req.body;
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ msg: 'assignments array is required.' });
  }

  try {
    const athleteIds = assignments.map((a) => a.athleteId);
    const groupIds = [...new Set(assignments.map((a) => a.groupId))];

    const [athletes, groups] = await Promise.all([
      prisma.athlete.findMany({ where: { id: { in: athleteIds }, teamId: req.user.teamId }, select: { id: true } }),
      prisma.group.findMany({ where: { id: { in: groupIds }, teamId: req.user.teamId }, select: { id: true, type: true } }),
    ]);
    const validAthleteIds = new Set(athletes.map((a) => a.id));
    const groupById = new Map(groups.map((g) => [g.id, g]));

    const invalid = assignments.filter((a) => !validAthleteIds.has(a.athleteId) || !groupById.has(a.groupId));
    if (invalid.length > 0) {
      return res.status(400).json({ msg: 'One or more athletes/groups do not belong to your team.', invalid });
    }

    const date = effectiveDate ? new Date(effectiveDate) : new Date();
    const results = [];
    await prisma.$transaction(async (tx) => {
      for (const { athleteId, groupId } of assignments) {
        // Inline rather than calling moveAthleteToGroup so every write in
        // this bulk save shares the same transaction (moveAthleteToGroup
        // opens its own — nesting prisma transactions isn't supported).
        const targetType = groupById.get(groupId).type;

        const currentlyActive = await tx.groupMembership.findMany({
          where: { athleteId, endDate: null, group: { type: targetType } },
        });
        for (const membership of currentlyActive) {
          if (membership.groupId === groupId) continue;
          await tx.groupMembership.update({ where: { id: membership.id }, data: { endDate: date } });
        }
        const alreadyHere = currentlyActive.some((m) => m.groupId === groupId);
        if (!alreadyHere) {
          const created = await tx.groupMembership.create({
            data: { groupId, athleteId, startDate: date, movedById: req.user.id },
          });
          results.push(created);
        }
      }
    });

    res.status(201).json({ msg: `Assigned ${results.length} athletes.`, count: results.length });
  } catch (error) {
    console.error('Error bulk-assigning groups:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/groups/copy-from-season
// Pre-populates a new season's groups (and, best-effort, memberships) from
// a previous season — "most athletes stay put," so this is a starting
// point for the bulk screen, not a guarantee. Only carries an athlete
// forward if they're also on the target season's active roster (some may
// have graduated).
router.post('/copy-from-season', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { fromSeasonId, toSeasonId } = req.body;
  if (!fromSeasonId || !toSeasonId) {
    return res.status(400).json({ msg: 'fromSeasonId and toSeasonId are required.' });
  }

  try {
    const [fromSeason, toSeason] = await Promise.all([
      prisma.season.findFirst({ where: { id: fromSeasonId, teamId: req.user.teamId } }),
      prisma.season.findFirst({ where: { id: toSeasonId, teamId: req.user.teamId } }),
    ]);
    if (!fromSeason || !toSeason) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const sourceGroups = await prisma.group.findMany({ where: { seasonId: fromSeasonId, archived: false } });
    const toRoster = await prisma.seasonRoster.findMany({ where: { seasonId: toSeasonId, isActive: true }, select: { athleteId: true } });
    const toRosterAthleteIds = new Set(toRoster.map((r) => r.athleteId));

    let groupsCreated = 0;
    let membershipsCreated = 0;

    await prisma.$transaction(async (tx) => {
      for (const source of sourceGroups) {
        const newGroup = await tx.group.upsert({
          where: { seasonId_name: { seasonId: toSeasonId, name: source.name } },
          update: {},
          create: {
            teamId: req.user.teamId,
            seasonId: toSeasonId,
            name: source.name,
            type: source.type,
            gender: source.gender,
            sortOrder: source.sortOrder,
            color: source.color,
          },
        });
        groupsCreated++;

        const activeMembers = await tx.groupMembership.findMany({
          where: { groupId: source.id, endDate: null },
          select: { athleteId: true },
        });
        for (const { athleteId } of activeMembers) {
          if (!toRosterAthleteIds.has(athleteId)) continue; // graduated / not on the new roster
          const existing = await tx.groupMembership.findFirst({
            where: { athleteId, endDate: null, group: { type: newGroup.type, seasonId: toSeasonId } },
          });
          if (existing) continue;
          await tx.groupMembership.create({
            data: { groupId: newGroup.id, athleteId, startDate: toSeason.startDate || new Date(), movedById: req.user.id, reason: `Copied from ${fromSeason.year}` },
          });
          membershipsCreated++;
        }
      }
    });

    res.status(201).json({ msg: `Copied ${groupsCreated} groups and ${membershipsCreated} memberships.`, groupsCreated, membershipsCreated });
  } catch (error) {
    console.error('Error copying groups from season:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
