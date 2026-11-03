const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRoute, roleForLogging, normalizeUi } = require('../lib/pageViewLogging');

test('normalizeRoute: a UUID segment (athleteId, raceId, etc.) is collapsed to :id', () => {
  assert.equal(
    normalizeRoute('/t/40123/athlete/3fa85f64-5717-4562-b3fc-2c963f66afa6/journey'),
    '/t/:id/athlete/:id/journey'
  );
});

test('normalizeRoute: a long numeric segment (Athletic.net team id) is collapsed to :id', () => {
  assert.equal(normalizeRoute('/t/40123/today'), '/t/:id/today');
});

test('normalizeRoute: short segments that are not ids pass through unchanged', () => {
  assert.equal(normalizeRoute('/t/40123/practice-plans'), '/t/:id/practice-plans');
});

test('normalizeRoute: a query string is dropped, never stored', () => {
  assert.equal(normalizeRoute('/t/40123/analytics?tab=meets&season=2025'), '/t/:id/analytics');
});

test('normalizeRoute: root and non-string input degrade safely', () => {
  assert.equal(normalizeRoute('/'), '/');
  assert.equal(normalizeRoute(''), '/unknown');
  assert.equal(normalizeRoute(null), '/unknown');
  assert.equal(normalizeRoute(undefined), '/unknown');
});

test('roleForLogging: HEAD_COACH is its own bucket (UI trial is judged per role)', () => {
  assert.equal(roleForLogging({ teamRole: 'HEAD_COACH', isSuperAdmin: false }), 'head_coach');
});

test('roleForLogging: COACH and VOLUNTEER_COACH bucket to "coach"', () => {
  assert.equal(roleForLogging({ teamRole: 'COACH', isSuperAdmin: false }), 'coach');
  assert.equal(roleForLogging({ teamRole: 'VOLUNTEER_COACH', isSuperAdmin: false }), 'coach');
});

test('roleForLogging: ATHLETE buckets to "athlete"', () => {
  assert.equal(roleForLogging({ teamRole: 'ATHLETE', isSuperAdmin: false }), 'athlete');
});

test('roleForLogging: super admin is its own bucket regardless of teamRole', () => {
  assert.equal(roleForLogging({ teamRole: 'HEAD_COACH', isSuperAdmin: true }), 'super_admin');
});

test('roleForLogging: no team role and no approved guardian link buckets to "other"', () => {
  assert.equal(roleForLogging({ teamRole: null, isSuperAdmin: false }), 'other');
  assert.equal(roleForLogging({ teamRole: null, isSuperAdmin: false, isGuardian: false }), 'other');
});

test('roleForLogging: no team role with an approved guardian link buckets to "parent"', () => {
  assert.equal(roleForLogging({ teamRole: null, isSuperAdmin: false, isGuardian: true }), 'parent');
});

test('roleForLogging: a team role wins over a guardian link (a coach who is also a parent is a coach)', () => {
  assert.equal(roleForLogging({ teamRole: 'COACH', isSuperAdmin: false, isGuardian: true }), 'coach');
  assert.equal(roleForLogging({ teamRole: 'ATHLETE', isSuperAdmin: false, isGuardian: true }), 'athlete');
});

test('normalizeUi: the two shells pass through; anything else is stored as classic', () => {
  assert.equal(normalizeUi('classic'), 'classic');
  assert.equal(normalizeUi('next'), 'next');
  assert.equal(normalizeUi('NEXT'), 'classic');
  assert.equal(normalizeUi('beta'), 'classic');
  assert.equal(normalizeUi(undefined), 'classic');
  assert.equal(normalizeUi(null), 'classic');
  assert.equal(normalizeUi({ ui: 'next' }), 'classic');
});
