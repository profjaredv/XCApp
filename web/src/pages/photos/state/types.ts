// LeadPack Photos types — mirror the spec's Neon data model (photos,
// photo_athletes, picks) closely enough that the real API (api/photosService.ts)
// needs no reshaping to fit. `source` matches the spec's tagging
// provenance column exactly.

export type TagSource = 'self' | 'parent' | 'coach' | 'volunteer';

export interface PhotoAthlete {
  athleteId: string;
  source: TagSource;
  // null for a tag made through the no-account, password-gated path
  // (lib/tagRules.ts's 'volunteer' role) — there's no account to
  // attribute it to.
  taggedBy: string | null;
  // Where this athlete's collage crop should center on this photo — the
  // Build module's "move the photo to see faces" drag. Normalized (0-1
  // each); null/undefined means the default centered crop. Lives on the
  // tag (not the pick) so repositioning survives a photo being swapped
  // out of a slot and back in.
  focalX?: number | null;
  focalY?: number | null;
}

export interface Photo {
  id: string;
  meetId: string;
  takenAt: string; // ISO timestamp
  width: number;
  height: number;
  status: 'pending' | 'ready' | 'hidden';
  // Presigned R2 GET URLs (backend/lib/r2.js), short-lived (60 minutes) —
  // never cached beyond this session's in-memory state.
  thumbUrl: string;
  webUrl: string;
}

export interface PhotoAthleteTags {
  [photoId: string]: PhotoAthlete[];
}

export interface AthletePicks {
  // Photo ids in slot order (position 1..5), per athlete per season. Phase 1
  // has one season, so this is keyed by athleteId only.
  [athleteId: string]: string[];
}

export interface Meet {
  id: string;
  name: string;
  date: string; // ISO date
}

export interface Athlete {
  id: string;
  name: string;
  preferredName?: string | null;
  grade?: number;
  photosOptOut: boolean;
  // Every group this athlete is currently (today) an active member of —
  // a training group and a captain/custom group can run concurrently
  // (backend/lib/groups.js), so this is a list, not a single id.
  groupIds: string[];
}

// A team's training/captain/custom group for the active season — the
// Photos module's own minimal read of backend's Group model (see
// routes/groups.js for the fuller coach-facing version this doesn't need:
// leader contacts, member counts, dynamic-group rules). Used to build the
// "filter by group" dropdown in Tag/Build's left panels and a captain's
// own read-only group-coverage view.
export interface PhotoGroup {
  id: string;
  name: string;
  type: 'TRAINING' | 'CAPTAIN' | 'CUSTOM' | 'X_TRAINING';
  color: string | null;
}

export type Module = 'load' | 'tag' | 'build' | 'slideshow';

export type PreviewRole = 'coach' | 'family';

export type TemplateSize = 3 | 4 | 5;

export interface LoadBatchFile {
  id: string;
  name: string;
  status: 'queued' | 'uploading' | 'done' | 'error' | 'duplicate' | 'paused';
  progress: number; // 0-100
  photoId?: string;
}

export interface LoadBatch {
  id: string;
  meetId: string;
  files: LoadBatchFile[];
  paused: boolean;
  startedAt: string;
}

// The running-stats block the Build module prints onto a collage
// (backend/lib/photoBuildStats.js) — reuses the app's own existing
// per-athlete computations (AthleteSeasonMetrics, lib/athleteJourney.js's
// computePRs) rather than re-deriving them, so a number here never
// disagrees with the same number shown anywhere else in the app.
export interface AthleteBestByDistance {
  distanceMeters: number;
  distanceLabel: string | null;
  timeSec: number;
  raceName: string;
  date: string;
}

export interface AthleteRaceResult {
  raceName: string;
  date: string;
  distanceMeters: number | null;
  distanceLabel: string | null;
  timeSec: number;
}

// Same shape as AthleteRaceResult plus which season it happened in — the
// pace chart's "career" view (components/BuildPaceChart.tsx) needs this
// to tell a freshman's single season of data from a returning athlete's
// multi-season history.
export interface AthleteCareerRaceResult extends AthleteRaceResult {
  season: number;
}

export interface AthleteBuildStats {
  name: string;
  season: number;
  /** Null when graduationYear itself is unknown — never guessed. */
  grade: number | null;
  /** Career best 5K, not season-best — null if this athlete has no 5K result yet. */
  careerBest5kSec: number | null;
  totalMiles: number | null;
  averagePaceSecPerMile: number | null;
  totalRaces: number;
  bestByDistance: AthleteBestByDistance[];
  races: AthleteRaceResult[];
  /** Every FINISHED result this athlete has, any season — see AthleteCareerRaceResult. */
  careerRaces: AthleteCareerRaceResult[];
  /** Display names, owner + active TeamMember coaches merged — the back page's small-print credit line. */
  coaches: string[];
}
