-- The Live Timer no longer needs a capture-order/assign-after draft: race
-- entrants (meet_entries, reused rather than a new table — see routes/
-- meetOps.js) make identity known upfront, so a tap now writes a real
-- Result directly, the same way Timer mode already does for interval
-- sessions. Nothing to migrate forward — every finished session's captures
-- were already assigned and saved as real Results before being deleted;
-- anything left here is, by definition, an abandoned draft.
DROP TABLE "timer_sessions";
