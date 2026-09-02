// Which parts of the app a given team actually uses.
//
// Not every program wants every screen. The one that prompted this was
// attendance: plenty of coaches take roll on paper, or their school already
// has an attendance system they're required to use, and an Attendance
// button they will never press is one more thing between them and the
// screen they came for. Equipment, field-results uploads and athlete race
// reflections are the same kind of thing — real features for some programs,
// noise for others.
//
// Three rules this file exists to keep:
//
//   1. Everything defaults ON. A team that has never touched this sees
//      exactly what it saw before, and a feature added here later starts
//      enabled for every existing team rather than silently vanishing.
//   2. Only the app's edges are optional. Roster, schedule, meets, results
//      and analytics are what LeadPack IS; making those switchable would
//      make "a LeadPack team" mean nothing in particular.
//   3. Turning a feature off hides it AND closes it. The toggles gate the
//      API (middleware/teamFeatures.js), not just the nav — otherwise a
//      stale tab or a bookmarked URL walks straight past the setting.
//
// Turning a feature off never deletes anything. The data stays exactly
// where it was and comes back when the feature does, which also means a
// coach can try turning something off without it being a decision they
// have to be sure about.

const FEATURES = [
  {
    key: 'attendance',
    label: 'Attendance',
    description: 'Take attendance at practice, and see who has been missing.',
    default: true,
  },
  {
    key: 'equipment',
    label: 'Equipment',
    description: 'Track uniforms, spikes and gear checked out to athletes.',
    default: true,
  },
  {
    key: 'fieldResults',
    label: 'Field results',
    description:
      "Upload a meet's full results so places, team scores and field standing can be computed.",
    default: true,
  },
  {
    key: 'reflections',
    label: 'Race reflections',
    description: 'Let athletes write about their own races after a meet.',
    default: true,
  },
];

const FEATURE_KEYS = FEATURES.map((f) => f.key);

/** Defaults merged with whatever the team stored. Unknown keys are dropped, not trusted. */
function resolveFeatures(stored) {
  const resolved = {};
  for (const feature of FEATURES) {
    const value = stored && typeof stored === 'object' ? stored[feature.key] : undefined;
    resolved[feature.key] = typeof value === 'boolean' ? value : feature.default;
  }
  return resolved;
}

function isFeatureEnabled(stored, key) {
  const resolved = resolveFeatures(stored);
  // An unknown key is not a feature anyone can turn off, so it is on. The
  // alternative — defaulting unknown keys off — turns a typo in a
  // requireFeature() call into a silent 403 on a working endpoint.
  return Object.prototype.hasOwnProperty.call(resolved, key) ? resolved[key] : true;
}

/** The catalog plus this team's current state, which is what the settings screen renders. */
function describeFeatures(stored) {
  const resolved = resolveFeatures(stored);
  return FEATURES.map((f) => ({ ...f, enabled: resolved[f.key] }));
}

/**
 * Sanitize a PATCH body into something storable: known keys, boolean values.
 * Returns { features, unknownKeys } so the caller can reject rather than
 * quietly accepting a request that didn't do what it asked for.
 */
function applyFeatureUpdate(stored, update) {
  const features = resolveFeatures(stored);
  const unknownKeys = [];
  for (const [key, value] of Object.entries(update || {})) {
    if (!FEATURE_KEYS.includes(key)) {
      unknownKeys.push(key);
      continue;
    }
    if (typeof value !== 'boolean') {
      unknownKeys.push(key);
      continue;
    }
    features[key] = value;
  }
  return { features, unknownKeys };
}

module.exports = {
  FEATURES,
  FEATURE_KEYS,
  resolveFeatures,
  isFeatureEnabled,
  describeFeatures,
  applyFeatureUpdate,
};
