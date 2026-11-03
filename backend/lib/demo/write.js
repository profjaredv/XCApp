// Turns a demo plan (see generate.js) into database rows. Everything it
// creates hangs off ONE team (the demo team) or one of that team's invented
// staff/athlete users; nothing here touches any other team's rows. Courses
// are shared across teams by design, so they are found-or-created, and are
// never deleted when the demo team is.

const crypto = require('node:crypto');
const C = require('./catalog');

const uuid = () => crypto.randomUUID();
const day = (s) => new Date(`${s}T00:00:00.000Z`);
const at = (s) => new Date(s);
const CHUNK = 1500;

async function insert(delegate, rows, label, progress) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await delegate.createMany({ data: rows.slice(i, i + CHUNK) });
  }
  if (progress) progress(label, rows.length);
}

/**
 * Writes the whole plan. `progress(step, rows)` is called as each table lands.
 * Returns { teamId, counts }.
 */
async function writeDemoPlan(prisma, plan, { progress, adminUserId } = {}) {
  const counts = {};
  const note = (label, n) => {
    counts[label] = (counts[label] || 0) + n;
    if (progress) progress(label, n);
  };

  // ---- users and team -----------------------------------------------------
  const staffId = new Map(plan.staff.map((s) => [s.key, uuid()]));
  const teamId = uuid();
  const athleteId = new Map(plan.athletes.map((a) => [a.key, uuid()]));
  const accountUser = new Map(plan.athletes.filter((a) => a.hasAccount).map((a) => [a.key, uuid()]));

  await prisma.team.create({
    data: {
      id: teamId,
      name: plan.team.name,
      athleticTeamId: plan.team.athleticTeamId,
      joinCode: plan.team.joinCode,
      plan: 'active',
      checkoutCompletedAt: new Date(),
      currentSeason: plan.team.currentSeason,
      importedSeasons: plan.seasons.map((s) => s.year),
      colors: plan.team.colors,
    },
  });
  await insert(
    prisma.user,
    [
      ...plan.staff.map((s) => ({ id: staffId.get(s.key), email: s.email, name: s.name, role: 'coach', teamId, uiVersion: 'next' })),
      ...plan.athletes.filter((a) => a.hasAccount).map((a) => ({ id: accountUser.get(a.key), email: `${a.key}@${C.DEMO_EMAIL_DOMAIN}`, name: a.name, role: 'athlete', teamId, uiVersion: 'next' })),
    ],
    'users',
    note
  );
  await prisma.team.update({ where: { id: teamId }, data: { coachUid: staffId.get('ron') } });
  await insert(prisma.teamMember, plan.staff.map((s) => ({ teamId, userId: staffId.get(s.key), role: s.role, active: true })), 'staff', note);
  // The super admin who built the demo gets a head-coach seat on it, so every
  // coach view works while they are looking at this team (some routes check
  // team membership directly rather than the impersonation flag). The seat is
  // removed with the team.
  if (adminUserId) await prisma.teamMember.create({ data: { teamId, userId: adminUserId, role: 'HEAD_COACH', active: true } });

  // ---- courses (shared across teams: find or create) -----------------------
  const courseId = new Map();
  for (const c of plan.courses) {
    const existing = await prisma.course.findFirst({ where: { name: c.name, city: c.city, state: c.state } });
    const row = existing || (await prisma.course.create({ data: { name: c.name, city: c.city, state: c.state, notes: c.notes } }));
    courseId.set(c.key, row.id);
  }

  // ---- athletes ---------------------------------------------------------------
  const lastGrade = new Map();
  for (const s of plan.seasons) for (const r of s.roster) lastGrade.set(r.athleteKey, { grade: r.grade, year: s.year });
  await insert(
    prisma.athlete,
    plan.athletes.map((a) => ({
      id: athleteId.get(a.key), teamId, name: a.name, gender: a.gender, grade: lastGrade.get(a.key)?.grade ?? null,
      graduationYear: a.graduationYear, userId: accountUser.get(a.key) ?? null,
    })),
    'athletes',
    note
  );

  // ---- reference data -----------------------------------------------------------
  const locationId = new Map(plan.locations.map((n) => [n, uuid()]));
  await insert(prisma.practiceLocation, plan.locations.map((name) => ({ id: locationId.get(name), teamId, name })), 'locations', note);
  const workoutId = new Map(plan.workouts.map((w) => [w.name, uuid()]));
  await insert(
    prisma.workoutTemplate,
    plan.workouts.map((w) => ({ id: workoutId.get(w.name), teamId, name: w.name, volumeTier: w.volumeTier, focus: w.focus, durationMinutes: w.durationMinutes, distanceMi: w.distanceMi ?? null, strength: !!w.strength, details: w.details, createdById: staffId.get('ron') })),
    'workouts',
    note
  );
  await insert(prisma.paceZone, plan.paceZones.map((z) => ({ teamId, ...z })), 'pace zones', note);

  // ---- seasons -------------------------------------------------------------------
  const seasonId = new Map();
  const raceId = new Map(); // race key -> id
  const resultId = new Map(); // `${raceKey}|${athleteKey}` -> id
  const groupId = new Map(); // `${year}:${groupKey}` -> id
  const intervalId = new Map();
  const entryId = new Map(); // `${intervalKey}|${athleteKey}` -> id

  for (const s of plan.seasons) {
    seasonId.set(s.year, uuid());
  }
  await insert(
    prisma.season,
    plan.seasons.map((s) => ({ id: seasonId.get(s.year), teamId, year: s.year, sport: 'XC', startDate: day(s.startDate), endDate: day(s.endDate), isActive: s.isActive })),
    'seasons',
    note
  );

  for (const s of plan.seasons) {
    const sid = seasonId.get(s.year);

    await insert(
      prisma.seasonRoster,
      s.roster.map((r) => ({ seasonId: sid, athleteId: athleteId.get(r.athleteKey), grade: r.grade, isActive: r.isActive, isCaptain: r.isCaptain, captainNotes: r.captainNotes })),
      'roster entries',
      note
    );

    // groups, leaders, memberships
    for (const g of s.groups) groupId.set(`${s.year}:${g.key}`, uuid());
    await insert(
      prisma.group,
      s.groups.map((g) => ({ id: groupId.get(`${s.year}:${g.key}`), teamId, seasonId: sid, name: g.name, gender: g.gender, type: g.type, color: g.color, sortOrder: g.sortOrder })),
      'groups',
      note
    );
    await insert(
      prisma.groupLeader,
      s.groups.flatMap((g) => g.leaders.map((l) => ({ groupId: groupId.get(`${s.year}:${g.key}`), userId: staffId.get(l.staffKey), primary: l.primary }))),
      'group leaders',
      note
    );
    await insert(
      prisma.groupMembership,
      s.memberships.map((m) => ({ groupId: groupId.get(`${s.year}:${m.groupKey}`), athleteId: athleteId.get(m.athleteKey), startDate: day(m.startDate), endDate: m.endDate ? day(m.endDate) : null, reason: m.reason })),
      'group memberships',
      note
    );

    // meets, races, results, splits, field results, entries, plans
    const meetRows = [];
    const planRows = [];
    const raceRows = [];
    const resultRows = [];
    const splitRows = [];
    const fieldRows = [];
    const entryRows = [];
    for (const m of s.meets) {
      const mid = uuid();
      meetRows.push({ id: mid, teamId, seasonId: sid, name: m.name, date: day(m.date), location: m.location, isHome: m.isHome, distance: m.distance, distanceMeters: m.distanceMeters });
      if (m.plan) {
        const base = Date.parse(`${m.date}T00:00:00.000Z`);
        planRows.push({
          meetId: mid, departureLoc: m.plan.departureLoc,
          departureTime: m.plan.departureMinutes != null ? new Date(base + m.plan.departureMinutes * 60000) : null,
          returnTime: m.plan.returnMinutes != null ? new Date(base + m.plan.returnMinutes * 60000) : null,
          transportNotes: m.plan.transportNotes, uniformNotes: m.plan.uniformNotes, bringList: m.plan.bringList, published: m.plan.published,
        });
      }
      for (const r of m.races) {
        const rid = uuid();
        raceId.set(r.key, rid);
        raceRows.push({
          id: rid, teamId, name: r.name, date: day(r.date), season: s.year, distance: r.distance, distanceMeters: r.distanceMeters, location: r.location,
          meetId: mid, courseId: courseId.get(r.courseKey), fieldMeanSec: r.fieldMeanSec ?? null, fieldMedianSec: r.fieldMedianSec ?? null,
          fieldFinisherCount: r.fieldFinisherCount ?? null, splitMarkerScheme: r.splitMarkerScheme, splitMarkersMeters: [], postseasonLevel: r.postseasonLevel,
        });
        for (const res of r.results) {
          const id = uuid();
          resultId.set(`${r.key}|${res.athleteKey}`, id);
          resultRows.push({
            id, raceId: rid, athleteId: athleteId.get(res.athleteKey), teamId, time: res.time ?? null, division: res.division ?? null, place: res.place ?? null,
            overallPlace: res.overallPlace ?? null, overallFieldSize: res.overallFieldSize ?? null, grade: res.grade ?? null, status: res.status,
          });
          for (const sp of res.splits || []) splitRows.push({ resultId: id, sequence: sp.sequence, markerMeters: sp.markerMeters, elapsedSec: sp.elapsedSec, teamId, createdById: staffId.get('ron') });
        }
        for (const f of r.field) {
          fieldRows.push({ raceId: rid, athleteName: f.athleteName ?? null, schoolName: f.schoolName, gender: f.gender, division: f.division, grade: f.grade ?? null, timeSec: f.timeSec ?? null, place: f.place ?? null, status: f.status });
        }
        for (const e of r.entries) {
          entryRows.push({ raceId: rid, athleteId: athleteId.get(e.athleteKey), status: e.status, seedTimeSec: e.seedTimeSec ?? null, notes: e.notes ?? null, updatedById: staffId.get('ron') });
        }
      }
    }
    await insert(prisma.meet, meetRows, 'meets', note);
    await insert(prisma.meetPlan, planRows, 'meet plans', note);
    await insert(prisma.race, raceRows, 'races', note);
    await insert(prisma.result, resultRows, 'results', note);
    await insert(prisma.split, splitRows, 'splits', note);
    await insert(prisma.fieldResult, fieldRows, 'field results', note);
    await insert(prisma.meetEntry, entryRows, 'meet entries', note);

    // interval sessions (before plans, which point at them)
    const sessionRows = [];
    const entryRowsIv = [];
    for (const iv of s.intervalSessions) {
      const id = uuid();
      intervalId.set(iv.key, id);
      sessionRows.push({ id, teamId, seasonId: sid, groupId: groupId.get(`${s.year}:${iv.groupKey}`), date: day(iv.date), title: iv.title, repDistanceM: iv.repDistanceM, zone: iv.zone, zoneLabel: iv.zoneLabel, createdById: staffId.get('ron') });
      for (const e of iv.entries) {
        const eid = uuid();
        entryId.set(`${iv.key}|${e.athleteKey}`, eid);
        const row = { id: eid, intervalSessionId: id, athleteId: athleteId.get(e.athleteKey), notes: e.notes };
        e.reps.slice(0, 6).forEach((v, i) => { row[`rep${i + 1}`] = v; });
        entryRowsIv.push(row);
      }
    }
    await insert(prisma.intervalSession, sessionRows, 'interval sessions', note);
    await insert(prisma.intervalSessionEntry, entryRowsIv, 'interval entries', note);

    await insert(
      prisma.practicePlan,
      s.practicePlans.map((p) => ({
        teamId, seasonId: sid, date: day(p.date), locationId: locationId.get(p.locationName), startTime: p.startTime, announcements: p.announcements, preRun: p.preRun, run: p.run, postRun: p.postRun,
        workoutTemplateId: p.workoutName ? workoutId.get(p.workoutName) ?? null : null, intervalSessionId: p.intervalSessionKey ? intervalId.get(p.intervalSessionKey) ?? null : null,
        published: p.published, createdById: staffId.get('ron'),
      })),
      'practice plans',
      note
    );

    // attendance
    const sessionIds = [];
    const sessions = s.attendance.map((a) => {
      const id = uuid();
      sessionIds.push(id);
      return { id, teamId, seasonId: sid, date: day(a.date), time: a.time, locationId: locationId.get(a.locationName), createdById: staffId.get('patty') };
    });
    await insert(prisma.attendanceSession, sessions, 'attendance sessions', note);
    await insert(
      prisma.attendanceRecord,
      s.attendance.flatMap((a, i) => a.records.map((r) => ({ attendanceSessionId: sessionIds[i], athleteId: athleteId.get(r.athleteKey), status: r.status, notes: r.notes }))),
      'attendance records',
      note
    );

    // training logs. Athletes who synced from Strava get an import record, like a real upload.
    const batchOf = new Map();
    const batchRows = [];
    for (const l of s.trainingLogs) {
      if (l.source !== 'strava') continue;
      if (!batchOf.has(l.athleteKey)) {
        const id = uuid();
        batchOf.set(l.athleteKey, id);
        batchRows.push({ id, athleteId: athleteId.get(l.athleteKey), source: 'strava', fileName: `strava-activities-${s.year}.csv`, rowsParsed: 0, rowsCreated: 0, rowsSkipped: 0 });
      }
      const b = batchRows.find((r) => r.id === batchOf.get(l.athleteKey));
      b.rowsParsed += 1;
      b.rowsCreated += 1;
    }
    await insert(prisma.trainingLogImportBatch, batchRows, 'import batches', note);
    await insert(
      prisma.trainingLog,
      s.trainingLogs.map((l) => ({
        importBatchId: l.source === 'strava' ? batchOf.get(l.athleteKey) : null,
        athleteId: athleteId.get(l.athleteKey), date: day(l.date), type: l.type, distanceMi: l.distanceMi ?? null, durationSec: l.durationSec ?? null, notes: l.notes ?? null,
        sharedWithCoach: !!l.sharedWithCoach, sharedWithTeam: !!l.sharedWithTeam, createdById: staffId.get('ron'),
        sourceIntervalSessionEntryId: l.fromInterval ? entryId.get(`${l.fromInterval}|${l.athleteKey}`) ?? null : null,
        repSplits: l.repSplits ?? undefined, source: l.source || 'manual', externalId: l.externalId ?? null, startedAt: l.startedAt ? at(l.startedAt) : null,
        avgHrBpm: l.avgHrBpm ?? null, elevationFt: l.elevationFt ?? null,
      })),
      'training logs',
      note
    );

    // reflections
    await insert(
      prisma.raceReflection,
      s.reflections.filter((r) => raceId.get(r.raceKey)).map((r) => ({
        athleteId: athleteId.get(r.athleteKey), raceId: raceId.get(r.raceKey), processGoal: r.processGoal, outcomeGoal: r.outcomeGoal, targetTimeSec: r.targetTimeSec, keyFocus: r.keyFocus,
        preSubmittedAt: new Date(), feelingRating: r.feelingRating, effortRating: r.effortRating, whatWorked: r.whatWorked, whatDidnt: r.whatDidnt, postNotes: r.postNotes,
        postSubmittedAt: new Date(), sharedWithCoach: r.sharedWithCoach,
      })),
      'reflections',
      note
    );
  }

  // ---- meet series (history across seasons) -----------------------------------------
  for (const [name, raceKeys] of Object.entries(plan.meetSeries)) {
    const mg = await prisma.meetGroup.create({ data: { teamId, groupName: name, description: `Every year's ${name}` } });
    await insert(prisma.meetGroupRace, raceKeys.filter((k) => raceId.get(k)).map((k) => ({ meetGroupId: mg.id, raceId: raceId.get(k) })), 'meet series races', note);
  }

  // ---- equipment ------------------------------------------------------------------------
  const equipId = new Map(plan.equipment.items.map((e) => [e.key, uuid()]));
  await insert(
    prisma.equipment,
    plan.equipment.items.map((e) => ({ id: equipId.get(e.key), teamId, type: e.type, identifier: e.identifier, size: e.size, condition: e.condition, retired: e.retired, notes: e.notes })),
    'equipment',
    note
  );
  await insert(
    prisma.equipmentAssignment,
    plan.equipment.assignments.map((a) => ({
      equipmentId: equipId.get(a.equipmentKey), athleteId: athleteId.get(a.athleteKey), seasonId: seasonId.get(a.seasonYear), checkedOutAt: at(a.checkedOutAt), checkedOutById: staffId.get('ron'),
      dueDate: a.dueDate ? day(a.dueDate) : null, returnedAt: a.returnedAt ? at(a.returnedAt) : null, returnedById: a.returnedAt ? staffId.get('ron') : null,
      conditionOut: a.conditionOut, conditionIn: a.conditionIn, notes: a.notes,
    })),
    'equipment assignments',
    note
  );

  // ---- people waiting on a coach (Settings > Athlete access, Staff) ---------------------
  const pend = plan.pending;
  const pendingUsers = [...pend.claims, ...pend.guardians, ...pend.parentRequests].map((p) => ({ id: uuid(), email: p.email, name: p.name, role: p.role || 'athlete', teamId: null, uiVersion: 'next', ref: p }));
  await insert(prisma.user, pendingUsers.map(({ ref, ...u }) => u), 'users', note);
  const uidOf = new Map(pendingUsers.map((u) => [u.ref, u.id]));
  await insert(prisma.athleteClaim, pend.claims.map((c) => ({ athleteId: athleteId.get(c.athleteKey), userId: uidOf.get(c), teamId, status: 'pending', matchScore: c.matchScore })), 'claims', note);
  await insert(prisma.guardianLink, pend.guardians.map((g) => ({ athleteId: athleteId.get(g.athleteKey), userId: uidOf.get(g), status: 'pending' })), 'guardian links', note);
  await insert(prisma.teamRequest, pend.parentRequests.map((p) => ({ userId: uidOf.get(p), email: p.email, name: p.name, message: p.message, status: 'pending', role: 'parent', wantsTeamId: teamId })), 'parent requests', note);
  const weeks = (n) => new Date(Date.now() + n * 7 * 86400000);
  await insert(prisma.athleteInvite, pend.athleteInvites.map((i) => ({ athleteId: athleteId.get(i.athleteKey), teamId, email: i.email, expiresAt: weeks(3) })), 'athlete invites', note);
  await insert(prisma.staffInvite, pend.staffInvites.map((i) => ({ teamId, email: i.email, role: i.role, invitedById: staffId.get('ron'), expiresAt: weeks(2) })), 'staff invites', note);

  // ---- coaching notes ---------------------------------------------------------------------
  const cur = plan.seasons[plan.seasons.length - 1];
  const raceCount = cur.meets.flatMap((m) => m.races).filter((r) => r.results.length).length;
  await prisma.aiInsightSnapshot.create({
    data: {
      teamId, season: plan.aiSnapshot.season, raceCount: plan.aiSnapshot.raceCount, resultCount: plan.aiSnapshot.resultCount,
      data: { ...plan.aiSnapshot.data, usingSeason: plan.aiSnapshot.season, isPreseasonFallback: false, anonymization: { poweredBy: 'Kippwit', url: 'https://kippwit.com' }, _insightsVersion: 3 },
    },
  });
  void raceCount;

  return { teamId, counts };
}

module.exports = { writeDemoPlan, uuid };
