const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeStaffRoster } = require('../lib/teamStaff');

test('mergeStaffRoster: owner with no TeamMember row still appears as HEAD_COACH', () => {
  const roster = mergeStaffRoster({ id: 'u1', name: 'Coach Owner', email: 'owner@x.com' }, []);
  assert.deepEqual(roster, [{ userId: 'u1', name: 'Coach Owner', email: 'owner@x.com', role: 'HEAD_COACH' }]);
});

test('mergeStaffRoster: an owner who also has a TeamMember row is not counted twice', () => {
  const roster = mergeStaffRoster(
    { id: 'u1', name: 'Coach Owner', email: 'owner@x.com' },
    [{ userId: 'u1', role: 'HEAD_COACH', name: 'Coach Owner', email: 'owner@x.com' }]
  );
  assert.equal(roster.length, 1);
});

test('mergeStaffRoster: an assistant coach with their own TeamMember row is added alongside the owner', () => {
  const roster = mergeStaffRoster(
    { id: 'u1', name: 'Head Coach', email: 'head@x.com' },
    [{ userId: 'u2', role: 'COACH', name: 'Assistant Coach', email: 'assistant@x.com' }]
  );
  assert.equal(roster.length, 2);
  assert.ok(roster.some((r) => r.userId === 'u2' && r.role === 'COACH'));
});

test('mergeStaffRoster: null owner (edge case) still returns the TeamMember rows', () => {
  const roster = mergeStaffRoster(null, [{ userId: 'u2', role: 'VOLUNTEER_COACH', name: 'Vol', email: 'v@x.com' }]);
  assert.equal(roster.length, 1);
});

test('mergeStaffRoster: empty everything returns an empty list, not an error', () => {
  assert.deepEqual(mergeStaffRoster(null, []), []);
});
