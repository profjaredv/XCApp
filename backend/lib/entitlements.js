// F4 (LeadPack Master Build Handoff): the single place a team's checkout
// status is enforced. Applied only to the actions that expose the app to
// athletes — join code generation, athlete invites, staff invites,
// guardian-link approval. Deliberately NOT applied to results import,
// roster viewing, or a claimed-but-not-yet-checked-out coach's own
// exploration of the app — that's the actual harm this workstream exists
// to prevent, not billing friction for its own sake.
function requireActivePlan(req, res, next) {
  if (req.user?.team?.plan !== 'active') {
    return res.status(402).json({ message: 'Checkout has not been completed for this team.' });
  }
  next();
}

module.exports = { requireActivePlan };
