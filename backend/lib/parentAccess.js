const { sendEmail } = require('./email');

// Parent access: the emails and small rules shared by the three ways a parent
// gets linked to a runner (they ask with the join code, they ask without
// one, or a coach invites them by email with the runners already chosen).

const FRONTEND_URL = process.env.FRONTEND_URL
  || (process.env.NODE_ENV === 'production' ? 'https://www.leadpack.cc' : 'http://localhost:5173');

const PARENT_INVITE_TTL_DAYS = 30;
const MAX_ATHLETES_PER_INVITE = 10;

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** "Maya", "Maya and Eli", "Maya, Eli and Zoe". */
function joinNames(names) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** "jared@example.com" -> "j***@example.com", for showing which address an invite went to. */
function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '';
  return `${local.slice(0, 1)}***@${domain}`;
}

const sameEmail = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/** Best effort: approval still stands if the email cannot be sent. */
async function sendGuardianApprovedEmail({ to, athleteNames, teamName }) {
  if (!to) return { sent: false };
  const link = `${FRONTEND_URL}/my-runners`;
  const who = escapeHtml(joinNames(athleteNames));
  try {
    return await sendEmail({
      to,
      subject: `You can now follow ${joinNames(athleteNames)} on LeadPack`,
      html:
        `<p>A coach at <strong>${escapeHtml(teamName)}</strong> approved your request. You can now see ${who}'s meets and results.</p>`
        + `<p><a href="${link}">${link}</a></p>`,
    });
  } catch (error) {
    console.error('Error sending guardian approval email:', error.message);
    return { sent: false };
  }
}

async function sendParentInviteEmail({ to, token, athleteNames, teamName, coachName }) {
  const link = `${FRONTEND_URL}/parent-invite/${token}`;
  try {
    const result = await sendEmail({
      to,
      subject: `Follow ${joinNames(athleteNames)} on ${teamName}'s LeadPack`,
      html:
        `<p>${escapeHtml(coachName || 'Your coach')} invited you to follow <strong>${escapeHtml(joinNames(athleteNames))}</strong> `
        + `on <strong>${escapeHtml(teamName)}</strong>'s LeadPack: meets and results.</p>`
        + `<p><a href="${link}">${link}</a></p>`
        + `<p>Sign up or sign in with this email address (${escapeHtml(to)}) to accept.</p>`,
    });
    return { sent: Boolean(result && result.sent), link };
  } catch (error) {
    console.error('Error sending parent invite email:', error.message);
    return { sent: false, link };
  }
}

module.exports = {
  FRONTEND_URL,
  PARENT_INVITE_TTL_DAYS,
  MAX_ATHLETES_PER_INVITE,
  joinNames,
  maskEmail,
  sameEmail,
  sendGuardianApprovedEmail,
  sendParentInviteEmail,
};
