const test = require('node:test');
const assert = require('node:assert/strict');
const { eventGroupOf, membersByEventGroup, EVENT_GROUPS } = require('../lib/trackEventGroups');
const { isExclusiveType } = require('../lib/groups');

const EVENTS = [
  { id: 'e100', name: '100 Meters', category: 'SPRINT' },
  { id: 'elj', name: 'Long Jump', category: 'JUMP' },
  { id: 'epv', name: 'Pole Vault', category: 'JUMP' },
  { id: 'e4x1', name: '4x100 Relay', category: 'RELAY' },
];

test('pole vault is its own group; other jumps stay together', () => {
  assert.equal(eventGroupOf(EVENTS[2]), 'VAULT');
  assert.equal(eventGroupOf(EVENTS[1]), 'JUMP');
  assert.ok(EVENT_GROUPS.some((g) => g.key === 'VAULT' && g.label === 'Vault'));
});

test('an athlete lands in every event group they competed in, once', () => {
  const out = membersByEventGroup(
    [
      { athleteId: 'a', eventId: 'e100' },
      { athleteId: 'a', eventId: 'e100' },
      { athleteId: 'a', eventId: 'elj' },
      { athleteId: 'b', eventId: 'epv' },
      { athleteId: null, eventId: 'e4x1' },
      { athleteId: 'b', eventId: 'unknown' },
    ],
    EVENTS
  );
  assert.deepEqual([...out.get('SPRINT')], ['a']);
  assert.deepEqual([...out.get('JUMP')], ['a']);
  assert.deepEqual([...out.get('VAULT')], ['b']);
  assert.equal(out.has('RELAY'), false);
});

test('only training, captain and cross-training groups are one-at-a-time', () => {
  assert.equal(isExclusiveType('TRAINING'), true);
  assert.equal(isExclusiveType('CAPTAIN'), true);
  assert.equal(isExclusiveType('X_TRAINING'), true);
  assert.equal(isExclusiveType('CUSTOM'), false);
  assert.equal(isExclusiveType('EVENT'), false);
});
