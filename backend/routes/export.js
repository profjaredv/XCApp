const express = require('express');
// archiver 8 exports classes, not the classic archiver('zip') factory.
const { ZipArchive } = require('archiver');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole, hasTeamRole } = require('../middleware/auth');
const { FULL_COACH } = require('../lib/teamRoles');
const { TEAM_EXPORT, ATHLETE_EXPORT, EXCLUDED_MODELS, redactDeep } = require('../lib/exportManifest');
const { toCsv } = require('../lib/exportCsv');

// "This data is yours, you can export it at any time."
//
// What is in an export and how each table is scoped lives in
// lib/exportManifest.js, not here — this file only walks that list, so
// there is one auditable answer to "what leaves the building" rather than
// thirty queries to read. test/exportManifest.test.js checks every entry's
// scoping against the real schema and that no live credential can appear.
//
// Format is a ZIP holding both: data.json (complete and faithful, the one
// to keep) and csv/*.csv (one per table, for a spreadsheet), plus a
// README explaining the difference. A coach who wants "my data" and a
// coach who wants "my results in Excel" are asking different things and
// both are reasonable.

const EXPORT_FORMAT_VERSION = 1;

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function safeFilePart(text) {
  return String(text || 'export').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60);
}

/**
 * Run a manifest against the database and hand back plain, redacted rows.
 *
 * Sequential rather than Promise.all on purpose: this is a background-ish
 * bulk read of thirty-odd tables, and firing them all at once would spike
 * a connection pool that every other request on the box shares. An export
 * taking a second longer is nobody's problem; a coach's export stalling
 * everyone else's page loads is.
 */
async function collect(manifest, scopeId) {
  const data = {};
  const counts = {};
  for (const entry of manifest) {
    const rows = await prisma[entry.model].findMany({ where: entry.where(scopeId) });
    data[entry.key] = redactDeep(rows);
    counts[entry.key] = rows.length;
  }
  return { data, counts };
}

function buildManifestSection(manifest, counts) {
  return manifest.map((entry) => ({
    key: entry.key,
    label: entry.label,
    rows: counts[entry.key] ?? 0,
    // Says which numbers a coach could regenerate and which are
    // irreplaceable — the difference that matters if they are ever
    // rebuilding from this file.
    derived: Boolean(entry.derived),
  }));
}

function readme(kind, subject, sections) {
  return [
    `LeadPack XC data export`,
    `========================`,
    ``,
    `Subject:   ${subject}`,
    `Scope:     ${kind}`,
    `Generated: ${new Date().toISOString()}`,
    `Format:    version ${EXPORT_FORMAT_VERSION}`,
    ``,
    `WHAT IS IN HERE`,
    `---------------`,
    `data.json  Everything, in one file, with the exact structure and`,
    `           relationships the app stores. This is the copy to keep.`,
    `csv/       The same data, one file per table, for a spreadsheet.`,
    `           CSV cannot represent nested values, so a few columns hold`,
    `           JSON text. Where the two disagree, data.json is correct.`,
    ``,
    `Rows in this export:`,
    ...sections.map((s) => `  ${String(s.rows).padStart(7)}  ${s.label}${s.derived ? '  (computed by the app)' : ''}`),
    ``,
    `Tables marked "computed by the app" were derived from the rest — season`,
    `metrics, performance summaries. Everything else was entered by your team`,
    `and cannot be regenerated.`,
    ``,
    `WHAT IS DELIBERATELY NOT IN HERE`,
    `--------------------------------`,
    ...Object.entries(EXCLUDED_MODELS).map(([model, why]) => `  ${model}: ${why}`),
    ``,
    `Invite tokens, your team join code and billing identifiers are stripped`,
    `from every export. They are live credentials, and exports get emailed.`,
    ``,
    `IDs are the app's own UUIDs. They are stable, so rows can be matched`,
    `back together by them if you ever import this somewhere else.`,
    ``,
  ].join('\n');
}

/**
 * Fail without lying about what the body is.
 *
 * setHeader does NOT set headersSent, so a catch that only checks that flag
 * will happily send a JSON error body still labelled Content-Type:
 * application/zip — a download the browser saves as a .zip that is not one.
 * Strip the download headers before answering.
 */
function failCleanly(res) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.removeHeader('Content-Type');
  res.removeHeader('Content-Disposition');
  res.status(500).json({ msg: 'Server error' });
}

/**
 * Stream a ZIP of { data.json, csv/*.csv, README.txt }.
 *
 * Streamed rather than buffered so a large team's export does not sit in
 * memory in full. The error handler matters: once headers are sent the
 * response cannot become a 500, so a mid-stream failure destroys the
 * socket instead — a truncated download the browser reports as failed,
 * rather than a corrupt file that looks complete.
 */
function sendZip(res, filename, { data, sections, readmeText }) {
  // Build the archive BEFORE touching the response headers. If
  // constructing it throws, nothing has been set yet and the caller's
  // catch can still send an honest JSON 500 — the first version set the
  // zip headers first and shipped a 22-byte error body labelled
  // Content-Type: application/zip, which is precisely the corrupt-file-
  // that-looks-fine outcome this endpoint must never produce.
  const archive = new ZipArchive({ zlib: { level: 9 } });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  archive.on('error', (err) => {
    console.error('Export archive failed:', err.message);
    res.destroy();
  });
  archive.pipe(res);

  archive.append(readmeText, { name: 'README.txt' });
  archive.append(JSON.stringify(data, null, 2), { name: 'data.json' });
  for (const section of sections) {
    const rows = data.tables[section.key];
    if (!rows || rows.length === 0) continue;
    archive.append(toCsv(rows), { name: `csv/${section.key}.csv` });
  }
  return archive.finalize();
}

// GET /api/export/team
//
// HEAD_COACH only. This is every athlete's name, grade, results, training
// logs and attendance in one downloadable file — the most concentrated
// pile of minors' data the app can produce. A coach or volunteer can read
// any of it a screen at a time; bundling it for download is a different
// act and belongs with the person accountable for the team.
router.get('/team', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.user.teamId } });
    if (!team) return res.status(404).json({ msg: 'Team not found.' });

    const { data, counts } = await collect(TEAM_EXPORT, req.user.teamId);
    const sections = buildManifestSection(TEAM_EXPORT, counts);
    const payload = {
      exportFormatVersion: EXPORT_FORMAT_VERSION,
      generatedAt: new Date().toISOString(),
      scope: 'team',
      team: redactDeep(team),
      manifest: sections,
      tables: data,
    };
    return sendZip(res, `leadpack-${safeFilePart(team.name)}-${stamp()}.zip`, {
      data: payload,
      sections,
      readmeText: readme('Whole team', team.name, sections),
    });
  } catch (error) {
    console.error('Error building team export:', error.message);
    failCleanly(res);
  }
});

// GET /api/export/athlete/:athleteId
//
// The athlete themselves, or a coach on their team. A guardian with an
// approved link counts as the athlete here — that link exists precisely so
// a parent can see their child's data.
router.get('/athlete/:athleteId', authenticate, requireTeam, async (req, res) => {
  try {
    const athlete = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId: req.user.teamId },
    });
    // Scoped by teamId, so an id from another team 404s rather than
    // revealing that it exists.
    if (!athlete) return res.status(404).json({ msg: 'Athlete not found.' });

    const isSelf = req.user.linkedAthlete?.id === athlete.id;
    const isCoach = await hasTeamRole(req.user, ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH']);
    const guardianLink = isSelf
      ? null
      : await prisma.guardianLink.findFirst({
          where: { athleteId: athlete.id, userId: req.user.id, status: 'approved' },
        });
    if (!isSelf && !isCoach && !guardianLink) {
      return res.status(403).json({ msg: 'Access denied.' });
    }

    const { data, counts } = await collect(ATHLETE_EXPORT, athlete.id);
    const sections = buildManifestSection(ATHLETE_EXPORT, counts);
    const payload = {
      exportFormatVersion: EXPORT_FORMAT_VERSION,
      generatedAt: new Date().toISOString(),
      scope: 'athlete',
      athlete: redactDeep(athlete),
      manifest: sections,
      tables: data,
    };
    return sendZip(res, `leadpack-${safeFilePart(athlete.name)}-${stamp()}.zip`, {
      data: payload,
      sections,
      readmeText: readme('One athlete', athlete.name, sections),
    });
  } catch (error) {
    console.error('Error building athlete export:', error.message);
    failCleanly(res);
  }
});

// GET /api/export/manifest
//
// What an export WOULD contain, without building one. Lets the UI say
// exactly what a coach is about to download — and what is deliberately
// left out — before they click, rather than after.
router.get('/manifest', authenticate, requireTeam, async (req, res) => {
  res.json({
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    team: TEAM_EXPORT.map((e) => ({ key: e.key, label: e.label, derived: Boolean(e.derived) })),
    athlete: ATHLETE_EXPORT.map((e) => ({ key: e.key, label: e.label, derived: Boolean(e.derived) })),
    excluded: EXCLUDED_MODELS,
  });
});

module.exports = router;
