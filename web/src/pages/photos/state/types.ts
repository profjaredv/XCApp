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
