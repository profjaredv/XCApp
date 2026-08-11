const test = require('node:test');
const assert = require('node:assert/strict');
const { stripLevelGenderSuffix, buildMeetMappingProposal } = require('../lib/meetMapping');

test('stripLevelGenderSuffix', () => {
  assert.equal(stripLevelGenderSuffix('Sunfair Invite - Boys Varsity'), 'Sunfair Invite');
  assert.equal(stripLevelGenderSuffix('Sunfair Invite - Girls JV'), 'Sunfair Invite');
  assert.equal(stripLevelGenderSuffix('Sunfair Invite — Boy Frosh'), 'Sunfair Invite');
  assert.equal(stripLevelGenderSuffix('District Championships'), 'District Championships');
});

test('buildMeetMappingProposal groups races by exact (team, season, date), not name similarity', () => {
  const races = [
    { id: 'r1', teamId: 't1', seasonId: 's1', name: 'Sunfair Invite - Boys Varsity', date: '2024-09-07', location: 'Sunfair Park' },
    { id: 'r2', teamId: 't1', seasonId: 's1', name: 'Sunfair Invite - Girls Varsity', date: '2024-09-07', location: 'Sunfair Park' },
    { id: 'r3', teamId: 't1', seasonId: 's1', name: 'District Meet', date: '2024-10-05', location: 'Franklin Park' },
    // Same team, same day next year — a different Season, so a different meet.
    { id: 'r4', teamId: 't1', seasonId: 's2', name: 'Sunfair Invite - Boys Varsity', date: '2024-09-07', location: 'Sunfair Park' },
  ];

  const { meets, noSeason } = buildMeetMappingProposal({ races });

  assert.equal(noSeason.length, 0);
  assert.equal(meets.length, 3);

  const sunfair2024 = meets.find((m) => m.raceIds.includes('r1'));
  assert.deepEqual(sunfair2024.raceIds.sort(), ['r1', 'r2']);
  assert.equal(sunfair2024.proposedName, 'Sunfair Invite');
  assert.equal(sunfair2024.location, 'Sunfair Park');

  const district = meets.find((m) => m.raceIds.includes('r3'));
  assert.deepEqual(district.raceIds, ['r3']);
  assert.equal(district.proposedName, 'District Meet');

  const sunfairOtherSeason = meets.find((m) => m.raceIds.includes('r4'));
  assert.notEqual(sunfairOtherSeason, sunfair2024);
  assert.deepEqual(sunfairOtherSeason.raceIds, ['r4']);
});

test('races with no matching Season row are reported separately, never grouped by guesswork', () => {
  const races = [
    { id: 'r1', teamId: 't1', seasonId: null, name: 'Mystery Meet', date: '2024-09-01', location: null },
    { id: 'r2', teamId: 't1', seasonId: 's1', name: 'Real Meet', date: '2024-09-08', location: 'Franklin Park' },
  ];

  const { meets, noSeason } = buildMeetMappingProposal({ races });

  assert.equal(meets.length, 1);
  assert.equal(noSeason.length, 1);
  assert.equal(noSeason[0].id, 'r1');
});

test('proposedName falls back to the most common raw race name when every name is stripped to nothing', () => {
  const races = [
    { id: 'r1', teamId: 't1', seasonId: 's1', name: 'Boys Varsity', date: '2024-09-01', location: null },
    { id: 'r2', teamId: 't1', seasonId: 's1', name: 'Boys Varsity', date: '2024-09-01', location: null },
  ];

  const { meets } = buildMeetMappingProposal({ races });

  assert.equal(meets.length, 1);
  assert.equal(meets[0].proposedName, 'Boys Varsity');
  assert.equal(meets[0].location, null);
});

test('location uses the most common non-null value across the group', () => {
  const races = [
    { id: 'r1', teamId: 't1', seasonId: 's1', name: 'Invite - Boys Varsity', date: '2024-09-01', location: 'Sunfair Park' },
    { id: 'r2', teamId: 't1', seasonId: 's1', name: 'Invite - Girls Varsity', date: '2024-09-01', location: null },
  ];

  const { meets } = buildMeetMappingProposal({ races });

  assert.equal(meets[0].location, 'Sunfair Park');
});
