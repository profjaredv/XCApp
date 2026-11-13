// Event groups: how a track program is organised and coached. The same
// list the Events screen filters by (web/src/lib/trackEventGroups.ts).
// Mostly the catalog's own categories; pole vault is pulled out of the
// jumps because it has its own coach, pit and practice.
const EVENT_GROUPS = [
  { key: 'SPRINT', label: 'Sprints' },
  { key: 'HURDLES', label: 'Hurdles' },
  { key: 'MIDDLE_DISTANCE', label: 'Mid-distance' },
  { key: 'DISTANCE', label: 'Distance' },
  { key: 'RELAY', label: 'Relays' },
  { key: 'JUMP', label: 'Jumps' },
  { key: 'VAULT', label: 'Vault' },
  { key: 'THROW', label: 'Throws' },
  { key: 'MULTI', label: 'Multis' },
];
const EVENT_GROUP_KEYS = new Set(EVENT_GROUPS.map((g) => g.key));

function eventGroupOf(event) {
  return event.name === 'Pole Vault' ? 'VAULT' : event.category;
}

/**
 * Who belongs in which event group, from the results: an athlete is in a
 * group if they have competed in any of its events this season. Relays are
 * left out: relay results carry no single athlete.
 * @returns Map<eventGroupKey, Set<athleteId>>
 */
function membersByEventGroup(results, events) {
  const groupOfEvent = new Map(events.map((e) => [e.id, eventGroupOf(e)]));
  const out = new Map();
  for (const r of results) {
    if (!r.athleteId) continue;
    const key = groupOfEvent.get(r.eventId);
    if (!key) continue;
    if (!out.has(key)) out.set(key, new Set());
    out.get(key).add(r.athleteId);
  }
  return out;
}

module.exports = { EVENT_GROUPS, EVENT_GROUP_KEYS, eventGroupOf, membersByEventGroup };
