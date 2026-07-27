const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLocation, buildCourseMappingProposal } = require('../lib/courseMapping');

test('normalizeLocation', () => {
  assert.equal(normalizeLocation('Sunfair Park'), 'sunfair park');
  assert.equal(normalizeLocation('  Sunfair   Park  '), 'sunfair park');
  assert.equal(normalizeLocation('SUNFAIR PARK'), 'sunfair park');
  assert.equal(normalizeLocation(null), null);
  assert.equal(normalizeLocation(''), null);
  assert.equal(normalizeLocation('   '), null);
});

test('buildCourseMappingProposal groups races by exact normalized location, not fuzzy similarity', () => {
  const races = [
    { id: 'r1', teamId: 't1', name: 'Season Opener', location: 'Sunfair Park', date: '2023-09-01' },
    { id: 'r2', teamId: 't1', name: 'Sunfair Invite', location: '  sunfair   park  ', date: '2024-09-01' },
    { id: 'r3', teamId: 't1', name: 'District Meet', location: 'Franklin Park', date: '2023-10-01' },
    // Similar but not identical after normalization — must NOT be merged
    // with Sunfair Park. Rule: no auto-merge on string similarity.
    { id: 'r4', teamId: 't1', name: 'Nearby Meet', location: 'Sun Fair Park', date: '2023-09-08' },
  ];

  const { courses, unmapped } = buildCourseMappingProposal({ races, meetGroupMemberships: [] });

  assert.equal(unmapped.length, 0);
  assert.equal(courses.length, 3);

  const sunfair = courses.find((c) => c.normalizedKey === 'sunfair park');
  assert.ok(sunfair);
  assert.deepEqual(sunfair.raceIds.sort(), ['r1', 'r2']);
  assert.equal(sunfair.proposedName, 'Sunfair Park'); // most common raw casing/spacing

  const sunFairSpaced = courses.find((c) => c.normalizedKey === 'sun fair park');
  assert.ok(sunFairSpaced);
  assert.deepEqual(sunFairSpaced.raceIds, ['r4']);

  const franklin = courses.find((c) => c.normalizedKey === 'franklin park');
  assert.ok(franklin);
  assert.deepEqual(franklin.raceIds, ['r3']);
});

test('races with no location are reported unmapped, not guessed at', () => {
  const races = [
    { id: 'r1', teamId: 't1', name: 'Mystery Meet', location: null, date: '2023-09-01' },
    { id: 'r2', teamId: 't1', name: 'Blank Location', location: '   ', date: '2023-09-08' },
  ];

  const { courses, unmapped } = buildCourseMappingProposal({ races, meetGroupMemberships: [] });

  assert.equal(courses.length, 0);
  assert.equal(unmapped.length, 2);
  assert.deepEqual(unmapped.map((r) => r.id).sort(), ['r1', 'r2']);
});

test('a MeetGroup linking races with different location text is flagged as a conflict, not merged', () => {
  const races = [
    { id: 'r1', teamId: 't1', name: 'Invite 2023', location: 'Sunfair Park', date: '2023-09-01' },
    { id: 'r2', teamId: 't1', name: 'Invite 2024', location: 'Sunfair Regional Park', date: '2024-09-01' },
  ];
  const meetGroupMemberships = [
    { meetGroupId: 'mg1', groupName: 'Sunfair Invite (all years)', teamId: 't1', raceId: 'r1' },
    { meetGroupId: 'mg1', groupName: 'Sunfair Invite (all years)', teamId: 't1', raceId: 'r2' },
  ];

  const { courses, meetGroupConflicts } = buildCourseMappingProposal({ races, meetGroupMemberships });

  // The two location strings must stay as two separate proposed courses —
  // the MeetGroup link is a signal to review, not authority to merge.
  assert.equal(courses.length, 2);
  assert.equal(meetGroupConflicts.length, 1);
  assert.equal(meetGroupConflicts[0].meetGroupId, 'mg1');
  assert.equal(meetGroupConflicts[0].groupName, 'Sunfair Invite (all years)');
  assert.equal(meetGroupConflicts[0].locationKeys.length, 2);
});

test('a MeetGroup linking races with the SAME normalized location is not a conflict', () => {
  const races = [
    { id: 'r1', teamId: 't1', name: 'Invite 2023', location: 'Sunfair Park', date: '2023-09-01' },
    { id: 'r2', teamId: 't1', name: 'Invite 2024', location: 'sunfair park', date: '2024-09-01' },
  ];
  const meetGroupMemberships = [
    { meetGroupId: 'mg1', groupName: 'Sunfair Invite (all years)', teamId: 't1', raceId: 'r1' },
    { meetGroupId: 'mg1', groupName: 'Sunfair Invite (all years)', teamId: 't1', raceId: 'r2' },
  ];

  const { courses, meetGroupConflicts } = buildCourseMappingProposal({ races, meetGroupMemberships });

  assert.equal(courses.length, 1);
  assert.equal(meetGroupConflicts.length, 0);
});

test('proposedName picks the most common raw casing/spacing for the group', () => {
  const races = [
    { id: 'r1', teamId: 't1', name: 'M1', location: 'sunfair park', date: '2021-09-01' },
    { id: 'r2', teamId: 't1', name: 'M2', location: 'Sunfair Park', date: '2022-09-01' },
    { id: 'r3', teamId: 't1', name: 'M3', location: 'Sunfair Park', date: '2023-09-01' },
  ];

  const { courses } = buildCourseMappingProposal({ races, meetGroupMemberships: [] });

  assert.equal(courses[0].proposedName, 'Sunfair Park');
  assert.deepEqual(courses[0].rawLocations.sort(), ['Sunfair Park', 'sunfair park']);
});
