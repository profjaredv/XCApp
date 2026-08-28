const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { FULL_COACH } = require('../lib/teamRoles');

// Feedback is the product owner's channel, not a per-team feature: anyone
// signed in can FILE a report (POST /), but reading, triaging and exporting
// the queue is super-admin only (lib/superAdmin.js — the SUPER_ADMIN_EMAILS
// allowlist).
//
// This replaced requireRole(FULL_COACH) on the read/triage/export
// routes, which was a real cross-tenant leak rather than a preference: those
// queries were never scoped to the caller's team by default (`mine=true` was
// opt-in), so any coach at any school could read — and PATCH — every other
// school's reports, including the reporter's email address and raw console
// output. The route comment claimed "Coach-only: reports can contain other
// people's email addresses", which is exactly the risk it wasn't preventing.

const SEVERITIES = ['blocker', 'bug', 'polish', 'idea'];
const STATUSES = ['open', 'triaged', 'fixed', 'wontfix'];

// Cap what we persist from auto-captured context. It arrives from the client,
// so it is untrusted and unbounded by default — a page in an error loop could
// otherwise post a megabyte of stack traces.
const MAX_MESSAGE = 5000;
const MAX_CONTEXT_ERRORS = 20;
const MAX_ERROR_LEN = 1000;

function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return null;

  const errors = Array.isArray(context.consoleErrors)
    ? context.consoleErrors
        .slice(-MAX_CONTEXT_ERRORS)
        .map((e) => String(e).slice(0, MAX_ERROR_LEN))
    : [];

  return {
    consoleErrors: errors,
    userAgent: typeof context.userAgent === 'string' ? context.userAgent.slice(0, 500) : null,
    viewport: typeof context.viewport === 'string' ? context.viewport.slice(0, 50) : null,
    appVersion: typeof context.appVersion === 'string' ? context.appVersion.slice(0, 100) : null,
  };
}

// POST /api/feedback — anyone signed in can file a report.
// Coaches will use this in the field, so it must never block on being
// well-formed: a bare sentence is a valid report.
router.post('/', authenticate, async (req, res) => {
  const { route, screen, season, severity, message, context } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({ message: 'Feedback message is required.' });
  }

  try {
    const feedback = await prisma.feedback.create({
      data: {
        teamId: req.user.teamId || null,
        userId: req.user.id,
        userEmail: req.user.email || null,
        userRole: req.user.role || null,
        route: String(route || 'unknown').slice(0, 300),
        screen: screen ? String(screen).slice(0, 200) : null,
        season: Number.isFinite(parseInt(season, 10)) ? parseInt(season, 10) : null,
        severity: SEVERITIES.includes(severity) ? severity : 'bug',
        message: String(message).trim().slice(0, MAX_MESSAGE),
        context: sanitizeContext(context),
      },
    });

    res.status(201).json({ success: true, id: feedback.id });
  } catch (error) {
    console.error('Error saving feedback:', error.message);
    res.status(500).json({ message: 'Could not save feedback.' });
  }
});

// Feedback carries no FK to Team on purpose (see the schema comment: a
// report must outlive the team it is about). So team names are resolved
// separately and a missing one is normal, not an error.
async function withTeamNames(items) {
  const teamIds = [...new Set(items.map((i) => i.teamId).filter(Boolean))];
  if (teamIds.length === 0) return items.map((i) => ({ ...i, teamName: null }));
  const teams = await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } });
  const nameById = new Map(teams.map((t) => [t.id, t.name]));
  return items.map((i) => ({ ...i, teamName: i.teamId ? nameById.get(i.teamId) ?? null : null }));
}

// GET /api/feedback — the review queue, across every team.
router.get('/', authenticate, requireSuperAdmin, async (req, res) => {
  const { status, severity } = req.query;

  try {
    const feedback = await prisma.feedback.findMany({
      where: {
        ...(STATUSES.includes(status) ? { status } : {}),
        ...(SEVERITIES.includes(severity) ? { severity } : {}),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });

    const [statusCounts, severityCounts] = await Promise.all([
      prisma.feedback.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.feedback.groupBy({ by: ['severity'], _count: { _all: true }, where: { status: { in: ['open', 'triaged'] } } }),
    ]);

    res.json({
      feedback: await withTeamNames(feedback),
      counts: Object.fromEntries(statusCounts.map((c) => [c.status, c._count._all])),
      // Severity counts cover only what's still actionable, so "3 blockers"
      // means three open blockers rather than three since the beginning of
      // time.
      severityCounts: Object.fromEntries(severityCounts.map((c) => [c.severity, c._count._all])),
    });
  } catch (error) {
    console.error('Error fetching feedback:', error.message);
    res.status(500).json({ message: 'Could not load feedback.' });
  }
});

// GET /api/feedback/unread-count — just the number, for the nav badge. Its
// own route so the sidebar doesn't pull 500 rows on every page load.
router.get('/unread-count', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const open = await prisma.feedback.count({ where: { status: 'open' } });
    res.json({ open });
  } catch (error) {
    console.error('Error counting feedback:', error.message);
    res.status(500).json({ message: 'Could not count feedback.' });
  }
});

// PATCH /api/feedback/:id — triage.
router.patch('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const { status, notes } = req.body || {};

  try {
    const existing = await prisma.feedback.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: 'Feedback not found.' });
    }

    const updates = {};
    if (STATUSES.includes(status)) updates.status = status;
    if (notes !== undefined) updates.notes = notes ? String(notes).slice(0, MAX_MESSAGE) : null;

    const updated = await prisma.feedback.update({ where: { id: existing.id }, data: updates });
    res.json(updated);
  } catch (error) {
    console.error('Error updating feedback:', error.message);
    res.status(500).json({ message: 'Could not update feedback.' });
  }
});

// GET /api/feedback/export — the queue as markdown, ready to paste
// verbatim into a chat with whoever is doing the work. Grouped by screen
// (how reports arrive and how they're worked through), severity-ordered
// within a screen so blockers lead, and stamped with team + reporter so a
// report can be chased up. ?status=all includes already-resolved items;
// the default is just what's still actionable.
router.get('/export', authenticate, requireSuperAdmin, async (req, res) => {
  const wantAll = String(req.query.status) === 'all';

  try {
    const rows = await prisma.feedback.findMany({
      where: wantAll ? {} : { status: { in: ['open', 'triaged'] } },
      orderBy: [{ createdAt: 'asc' }],
      take: 500,
    });
    const feedback = await withTeamNames(rows);

    const severityRank = (s) => {
      const i = SEVERITIES.indexOf(s);
      return i === -1 ? SEVERITIES.length : i;
    };

    const byScreen = new Map();
    for (const item of feedback) {
      const key = item.screen || item.route;
      if (!byScreen.has(key)) byScreen.set(key, []);
      byScreen.get(key).push(item);
    }

    const total = feedback.length;
    const openCount = feedback.filter((f) => f.status === 'open').length;
    const blockers = feedback.filter((f) => f.severity === 'blocker' && f.status !== 'fixed' && f.status !== 'wontfix').length;

    const lines = [
      '# LeadPack feedback',
      '',
      `_${total} report${total === 1 ? '' : 's'}${wantAll ? '' : ' still open or triaged'} · ${openCount} untouched · ${blockers} blocker${blockers === 1 ? '' : 's'} · exported ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z_`,
      '',
    ];

    for (const [screen, items] of byScreen) {
      items.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.createdAt - b.createdAt);
      lines.push(`## ${screen}`, '');
      for (const item of items) {
        const firstLine = item.message.split('\n')[0].slice(0, 90);
        lines.push(`### [${item.severity}] ${firstLine}`);
        const meta = [
          `route \`${item.route}\``,
          `status **${item.status}**`,
          item.teamName ? `team ${item.teamName}` : null,
          item.season ? `season ${item.season}` : null,
          item.userEmail ? `from ${item.userEmail}` : null,
          item.createdAt.toISOString().slice(0, 10),
        ].filter(Boolean);
        lines.push('', meta.join(' · '), '');
        lines.push(item.message, '');
        if (item.notes) lines.push(`> Triage note: ${item.notes}`, '');
        const errors = item.context?.consoleErrors || [];
        if (errors.length) {
          lines.push('<details><summary>console errors</summary>', '', '```', ...errors, '```', '', '</details>', '');
        }
      }
    }

    if (total === 0) lines.push('_Nothing to report._', '');

    res.type('text/markdown').send(lines.join('\n'));
  } catch (error) {
    console.error('Error exporting feedback:', error.message);
    res.status(500).json({ message: 'Could not export feedback.' });
  }
});

module.exports = router;
