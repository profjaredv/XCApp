const express = require('express');
const router = express.Router();
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const prisma = require('../lib/db');
const r2 = require('../lib/r2');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { requireFeature } = require('../middleware/teamFeatures');
const { resolvePhotosTeam, requirePhotosFeatureEnabled } = require('../middleware/photosTeam');
const { ANY_COACH, DESTRUCTIVE } = require('../lib/teamRoles');
const { resolveActiveSeason, deriveGrade, isEnrolled } = require('../lib/season');
const photosAccess = require('../lib/photosAccess');
const { importGoogleAlbum, validateGooglePhotosUrl } = require('../lib/googlePhotosImport');
const { MAX_PICKS } = photosAccess;

// LeadPack Photos (build spec: docs/leadpack-photos-build-spec.md), Phases
// 3 ("Upload"), 4 ("Tagging"), and 5 ("Picks and collage" — the metadata
// side; the actual PNG/PDF render stays client-side on a <canvas>, see
// web/src/pages/photos/lib/collageRender.ts).
//
// Every handler resolves req.photosTeamId and req.photoActor once (below,
// or in middleware/photosTeam.js) and then calls into lib/photosAccess.js
// for every read/write — this file never touches prisma.photo.* /
// prisma.photoAthlete.* / prisma.pick.* directly, matching that module's
// own contract.
//
// Two different "which team" resolutions are in play, because a parent is
// never a TeamMember (see routes/guardian.js) and so has no req.user.teamId
// at all:
//   - Admin-only routes (authorize/finalize/hide/delete) require a real
//     team membership already — `requireTeam` + `requireRole(ANY_COACH)`.
//   - Routes everyone (coach, athlete, AND guardian) can reach resolve the
//     team from `resolvePhotosTeam` instead (middleware/photosTeam.js),
//     which falls back to an approved GuardianLink's athlete's team when
//     req.user.teamId is null.
//
// Gated behind the 'photos' team feature (lib/teamFeatures.js), same as
// attendance/equipment/etc. The shared requireFeature middleware covers
// the first group fine; the second needs requirePhotosFeatureEnabled
// (also middleware/photosTeam.js), since requireFeature's own
// req.user.teamId check always no-ops for a guardian.

const MAX_FILES_PER_AUTHORIZE = 60;

// Spec: "Rate-limit the authorize endpoint per user." Keyed by the
// authenticated user (not IP) since several coaches on the same school wifi
// must not share one bucket — mounted after `authenticate` so req.user
// exists by the time this runs.
const authorizeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: { msg: 'Too many upload batches in a row. Try again in an hour.' },
});

// A Google Photos album import is a much heavier, slower operation (a
// real headless browser load plus up to MAX_PHOTOS_PER_IMPORT downloads
// and resizes) than a normal upload batch — a low ceiling here is about
// not running several of these at once, not about normal day-to-day use.
const googleImportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: { msg: 'Too many album imports in a row. Try again in an hour.' },
});

async function attachPhotoActor(req, res, next) {
  try {
    const teamId = req.photosTeamId || req.user.teamId;
    req.photosTeamId = teamId;
    req.photoActor = await photosAccess.resolveActor(prisma, req.user, teamId);
    next();
  } catch (error) {
    next(error);
  }
}

function sendAccessError(res, error, fallbackMessage) {
  if (error && error.statusCode) {
    return res.status(error.statusCode).json({ msg: error.message });
  }
  console.error(fallbackMessage, error.message);
  return res.status(500).json({ msg: 'Server error' });
}

// GET /api/photos/me — this account's Photos context: whether it's a
// coach, its own linked athlete (if any), and which athletes it holds an
// approved guardian link for. The frontend builds its Actor from this
// instead of a dev-only role toggle.
router.get('/me', authenticate, resolvePhotosTeam, requirePhotosFeatureEnabled, attachPhotoActor, async (req, res) => {
  res.json({
    userId: req.photoActor.userId,
    isCoach: req.photoActor.isCoach,
    selfAthleteId: req.photoActor.selfAthleteId,
    guardianAthleteIds: req.photoActor.guardianAthleteIds,
  });
});

// GET /api/photos/roster — the team's athletes (id, name, preferredName,
// grade, photosOptOut), open to anyone resolvePhotosTeam lets through
// (coach, athlete, or approved guardian). A guardian is never a TeamMember
// (see routes/guardian.js) and so has no way to reach GET /api/athletes —
// but the spec's initials chips and roster search ("Small initials chips
// on a thumbnail show who else is tagged") need real names for everyone,
// not only coaches, so Photos carries its own minimal roster read.
router.get('/roster', authenticate, resolvePhotosTeam, requirePhotosFeatureEnabled, async (req, res) => {
  try {
    const seasonYear = await resolveActiveSeason(req.photosTeamId);
    const athletes = await prisma.athlete.findMany({ where: { teamId: req.photosTeamId }, orderBy: { name: 'asc' } });

    // "On the roster" for this season — the same determination
    // routes/athletes.js's GET / makes, kept in sync by hand rather than a
    // shared helper (that route's version does more besides — invites,
    // captaincy — that Photos has no use for). An explicit SeasonRoster
    // row wins when the team keeps one; otherwise inferred from having
    // raced this season or still being enrolled by grade. Without this,
    // tagging offered every athlete who ever wore the uniform, graduated
    // seniors included, instead of just this season's team.
    const athleteIds = athletes.map((a) => a.id);
    const [raceCounts, seasonRow] = await Promise.all([
      prisma.result.groupBy({
        by: ['athleteId'],
        where: { teamId: req.photosTeamId, athleteId: { in: athleteIds }, race: { season: seasonYear } },
        _count: { _all: true },
      }),
      prisma.season.findFirst({ where: { teamId: req.photosTeamId, year: seasonYear }, select: { id: true } }),
    ]);
    const raceCountByAthlete = new Map(raceCounts.map((r) => [r.athleteId, r._count._all]));
    const rosterEntries = seasonRow ? await prisma.seasonRoster.findMany({ where: { seasonId: seasonRow.id } }) : [];
    const rosterEntryByAthlete = new Map(rosterEntries.map((entry) => [entry.athleteId, entry]));
    const hasExplicitRoster = rosterEntries.length > 0;

    const onCurrentRoster = athletes.filter((a) => {
      const rosterEntry = rosterEntryByAthlete.get(a.id);
      if (hasExplicitRoster) return Boolean(rosterEntry && rosterEntry.isActive);
      return (raceCountByAthlete.get(a.id) ?? 0) > 0 || isEnrolled(a.graduationYear, seasonYear);
    });

    res.json(
      onCurrentRoster.map((a) => {
        const rosterEntry = rosterEntryByAthlete.get(a.id);
        return {
          id: a.id,
          name: a.name,
          preferredName: a.preferredName,
          grade: rosterEntry?.grade ?? deriveGrade(a.graduationYear, seasonYear),
          photosOptOut: a.photosOptOut,
        };
      }),
    );
  } catch (error) {
    sendAccessError(res, error, 'Error in GET /photos/roster:');
  }
});

// GET /api/photos/meets — the Load/Tag modules' meet picker. Reads the
// same `Meet` rows routes/meetOps.js manages, but open to everyone
// resolvePhotosTeam lets through (coach, athlete, or guardian), not just
// team members.
router.get('/meets', authenticate, resolvePhotosTeam, requirePhotosFeatureEnabled, async (req, res) => {
  try {
    const meets = await prisma.meet.findMany({ where: { teamId: req.photosTeamId }, orderBy: { date: 'asc' } });
    res.json(meets.map((m) => ({ id: m.id, name: m.name, date: m.date })));
  } catch (error) {
    sendAccessError(res, error, 'Error in GET /photos/meets:');
  }
});

// POST /api/photos/meets — Load module's "new meet" button. Admin-only,
// same tier as uploading. Auto-resolves the team's active season rather
// than asking the coach to pick one, matching the spec's "Load, made dead
// easy" principle.
router.post('/meets', authenticate, requireFeature('photos'), requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { name, date } = req.body || {};
  if (!name || !String(name).trim() || !date) {
    return res.status(400).json({ msg: 'name and date are required.' });
  }
  try {
    const season = await photosAccess.resolveActiveSeasonRow(prisma, req.user.teamId);
    const meet = await prisma.meet.create({
      data: { teamId: req.user.teamId, seasonId: season.id, name: String(name).trim(), date: new Date(date) },
    });
    res.status(201).json({ id: meet.id, name: meet.name, date: meet.date });
  } catch (error) {
    sendAccessError(res, error, 'Error in POST /photos/meets:');
  }
});

// POST /api/photos/authorize — Load module, step 2. Body: { meetId, files:
// [{ sha256, width, height, bytes, takenAt }] }. Admin-only (super admin,
// coach, volunteer coach — spec's "coach" definition), so a real team
// membership is required up front.
router.post('/authorize', authenticate, requireFeature('photos'), requireTeam, requireRole(ANY_COACH), authorizeLimiter, attachPhotoActor, async (req, res) => {
  const { meetId, files } = req.body || {};
  if (!meetId || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ msg: 'meetId and a non-empty files array are required.' });
  }
  if (files.length > MAX_FILES_PER_AUTHORIZE) {
    return res.status(400).json({ msg: `Authorize at most ${MAX_FILES_PER_AUTHORIZE} files per batch.` });
  }
  for (const file of files) {
    if (!file || typeof file.sha256 !== 'string' || file.sha256.length !== 64) {
      return res.status(400).json({ msg: 'Each file needs a sha256 hex hash.' });
    }
  }

  try {
    const results = await photosAccess.authorizeUpload(prisma, {
      teamId: req.user.teamId,
      meetId,
      uploadedById: req.user.id,
      files,
    });
    res.json({ results });
  } catch (error) {
    sendAccessError(res, error, 'Error in POST /photos/authorize:');
  }
});

// POST /api/photos/finalize — Load module, step 4. Body: { photoIds: [...] }.
router.post('/finalize', authenticate, requireFeature('photos'), requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { photoIds } = req.body || {};
  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return res.status(400).json({ msg: 'photoIds is required.' });
  }

  try {
    const results = {};
    for (const photoId of photoIds) {
      results[photoId] = await photosAccess.finalizeTeamPhoto(prisma, req.user.teamId, photoId);
    }
    res.json({ results });
  } catch (error) {
    console.error('Error in POST /photos/finalize:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/photos/import/google-album — Load module's "Import from Google
// Photos" option. Body: { meetId, albumUrl }. Admin-only, same tier as a
// regular upload; this one just fetches the bytes itself instead of
// handing a browser presigned PUT urls (see lib/googlePhotosImport.js).
// Synchronous: the whole import runs within this one request, so a large
// album can take a few minutes — there is no background job queue here
// yet, by design scope, not oversight.
router.post('/import/google-album', authenticate, requireFeature('photos'), requireTeam, requireRole(ANY_COACH), googleImportLimiter, async (req, res) => {
  const { meetId, albumUrl } = req.body || {};
  if (!meetId || !albumUrl) {
    return res.status(400).json({ msg: 'meetId and albumUrl are required.' });
  }
  const validatedUrl = validateGooglePhotosUrl(albumUrl);
  if (!validatedUrl) {
    return res.status(400).json({
      msg: 'That does not look like a public Google Photos share link (expected photos.google.com/share/... or photos.app.goo.gl/...).',
    });
  }

  try {
    const summary = await importGoogleAlbum(prisma, {
      teamId: req.user.teamId,
      meetId,
      albumUrl: validatedUrl,
      uploadedById: req.user.id,
    });
    res.json(summary);
  } catch (error) {
    sendAccessError(res, error, 'Error in POST /photos/import/google-album:');
  }
});

// GET /api/photos?meetId=&status=hidden — Tag module's grid. Open to
// everyone on the team's Photos (coach, athlete, or approved guardian);
// `status=hidden` is a coach-only review list, enforced inside
// listTeamPhotos itself since a guardian has no team-role to gate on.
router.get('/', authenticate, resolvePhotosTeam, requirePhotosFeatureEnabled, attachPhotoActor, async (req, res) => {
  const { meetId, status } = req.query;
  try {
    const photos = await photosAccess.listTeamPhotos(prisma, req.photosTeamId, req.photoActor, {
      meetId: meetId || undefined,
      includeHidden: status === 'hidden',
    });

    const withUrls = await Promise.all(
      photos.map(async (p) => {
        const [thumbUrl, webUrl] = await Promise.all([
          r2.presignGetUrl(r2.photoThumbKey(req.photosTeamId, p.id)),
          r2.presignGetUrl(r2.photoWebKey(req.photosTeamId, p.id)),
        ]);
        return {
          id: p.id,
          meetId: p.meetId,
          takenAt: p.takenAt,
          width: p.width,
          height: p.height,
          status: p.status.toLowerCase(),
          thumbUrl,
          webUrl,
          tags: p.tags.map((t) => ({
            athleteId: t.athleteId,
            source: t.source.toLowerCase(),
            taggedBy: t.taggedBy,
          })),
        };
      }),
    );

    res.json(withUrls);
  } catch (error) {
    sendAccessError(res, error, 'Error in GET /photos:');
  }
});

// GET /api/photos/:id/original — a short-lived presigned GET for the full
// original, used by collage export (Build module) and print/download.
router.get('/:id/original', authenticate, resolvePhotosTeam, requirePhotosFeatureEnabled, attachPhotoActor, async (req, res) => {
  try {
    const photo = await photosAccess.getTeamPhoto(prisma, req.photosTeamId, req.params.id);
    if (!photo || photo.status === 'HIDDEN') {
      return res.status(404).json({ msg: 'Photo not found.' });
    }
    const originalUrl = await r2.presignGetUrl(r2.photoOriginalKey(req.photosTeamId, photo.id));
    res.json({ originalUrl });
  } catch (error) {
    sendAccessError(res, error, 'Error in GET /photos/:id/original:');
  }
});

// POST /api/photos/:id/tags — Tag module. Body: { athleteId }.
router.post('/:id/tags', authenticate, resolvePhotosTeam, requirePhotosFeatureEnabled, attachPhotoActor, async (req, res) => {
  const { athleteId } = req.body || {};
  if (!athleteId) return res.status(400).json({ msg: 'athleteId is required.' });
  try {
    const tag = await photosAccess.tagPhoto(prisma, req.photosTeamId, req.params.id, athleteId, req.photoActor);
    res.status(201).json({ athleteId: tag.athleteId, source: tag.source.toLowerCase(), taggedBy: tag.taggedBy });
  } catch (error) {
    sendAccessError(res, error, 'Error in POST /photos/:id/tags:');
  }
});

// DELETE /api/photos/:id/tags/:athleteId
router.delete('/:id/tags/:athleteId', authenticate, resolvePhotosTeam, requirePhotosFeatureEnabled, attachPhotoActor, async (req, res) => {
  try {
    const result = await photosAccess.untagPhoto(prisma, req.photosTeamId, req.params.id, req.params.athleteId, req.photoActor);
    res.json(result);
  } catch (error) {
    sendAccessError(res, error, 'Error in DELETE /photos/:id/tags/:athleteId:');
  }
});

// GET /api/photos/picks — Build module's left panel (every athlete's picks
// for the active season, in position order).
router.get('/picks', authenticate, resolvePhotosTeam, requirePhotosFeatureEnabled, async (req, res) => {
  try {
    const season = await photosAccess.resolveActiveSeasonRow(prisma, req.photosTeamId);
    const byAthlete = await photosAccess.listPicksForTeam(prisma, req.photosTeamId, season.id);
    const out = {};
    for (const [athleteId, picks] of byAthlete) {
      out[athleteId] = picks.map((p) => p.photoId);
    }
    res.json(out);
  } catch (error) {
    sendAccessError(res, error, 'Error in GET /photos/picks:');
  }
});

// PUT /api/photos/picks/:athleteId — Build module. Replaces this athlete's
// whole pick list for the active season. Body: { photoIds: [...] } in
// position order (index 0 = position 1).
router.put('/picks/:athleteId', authenticate, resolvePhotosTeam, requirePhotosFeatureEnabled, attachPhotoActor, async (req, res) => {
  const { photoIds } = req.body || {};
  if (!Array.isArray(photoIds)) return res.status(400).json({ msg: 'photoIds array is required.' });
  if (photoIds.length > MAX_PICKS) return res.status(400).json({ msg: `At most ${MAX_PICKS} picks.` });
  try {
    const picks = await photosAccess.setPicks(prisma, req.photosTeamId, req.params.athleteId, photoIds, req.photoActor);
    res.json(picks.map((p) => p.photoId));
  } catch (error) {
    sendAccessError(res, error, 'Error in PUT /photos/picks/:athleteId:');
  }
});

// POST /api/photos/:id/hide and /unhide — coach only, reversible (spec:
// "Opt-out hides photos rather than deleting them, so a coach can reverse
// it" — the same reversibility applies to a coach's own manual hide).
router.post('/:id/hide', authenticate, requireFeature('photos'), requireTeam, requireRole(ANY_COACH), attachPhotoActor, async (req, res) => {
  try {
    const photo = await photosAccess.setPhotoHidden(prisma, req.photosTeamId, req.params.id, true, req.photoActor);
    res.json({ id: photo.id, status: photo.status.toLowerCase() });
  } catch (error) {
    sendAccessError(res, error, 'Error in POST /photos/:id/hide:');
  }
});

router.post('/:id/unhide', authenticate, requireFeature('photos'), requireTeam, requireRole(ANY_COACH), attachPhotoActor, async (req, res) => {
  try {
    const photo = await photosAccess.setPhotoHidden(prisma, req.photosTeamId, req.params.id, false, req.photoActor);
    res.json({ id: photo.id, status: photo.status.toLowerCase() });
  } catch (error) {
    sendAccessError(res, error, 'Error in POST /photos/:id/unhide:');
  }
});

// DELETE /api/photos/:id — head-coach-only permanent delete (removes the
// row and all three R2 objects), same destructive-action tier as deleting
// results or clearing a season elsewhere in this app.
router.delete('/:id', authenticate, requireFeature('photos'), requireTeam, requireRole(DESTRUCTIVE), attachPhotoActor, async (req, res) => {
  try {
    await photosAccess.deleteTeamPhoto(prisma, req.photosTeamId, req.params.id, req.photoActor);
    res.status(204).send();
  } catch (error) {
    sendAccessError(res, error, 'Error in DELETE /photos/:id:');
  }
});

// POST /api/photos/athletes/:athleteId/opt-out — Body: { optOut: boolean }.
// A coach, the athlete themself, or their guardian may toggle this (spec:
// "A parent or coach can set photos_opt_out for an athlete").
router.post('/athletes/:athleteId/opt-out', authenticate, resolvePhotosTeam, requirePhotosFeatureEnabled, attachPhotoActor, async (req, res) => {
  const { optOut } = req.body || {};
  try {
    const athlete = await photosAccess.setAthleteOptOut(
      prisma,
      req.photosTeamId,
      req.params.athleteId,
      optOut,
      req.photoActor,
    );
    res.json({ id: athlete.id, photosOptOut: athlete.photosOptOut });
  } catch (error) {
    sendAccessError(res, error, 'Error in POST /photos/athletes/:athleteId/opt-out:');
  }
});

module.exports = router;
