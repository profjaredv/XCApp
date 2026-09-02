// The optional-feature keys, as a type.
//
// The catalog itself — labels, descriptions, defaults — lives in the
// backend (lib/teamFeatures.js) and arrives with the API response, so
// there is one list and it's the one that enforces itself. This file
// exists only so plain modules (lib/navigation.ts) can name a feature
// without importing the data-fetching hook that reads it.

export type TeamFeatureKey = 'attendance' | 'equipment' | 'fieldResults' | 'reflections';
