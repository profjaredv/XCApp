// Thin wrapper around eusend (https://eusend.dev) — EU-hosted transactional
// email. Leave EUSEND_API_KEY unset to disable sending entirely, same
// "leave unset to disable" pattern as GEMINI_API_KEY and SUPER_ADMIN_EMAILS:
// callers fall back to their own copy-link UI rather than erroring out.
const EUSEND_API_URL = 'https://api.eusend.dev/emails';
const DEFAULT_FROM = 'LeadPack XC <run@leadpack.cc>';

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.EUSEND_API_KEY;
  if (!apiKey) {
    return { sent: false, reason: 'EUSEND_API_KEY not set' };
  }

  const response = await fetch(EUSEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.EUSEND_FROM_EMAIL || DEFAULT_FROM, to, subject, html }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`eusend send failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  return { sent: true, id: data.id };
}

module.exports = { sendEmail };
