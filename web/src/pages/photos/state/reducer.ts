import type {
  Athlete,
  AthletePicks,
  LoadBatch,
  LoadBatchFile,
  Meet,
  Module,
  Photo,
  PhotoAthlete,
  PhotoAthleteTags,
  PreviewRole,
  TemplateSize,
} from './types';

// 'needsPhotos' intentionally isn't here — "which athletes need photos" is
// an athlete-centric coverage list (see lib/selectors.ts's coverage()),
// not a filter over the photo grid, so it doesn't belong in this union.
export type TagFilter = 'all' | 'untagged' | 'mine';

export interface BuildHeader {
  name: string;
  team: string;
  season: string;
}

export interface WorkspaceState {
  loading: boolean;
  bootstrapError: string | null;

  athletes: Athlete[];
  meets: Meet[];
  photos: Photo[];
  tags: PhotoAthleteTags;
  picks: AthletePicks;
  loadBatches: LoadBatch[];

  module: Module;
  previewRole: PreviewRole;

  armedAthleteId: string | null;
  selectedPhotoIds: string[];
  anchorPhotoId: string | null;
  loupePhotoId: string | null;
  thumbSize: number;

  tagFilter: TagFilter;
  meetFilter: string | null;
  searchQuery: string;
  timeWindow: { start: string; end: string } | null;

  buildAthleteId: string | null;
  buildTemplateSize: TemplateSize;
  buildHeader: BuildHeader;

  // Set by "Tag these now" so the Tag grid opens scoped to just the batch
  // that finished, not every photo ever uploaded to that meet. Cleared by
  // any manual filter change, since at that point the user has taken over.
  batchFilterPhotoIds: string[] | null;

  past: HistoryEntry[];
  future: HistoryEntry[];
}

interface HistoryEntry {
  label: string;
  tagChanges: { photoId: string; before?: PhotoAthlete[]; after?: PhotoAthlete[] }[];
  pickChanges: { athleteId: string; before?: string[]; after?: string[] }[];
  photoChanges: { photoId: string; before: Photo['status']; after: Photo['status'] }[];
}

export type Action =
  | {
      type: 'BOOTSTRAPPED';
      athletes: Athlete[];
      meets: Meet[];
      photos: Photo[];
      tags: PhotoAthleteTags;
      picks: AthletePicks;
    }
  | { type: 'BOOTSTRAP_FAILED'; error: string }
  | { type: 'SET_MODULE'; module: Module }
  | { type: 'SET_PREVIEW_ROLE'; role: PreviewRole; defaultArmedAthleteId: string | null }
  | { type: 'ARM_ATHLETE'; athleteId: string | null }
  | { type: 'SET_SELECTION'; photoIds: string[]; anchorId: string | null }
  | { type: 'SET_LOUPE'; photoId: string | null }
  | { type: 'SET_THUMB_SIZE'; size: number }
  | { type: 'SET_TAG_FILTER'; filter: TagFilter }
  | { type: 'SET_MEET_FILTER'; meetId: string | null }
  | { type: 'SET_SEARCH'; query: string }
  | { type: 'SET_TIME_WINDOW'; range: { start: string; end: string } | null }
  | { type: 'SET_BATCH_FILTER'; photoIds: string[] | null; meetId: string }
  | { type: 'APPLY_HISTORY_ENTRY'; entry: HistoryEntry }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'ADD_MEET'; meet: Meet }
  | { type: 'START_BATCH'; batch: LoadBatch }
  | { type: 'UPDATE_FILE'; batchId: string; fileId: string; patch: Partial<LoadBatchFile> }
  | { type: 'FILE_READY'; batchId: string; fileId: string; photo: Photo }
  | { type: 'SET_BATCH_PAUSED'; batchId: string; paused: boolean }
  | { type: 'SET_BUILD_ATHLETE'; athleteId: string | null }
  | { type: 'SET_BUILD_TEMPLATE'; size: TemplateSize }
  | { type: 'SET_BUILD_HEADER'; patch: Partial<BuildHeader> };

function applyForward(state: WorkspaceState, entry: HistoryEntry): WorkspaceState {
  const tags = { ...state.tags };
  for (const change of entry.tagChanges) {
    if (change.after === undefined) delete tags[change.photoId];
    else tags[change.photoId] = change.after;
  }

  const picks = { ...state.picks };
  for (const change of entry.pickChanges) {
    if (change.after === undefined) delete picks[change.athleteId];
    else picks[change.athleteId] = change.after;
  }

  let photos = state.photos;
  if (entry.photoChanges.length > 0) {
    const byId = new Map(entry.photoChanges.map((c) => [c.photoId, c.after]));
    photos = state.photos.map((p) => (byId.has(p.id) ? { ...p, status: byId.get(p.id)! } : p));
  }

  return { ...state, tags, picks, photos };
}

function applyBackward(state: WorkspaceState, entry: HistoryEntry): WorkspaceState {
  const tags = { ...state.tags };
  for (const change of entry.tagChanges) {
    if (change.before === undefined) delete tags[change.photoId];
    else tags[change.photoId] = change.before;
  }

  const picks = { ...state.picks };
  for (const change of entry.pickChanges) {
    if (change.before === undefined) delete picks[change.athleteId];
    else picks[change.athleteId] = change.before;
  }

  let photos = state.photos;
  if (entry.photoChanges.length > 0) {
    const byId = new Map(entry.photoChanges.map((c) => [c.photoId, c.before]));
    photos = state.photos.map((p) => (byId.has(p.id) ? { ...p, status: byId.get(p.id)! } : p));
  }

  return { ...state, tags, picks, photos };
}

export function workspaceReducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'BOOTSTRAPPED':
      return {
        ...state,
        loading: false,
        bootstrapError: null,
        athletes: action.athletes,
        meets: action.meets,
        photos: action.photos,
        tags: action.tags,
        picks: action.picks,
      };
    case 'BOOTSTRAP_FAILED':
      return { ...state, loading: false, bootstrapError: action.error };
    case 'SET_MODULE':
      return { ...state, module: action.module, selectedPhotoIds: [], anchorPhotoId: null, loupePhotoId: null };
    case 'SET_PREVIEW_ROLE': {
      // Switching persona must not leak the other persona's armed athlete,
      // selection, or in-progress Build/filter context — the acceptance
      // check is "a family account lands with its own athlete armed," not
      // "...unless a coach had someone else armed a moment ago."
      const isFamily = action.role === 'family';
      return {
        ...state,
        previewRole: action.role,
        module: isFamily && state.module === 'load' ? 'tag' : state.module,
        armedAthleteId: action.defaultArmedAthleteId,
        buildAthleteId: action.defaultArmedAthleteId,
        selectedPhotoIds: [],
        anchorPhotoId: null,
        loupePhotoId: null,
        tagFilter: 'all',
        meetFilter: null,
        timeWindow: null,
      };
    }
    case 'ARM_ATHLETE':
      return { ...state, armedAthleteId: action.athleteId };
    case 'SET_SELECTION':
      return { ...state, selectedPhotoIds: action.photoIds, anchorPhotoId: action.anchorId };
    case 'SET_LOUPE':
      return { ...state, loupePhotoId: action.photoId };
    case 'SET_THUMB_SIZE':
      return { ...state, thumbSize: action.size };
    case 'SET_TAG_FILTER':
      return { ...state, tagFilter: action.filter, batchFilterPhotoIds: null };
    case 'SET_MEET_FILTER':
      return { ...state, meetFilter: action.meetId, timeWindow: null, batchFilterPhotoIds: null };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query, batchFilterPhotoIds: null };
    case 'SET_TIME_WINDOW':
      return { ...state, timeWindow: action.range };
    case 'SET_BATCH_FILTER':
      return { ...state, meetFilter: action.meetId, batchFilterPhotoIds: action.photoIds, timeWindow: null };
    case 'APPLY_HISTORY_ENTRY': {
      const next = applyForward(state, action.entry);
      return { ...next, past: [...state.past, action.entry], future: [] };
    }
    case 'UNDO': {
      if (state.past.length === 0) return state;
      const entry = state.past[state.past.length - 1];
      const next = applyBackward(state, entry);
      return { ...next, past: state.past.slice(0, -1), future: [entry, ...state.future] };
    }
    case 'REDO': {
      if (state.future.length === 0) return state;
      const entry = state.future[0];
      const next = applyForward(state, entry);
      return { ...next, past: [...state.past, entry], future: state.future.slice(1) };
    }
    case 'ADD_MEET':
      return { ...state, meets: [...state.meets, action.meet] };
    case 'START_BATCH':
      return { ...state, loadBatches: [...state.loadBatches, action.batch] };
    case 'UPDATE_FILE': {
      return {
        ...state,
        loadBatches: state.loadBatches.map((b) =>
          b.id !== action.batchId
            ? b
            : { ...b, files: b.files.map((f) => (f.id === action.fileId ? { ...f, ...action.patch } : f)) },
        ),
      };
    }
    case 'FILE_READY': {
      return {
        ...state,
        photos: [...state.photos, action.photo],
        loadBatches: state.loadBatches.map((b) =>
          b.id !== action.batchId
            ? b
            : {
                ...b,
                files: b.files.map((f) =>
                  f.id === action.fileId ? { ...f, status: 'done', progress: 100, photoId: action.photo.id } : f,
                ),
              },
        ),
      };
    }
    case 'SET_BATCH_PAUSED':
      return {
        ...state,
        loadBatches: state.loadBatches.map((b) => (b.id === action.batchId ? { ...b, paused: action.paused } : b)),
      };
    case 'SET_BUILD_ATHLETE':
      // The name field is per-athlete (team/season persist across
      // switches); otherwise the previous athlete's custom header name
      // keeps printing on the new athlete's collage.
      return { ...state, buildAthleteId: action.athleteId, buildHeader: { ...state.buildHeader, name: '' } };
    case 'SET_BUILD_TEMPLATE':
      return { ...state, buildTemplateSize: action.size };
    case 'SET_BUILD_HEADER':
      return { ...state, buildHeader: { ...state.buildHeader, ...action.patch } };
    default:
      return state;
  }
}

export type { HistoryEntry };
