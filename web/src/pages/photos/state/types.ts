// LeadPack Photos — Phase 1 (interface prototype) types.
//
// These mirror the spec's Neon data model (photos, photo_athletes, picks)
// closely enough that Phase 2 can swap the seeded store for real fetches
// without reshaping every component. `source` matches the spec's tagging
// provenance column exactly.

export type TagSource = 'self' | 'parent' | 'coach';

export interface PhotoAthlete {
  athleteId: string;
  source: TagSource;
  taggedBy: string;
}

export interface Photo {
  id: string;
  meetId: string;
  takenAt: string; // ISO timestamp
  width: number;
  height: number;
  status: 'pending' | 'ready' | 'hidden';
  // Deterministic seed used to render a placeholder thumbnail/web image.
  seed: number;
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
}

export type Module = 'load' | 'tag' | 'build';

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
