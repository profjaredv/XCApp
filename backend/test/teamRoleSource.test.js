const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// authenticate() attaches the User row, never the caller's TeamMember role,
// so req.user.teamRole is always undefined. Reading it locked every coach
// out of the journey and strategy routes (only "preview as athlete" got
// through, as the athlete). Team roles come from hasTeamRole /
// resolveTeamRole, which look the membership up.
test('no route or middleware reads req.user.teamRole', () => {
  const dirs = ['routes', 'middleware'].map((d) => path.join(__dirname, '..', d));
  const offenders = [];
  for (const dir of dirs) {
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      if (/req\.user\.teamRole/.test(src.replace(/\/\/.*$/gm, ''))) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});

test('journey and strategy check the coach role through hasTeamRole', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'analytics.js'), 'utf8');
  const calls = src.match(/isTeamCoach = req\.user\.teamId === athlete\.teamId && \(await hasTeamRole\(req\.user, ANY_COACH\)\)/g) ?? [];
  assert.equal(calls.length, 2);
});
