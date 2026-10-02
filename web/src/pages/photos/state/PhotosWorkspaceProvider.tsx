import React, { useCallback, useMemo, useReducer, useRef } from 'react';
import { buildSeed } from '../data/seed';
import { workspaceReducer, type WorkspaceState, type BuildHeader } from './reducer';
import type { Module, Photo, PhotoAthlete, PreviewRole, TemplateSize } from './types';
import { canHidePhoto, canPickPhoto, canRemoveTag, canTagAthlete, tagSourceFor, type Actor } from '../lib/tagRules';
import { PhotosWorkspaceCtx, type GridOrder, type PhotosWorkspaceValue } from './PhotosWorkspaceContext';
import type { TagFilter } from './reducer';

const seeded = buildSeed();

function initialState(): WorkspaceState {
  return {
    athletes: seeded.athletes,
    meets: seeded.meets,
    photos: seeded.photos,
    tags: seeded.tags,
    picks: seeded.picks,
    loadBatches: [],

    module: 'tag',
    previewRole: 'coach',

    armedAthleteId: null,
    selectedPhotoIds: [],
    anchorPhotoId: null,
    loupePhotoId: null,
    thumbSize: 160,

    tagFilter: 'all',
    meetFilter: null,
    searchQuery: '',
    timeWindow: null,

    buildAthleteId: null,
    buildTemplateSize: 3,
    buildHeader: { name: '', team: 'LeadPack XC', season: '2026 Cross Country' },

    past: [],
    future: [],
  };
}

// Phase 1 has no real auth-aware linked-athlete plumbing for guardians
// (that's Phase 2+, once GuardianLink is wired into this feature). This
// lets a reviewer toggle between the coach and family experiences in one
// session instead of needing two real accounts — removed once real role
// data flows in.
const DEV_FAMILY_LINKED_ATHLETE_IDS = ['athlete-1', 'athlete-2'];

export const PhotosWorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, initialState);
  const gridOrderRef = useRef<GridOrder>({ orderedIds: [], columns: 1 });

  const actor: Actor = useMemo(
    () =>
      state.previewRole === 'coach'
        ? { userId: 'dev-coach', isCoach: true, linkedAthleteIds: [] }
        : { userId: 'dev-family', isCoach: false, linkedAthleteIds: DEV_FAMILY_LINKED_ATHLETE_IDS },
    [state.previewRole],
  );

  const setGridOrder = useCallback((order: GridOrder) => {
    gridOrderRef.current = order;
  }, []);

  const setModule = useCallback((module: Module) => dispatch({ type: 'SET_MODULE', module }), []);
  const setPreviewRole = useCallback((role: PreviewRole) => dispatch({ type: 'SET_PREVIEW_ROLE', role }), []);
  const armAthlete = useCallback((athleteId: string | null) => dispatch({ type: 'ARM_ATHLETE', athleteId }), []);
  const setSelection = useCallback(
    (photoIds: string[], anchorId: string | null) => dispatch({ type: 'SET_SELECTION', photoIds, anchorId }),
    [],
  );
  const openLoupe = useCallback((photoId: string) => dispatch({ type: 'SET_LOUPE', photoId }), []);
  const closeLoupe = useCallback(() => dispatch({ type: 'SET_LOUPE', photoId: null }), []);
  const setThumbSize = useCallback((size: number) => dispatch({ type: 'SET_THUMB_SIZE', size }), []);
  const setTagFilter = useCallback((filter: TagFilter) => dispatch({ type: 'SET_TAG_FILTER', filter }), []);
  const setMeetFilter = useCallback((meetId: string | null) => dispatch({ type: 'SET_MEET_FILTER', meetId }), []);
  const setSearch = useCallback((query: string) => dispatch({ type: 'SET_SEARCH', query }), []);
  const setTimeWindow = useCallback(
    (range: { start: string; end: string } | null) => dispatch({ type: 'SET_TIME_WINDOW', range }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);

  // --- Tagging: every mutation below is a single APPLY_HISTORY_ENTRY so
  // one keypress (even one that touches fifty photos) is one undo step,
  // and every one of them is gated through lib/tagRules first. ---

  const tagPhoto = useCallback(
    (photoId: string, athleteId: string) => {
      if (!canTagAthlete(actor, athleteId)) return;
      const existing = state.tags[photoId];
      if (existing?.some((t) => t.athleteId === athleteId)) return;
      const entry: PhotoAthlete = { athleteId, source: tagSourceFor(actor), taggedBy: actor.userId };
      const after = [...(existing ?? []), entry];
      dispatch({
        type: 'APPLY_HISTORY_ENTRY',
        entry: { label: 'Tag photo', tagChanges: [{ photoId, before: existing, after }], pickChanges: [], photoChanges: [] },
      });
    },
    [actor, state.tags],
  );

  const untagPhoto = useCallback(
    (photoId: string, athleteId: string) => {
      const existing = state.tags[photoId];
      const tag = existing?.find((t) => t.athleteId === athleteId);
      if (!tag || !canRemoveTag(actor, tag)) return;
      const remaining = existing!.filter((t) => t.athleteId !== athleteId);
      const after = remaining.length > 0 ? remaining : undefined;
      dispatch({
        type: 'APPLY_HISTORY_ENTRY',
        entry: { label: 'Untag photo', tagChanges: [{ photoId, before: existing, after }], pickChanges: [], photoChanges: [] },
      });
    },
    [actor, state.tags],
  );

  const tagSelected = useCallback(() => {
    const athleteId = state.armedAthleteId;
    if (!athleteId || !canTagAthlete(actor, athleteId)) return;
    const tagChanges: { photoId: string; before?: PhotoAthlete[]; after?: PhotoAthlete[] }[] = [];
    for (const photoId of state.selectedPhotoIds) {
      const existing = state.tags[photoId];
      if (existing?.some((t) => t.athleteId === athleteId)) continue;
      const entry: PhotoAthlete = { athleteId, source: tagSourceFor(actor), taggedBy: actor.userId };
      tagChanges.push({ photoId, before: existing, after: [...(existing ?? []), entry] });
    }
    if (tagChanges.length === 0) return;
    dispatch({
      type: 'APPLY_HISTORY_ENTRY',
      entry: { label: 'Tag selected', tagChanges, pickChanges: [], photoChanges: [] },
    });
  }, [actor, state.armedAthleteId, state.selectedPhotoIds, state.tags]);

  const untagSelected = useCallback(() => {
    const athleteId = state.armedAthleteId;
    if (!athleteId) return;
    const tagChanges: { photoId: string; before?: PhotoAthlete[]; after?: PhotoAthlete[] }[] = [];
    for (const photoId of state.selectedPhotoIds) {
      const existing = state.tags[photoId];
      const tag = existing?.find((t) => t.athleteId === athleteId);
      if (!tag || !canRemoveTag(actor, tag)) continue;
      const remaining = existing!.filter((t) => t.athleteId !== athleteId);
      tagChanges.push({ photoId, before: existing, after: remaining.length > 0 ? remaining : undefined });
    }
    if (tagChanges.length === 0) return;
    dispatch({
      type: 'APPLY_HISTORY_ENTRY',
      entry: { label: 'Untag selected', tagChanges, pickChanges: [], photoChanges: [] },
    });
  }, [actor, state.armedAthleteId, state.selectedPhotoIds, state.tags]);

  const togglePickSelected = useCallback(() => {
    const athleteId = state.armedAthleteId;
    if (!athleteId) return;
    const before = state.picks[athleteId];
    let after = before ? [...before] : [];
    for (const photoId of state.selectedPhotoIds) {
      if (!canPickPhoto(state.tags[photoId], athleteId)) continue;
      if (after.includes(photoId)) {
        after = after.filter((id) => id !== photoId);
      } else if (after.length < 5) {
        after = [...after, photoId];
      }
    }
    if (after.length === 0 && (!before || before.length === 0)) return;
    dispatch({
      type: 'APPLY_HISTORY_ENTRY',
      entry: {
        label: 'Pick selected',
        tagChanges: [],
        pickChanges: [{ athleteId, before, after: after.length > 0 ? after : undefined }],
        photoChanges: [],
      },
    });
  }, [state.armedAthleteId, state.picks, state.selectedPhotoIds, state.tags]);

  const hideSelected = useCallback(() => {
    if (!canHidePhoto(actor)) return;
    const byId = new Map(state.photos.map((p) => [p.id, p]));
    const photoChanges: { photoId: string; before: Photo['status']; after: Photo['status'] }[] = [];
    for (const photoId of state.selectedPhotoIds) {
      const photo = byId.get(photoId);
      if (!photo || photo.status === 'hidden') continue;
      photoChanges.push({ photoId, before: photo.status, after: 'hidden' });
    }
    if (photoChanges.length === 0) return;
    dispatch({
      type: 'APPLY_HISTORY_ENTRY',
      entry: { label: 'Hide selected', tagChanges: [], pickChanges: [], photoChanges },
    });
  }, [actor, state.photos, state.selectedPhotoIds]);

  const addMeet = useCallback((name: string, date: string) => {
    const id = `meet-${Date.now()}`;
    dispatch({ type: 'ADD_MEET', meet: { id, name, date } });
    return id;
  }, []);

  const setBuildAthlete = useCallback((athleteId: string | null) => dispatch({ type: 'SET_BUILD_ATHLETE', athleteId }), []);
  const setBuildTemplate = useCallback((size: TemplateSize) => dispatch({ type: 'SET_BUILD_TEMPLATE', size }), []);
  const setBuildHeader = useCallback((patch: Partial<BuildHeader>) => dispatch({ type: 'SET_BUILD_HEADER', patch }), []);

  const addPick = useCallback(
    (athleteId: string, photoId: string) => {
      if (!canPickPhoto(state.tags[photoId], athleteId)) return;
      const before = state.picks[athleteId];
      if (before?.includes(photoId)) return;
      if (before && before.length >= 5) return;
      const after = [...(before ?? []), photoId];
      dispatch({
        type: 'APPLY_HISTORY_ENTRY',
        entry: { label: 'Add pick', tagChanges: [], pickChanges: [{ athleteId, before, after }], photoChanges: [] },
      });
    },
    [state.picks, state.tags],
  );

  const removePick = useCallback(
    (athleteId: string, photoId: string) => {
      const before = state.picks[athleteId];
      if (!before?.includes(photoId)) return;
      const after = before.filter((id) => id !== photoId);
      dispatch({
        type: 'APPLY_HISTORY_ENTRY',
        entry: {
          label: 'Remove pick',
          tagChanges: [],
          pickChanges: [{ athleteId, before, after: after.length > 0 ? after : undefined }],
          photoChanges: [],
        },
      });
    },
    [state.picks],
  );

  const swapPick = useCallback(
    (athleteId: string, position: number, photoId: string) => {
      if (!canPickPhoto(state.tags[photoId], athleteId)) return;
      const before = state.picks[athleteId] ?? [];
      const after = [...before];
      after[position] = photoId;
      dispatch({
        type: 'APPLY_HISTORY_ENTRY',
        entry: { label: 'Swap pick', tagChanges: [], pickChanges: [{ athleteId, before, after }], photoChanges: [] },
      });
    },
    [state.picks, state.tags],
  );

  const reorderPick = useCallback(
    (athleteId: string, fromIndex: number, toIndex: number) => {
      const before = state.picks[athleteId];
      if (!before || fromIndex === toIndex) return;
      const after = [...before];
      const [moved] = after.splice(fromIndex, 1);
      after.splice(toIndex, 0, moved);
      dispatch({
        type: 'APPLY_HISTORY_ENTRY',
        entry: { label: 'Reorder picks', tagChanges: [], pickChanges: [{ athleteId, before, after }], photoChanges: [] },
      });
    },
    [state.picks],
  );

  const value: PhotosWorkspaceValue = {
    state,
    actor,
    gridOrderRef,
    setGridOrder,
    setModule,
    setPreviewRole,
    armAthlete,
    setSelection,
    openLoupe,
    closeLoupe,
    setThumbSize,
    setTagFilter,
    setMeetFilter,
    setSearch,
    setTimeWindow,
    tagPhoto,
    untagPhoto,
    tagSelected,
    untagSelected,
    togglePickSelected,
    hideSelected,
    undo,
    redo,
    addMeet,
    setBuildAthlete,
    setBuildTemplate,
    setBuildHeader,
    addPick,
    removePick,
    swapPick,
    reorderPick,
    dispatch,
  };

  return <PhotosWorkspaceCtx.Provider value={value}>{children}</PhotosWorkspaceCtx.Provider>;
};
