import type { Athlete, Photo, PhotoAthleteTags } from '../state/types';
import type { TagFilter } from '../state/reducer';
import { isPhotoVisible, type Actor } from './tagRules';

export function athletesById(athletes: Athlete[]): Map<string, Athlete> {
  return new Map(athletes.map((a) => [a.id, a]));
}

export interface VisiblePhotosArgs {
  photos: Photo[];
  tags: PhotoAthleteTags;
  athletesByIdMap: Map<string, Athlete>;
  actor: Actor;
  meetFilter: string | null;
  tagFilter: TagFilter;
  armedAthleteId: string | null;
  timeWindow: { start: string; end: string } | null;
}

/** The single pipeline every grid (Tag's grid, Build's "tagged photos" list) filters through. */
export function visiblePhotos(args: VisiblePhotosArgs): Photo[] {
  const { photos, tags, athletesByIdMap, actor, meetFilter, tagFilter, armedAthleteId, timeWindow } = args;

  return photos
    .filter((p) => isPhotoVisible(p, tags[p.id], athletesByIdMap, actor))
    .filter((p) => !meetFilter || p.meetId === meetFilter)
    .filter((p) => {
      if (tagFilter === 'all') return true;
      const entries = tags[p.id] ?? [];
      if (tagFilter === 'untagged') return entries.length === 0;
      if (tagFilter === 'mine') return armedAthleteId ? entries.some((t) => t.athleteId === armedAthleteId) : false;
      return true;
    })
    .filter((p) => {
      if (!timeWindow) return true;
      const t = new Date(p.takenAt).getTime();
      return t >= new Date(timeWindow.start).getTime() && t <= new Date(timeWindow.end).getTime();
    })
    .sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime());
}

export interface CoverageRow {
  athlete: Athlete;
  taggedCount: number;
}

/** Admin "Needs photos" filter: athletes with 0-2 tagged, visible photos. */
export function coverage(athletes: Athlete[], tags: PhotoAthleteTags, photos: Photo[]): CoverageRow[] {
  const readyIds = new Set(photos.filter((p) => p.status === 'ready').map((p) => p.id));
  const counts = new Map<string, number>();
  for (const [photoId, entries] of Object.entries(tags)) {
    if (!readyIds.has(photoId)) continue;
    for (const entry of entries) {
      counts.set(entry.athleteId, (counts.get(entry.athleteId) ?? 0) + 1);
    }
  }
  return athletes
    .filter((a) => !a.photosOptOut)
    .map((athlete) => ({ athlete, taggedCount: counts.get(athlete.id) ?? 0 }))
    .filter((row) => row.taggedCount <= 2)
    .sort((a, b) => a.taggedCount - b.taggedCount);
}

export function tagCountForAthlete(athleteId: string, tags: PhotoAthleteTags): number {
  let count = 0;
  for (const entries of Object.values(tags)) {
    if (entries.some((t) => t.athleteId === athleteId)) count++;
  }
  return count;
}

export function searchAthletes(athletes: Athlete[], query: string): Athlete[] {
  const q = query.trim().toLowerCase();
  if (!q) return athletes;
  return athletes.filter((a) => a.name.toLowerCase().includes(q) || a.preferredName?.toLowerCase().includes(q));
}
