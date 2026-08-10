const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireRole } = require('../middleware/auth');

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

// GET /api/feedback — review queue. Coach-only: reports can contain other
// people's email addresses and raw error output.
router.get('/', authenticate, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { status, severity, mine } = req.query;

  try {
    const feedback = await prisma.feedback.findMany({
      where: {
        ...(String(mine) === 'true' ? { teamId: req.user.teamId } : {}),
        ...(STATUSES.includes(status) ? { status } : {}),
        ...(SEVERITIES.includes(severity) ? { severity } : {}),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });

    const counts = await prisma.feedback.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    res.json({
      feedback,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    });
  } catch (error) {
    console.error('Error fetching feedback:', error.message);
    res.status(500).json({ message: 'Could not load feedback.' });
  }
});

// PATCH /api/feedback/:id — triage.
router.patch('/:id', authenticate, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
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

// GET /api/feedback/export — everything as markdown, ready to hand over
// verbatim. This is the format that is actually useful to work from.
router.get('/export', authenticate, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const feedback = await prisma.feedback.findMany({
      where: { status: { in: ['open', 'triaged'] } },
      orderBy: [{ route: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });

    const byRoute = new Map();
    for (const item of feedback) {
      if (!byRoute.has(item.route)) byRoute.set(item.route, []);
      byRoute.get(item.route).push(item);
    }

    const lines = ['# Feedback export', ''];
    for (const [route, items] of byRoute) {
      lines.push(`## ${items[0].screen || route}  \`${route}\``, '');
      for (const item of items) {
        lines.push(`### [${item.severity}] ${item.message.split('\n')[0].slice(0, 80)}`);
        lines.push(`- season: ${item.season ?? 'n/a'}`);
        lines.push(`- reported: ${item.createdAt.toISOString()} by ${item.userEmail || 'unknown'}`);
        lines.push('', item.message, '');
        const errors = item.context?.consoleErrors || [];
        if (errors.length) {
          lines.push('```', ...errors, '```', '');
        }
      }
    }

    res.type('text/markdown').send(lines.join('\n'));
  } catch (error) {
    console.error('Error exporting feedback:', error.message);
    res.status(500).json({ message: 'Could not export feedback.' });
  }
});

module.exports = router;
