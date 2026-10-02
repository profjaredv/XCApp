import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import { photosService } from '../../../api/photosService';
import type { PhotosMe } from '../../../api/photosService';
import { workspaceReducer, type WorkspaceState, type BuildHeader, type HistoryEntry } from './reducer';
import type { Module, Photo, PhotoAthlete, PreviewRole, TemplateSize } from './types';
import {
  canHidePhoto,
  canManageAthlete,
  canPickPhoto,
  canRemoveTag,
  canTagAthlete,
  tagSourceFor,
  type Actor,
} from '../lib/tagRules';
import { PhotosWorkspaceCtx, type GridOrder, type PhotosWorkspaceValue } from './PhotosWorkspaceContext';
import type { TagFilter } from './reducer';

function initialState(): WorkspaceState {
  return {
    loading: true,
    bootstrapError: null,

    athletes: [],
    meets: [],
    photos: [],
    tags: {},
    picks: {},
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
    buildHeader: { name: '', team: 'LeadPack XC', season: '' },
    batchFilterPhotoIds: null,

    past: [],
    future: [],
  };
}

// --- Server sync -----------------------------------------------------
//
// Every optimistic local change (reducer.ts's APPLY_HISTORY_ENTRY/UNDO/REDO)
// is mirrored to the backend by diffing the entry's before/after state —
// one generic function per change kind, used both forward (apply/redo) and
// backward (undo), rather than each of the ten call sites below writing
// its own pair of API calls. A sync failure reverts the optimistic change
// and tells the user, per the spec's "optimistic updates that... reconcile
// with the server."

async function syncTagChange(photoId: string, from: PhotoAthlete[] | undefined, to: PhotoAthlete[] | undefined) {
  const fromIds = new Set((from ?? []).map((t) => t.athleteId));
  const toIds = new Set((to ?? []).map((t) => t.athleteId));
  const additions = [...toIds].filter((id) => !fromIds.has(id));
  const removals = [...fromIds].filter((id) => !toIds.has(id));
  await Promise.all([
    ...additions.map((athleteId) => photosService.tagPhoto(photoId, athleteId)),
    ...removals.map((athleteId) => photosService.untagPhoto(photoId, athleteId)),
  ]);
}

async function syncPhotoStatusChange(photoId: string, toStatus: Photo['status']) {
  if (toStatus === 'hidden') await photosService.hidePhoto(photoId);
  else if (toStatus === 'ready') await photosService.unhidePhoto(photoId);
}

// Picks: the backend replaces an athlete's whole pick list in one call
// rather than diffing individual position swaps/reorders/adds/removes —
// simpler and safer, and exactly what every local pick mutation already
// reduces to (one ordered array of photo ids).
async function syncPickChange(athleteId: string, to: string[] | undefined) {
  await photosService.setPicks(athleteId, to ?? []);
}

async function syncHistoryEntry(entry: HistoryEntry, direction: 'forward' | 'backward'): Promise<void> {
  await Promise.all([
    ...entry.tagChanges.map((c) =>
      direction === 'forward' ? syncTagChange(c.photoId, c.before, c.after) : syncTagChange(c.photoId, c.after, c.before),
    ),
    ...entry.pickChanges.map((c) => syncPickChange(c.athleteId, direction === 'forward' ? c.after : c.before)),
    ...entry.photoChanges.map((c) => syncPhotoStatusChange(c.photoId, direction === 'forward' ? c.after : c.before)),
  ]);
}

export const PhotosWorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, initialState);
  const gridOrderRef = useRef<GridOrder>({ orderedIds: [], columns: 1 });
  const [me, setMe] = useState<PhotosMe | null>(null);
  // Dev-only override of `me` (see TopBar's "Preview: Coach/Family"
  // selector, still gated on import.meta.env.DEV there) — lets a reviewer
  // without a second real account see the family experience against real
  // data, by borrowing real athlete ids off the loaded roster rather than
  // the fixed fake ids Phase 1 used.
  const [devPreviewRole, setDevPreviewRole] = useState<PreviewRole>('coach');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meResult, roster, meets, photosResult, picks] = await Promise.all([
          photosService.me(),
          photosService.roster(),
          photosService.meets(),
          photosService.listPhotos(),
          photosService.picks(),
        ]);
        if (cancelled) return;
        setMe(meResult);
        dispatch({ type: 'BOOTSTRAPPED', athletes: roster, meets, photos: photosResult.photos, tags: photosResult.tags, picks });
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load LeadPack Photos:', error);
        dispatch({ type: 'BOOTSTRAP_FAILED', error: error instanceof Error ? error.message : 'Failed to load.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const devFamilyAthleteIds = useMemo(() => state.athletes.slice(0, 2).map((a) => a.id), [state.athletes]);

  const actor: Actor = useMemo(() => {
    if (import.meta.env.DEV && devPreviewRole === 'family') {
      return { userId: 'dev-family', isCoach: false, role: 'guardian', linkedAthleteIds: devFamilyAthleteIds };
    }
    if (!me) return { userId: '', isCoach: false, role: 'guardian', linkedAthleteIds: [] };
    if (me.isCoach) return { userId: me.userId, isCoach: true, role: 'coach', linkedAthleteIds: [] };
    const linkedAthleteIds = [me.selfAthleteId, ...me.guardianAthleteIds].filter((id): id is string => Boolean(id));
    return { userId: me.userId, isCoach: false, role: me.selfAthleteId ? 'athlete' : 'guardian', linkedAthleteIds };
  }, [me, devPreviewRole, devFamilyAthleteIds]);

  const setGridOrder = useCallback((order: GridOrder) => {
    gridOrderRef.current = order;
  }, []);

  const setModule = useCallback((module: Module) => dispatch({ type: 'SET_MODULE', module }), []);
  const setPreviewRole = useCallback(
    (role: PreviewRole) => {
      setDevPreviewRole(role);
      dispatch({
        type: 'SET_PREVIEW_ROLE',
        role,
        defaultArmedAthleteId: role === 'family' ? (devFamilyAthleteIds[0] ?? null) : null,
      });
    },
    [devFamilyAthleteIds],
  );
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

  // Every optimistic mutation below funnels through this one function so
  // the server-sync-and-revert-on-failure logic lives in exactly one place.
  const applyEntry = useCallback((entry: HistoryEntry) => {
    dispatch({ type: 'APPLY_HISTORY_ENTRY', entry });
    syncHistoryEntry(entry, 'forward').catch((error) => {
      console.error(`Failed to save "${entry.label}":`, error);
      toast.error(`Couldn't save "${entry.label}" — reverted.`);
      dispatch({ type: 'UNDO' });
    });
  }, []);

  const undo = useCallback(() => {
    if (state.past.length === 0) return;
    const entry = state.past[state.past.length - 1];
    dispatch({ type: 'UNDO' });
    syncHistoryEntry(entry, 'backward').catch((error) => {
      console.error(`Failed to save undo of "${entry.label}":`, error);
      toast.error(`Couldn't save that undo.`);
    });
  }, [state.past]);

  const redo = useCallback(() => {
    if (state.future.length === 0) return;
    const entry = state.future[0];
    dispatch({ type: 'REDO' });
    syncHistoryEntry(entry, 'forward').catch((error) => {
      console.error(`Failed to save redo of "${entry.label}":`, error);
      toast.error(`Couldn't save that redo.`);
    });
  }, [state.future]);

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
      applyEntry({ label: 'Tag photo', tagChanges: [{ photoId, before: existing, after }], pickChanges: [], photoChanges: [] });
    },
    [actor, state.tags, applyEntry],
  );

  const untagPhoto = useCallback(
    (photoId: string, athleteId: string) => {
      const existing = state.tags[photoId];
      const tag = existing?.find((t) => t.athleteId === athleteId);
      if (!tag || !canRemoveTag(actor, tag)) return;
      const remaining = existing!.filter((t) => t.athleteId !== athleteId);
      const after = remaining.length > 0 ? remaining : undefined;
      applyEntry({ label: 'Untag photo', tagChanges: [{ photoId, before: existing, after }], pickChanges: [], photoChanges: [] });
    },
    [actor, state.tags, applyEntry],
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
    applyEntry({ label: 'Tag selected', tagChanges, pickChanges: [], photoChanges: [] });
  }, [actor, state.armedAthleteId, state.selectedPhotoIds, state.tags, applyEntry]);

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
    applyEntry({ label: 'Untag selected', tagChanges, pickChanges: [], photoChanges: [] });
  }, [actor, state.armedAthleteId, state.selectedPhotoIds, state.tags, applyEntry]);

  const togglePickSelected = useCallback(() => {
    const athleteId = state.armedAthleteId;
    if (!athleteId || !canManageAthlete(actor, athleteId)) return;
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
    applyEntry({
      label: 'Pick selected',
      tagChanges: [],
      pickChanges: [{ athleteId, before, after: after.length > 0 ? after : undefined }],
      photoChanges: [],
    });
  }, [actor, state.armedAthleteId, state.picks, state.selectedPhotoIds, state.tags, applyEntry]);

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
    applyEntry({ label: 'Hide selected', tagChanges: [], pickChanges: [], photoChanges });
  }, [actor, state.photos, state.selectedPhotoIds, applyEntry]);

  // A standalone single-photo hide, independent of the current selection —
  // TagRightPanel's "Hide photo" button targets the photo it's showing,
  // not whatever setSelection([photo.id]) *will* put in state next render
  // (React batches, so hideSelected() run right after would still see the
  // old selection).
  const hidePhoto = useCallback(
    (photoId: string) => {
      if (!canHidePhoto(actor)) return;
      const photo = state.photos.find((p) => p.id === photoId);
      if (!photo || photo.status === 'hidden') return;
      applyEntry({
        label: 'Hide photo',
        tagChanges: [],
        pickChanges: [],
        photoChanges: [{ photoId, before: photo.status, after: 'hidden' }],
      });
    },
    [actor, state.photos, applyEntry],
  );

  const addMeet = useCallback(async (name: string, date: string) => {
    const meet = await photosService.createMeet(name, date);
    dispatch({ type: 'ADD_MEET', meet });
    return meet.id;
  }, []);

  // Re-fetches the team's photos and folds in whatever the client doesn't
  // already know — see reducer.ts's PHOTOS_REFRESHED. The one caller today
  // is a Google Photos album import (modules/LoadModule.tsx), which adds
  // rows server-side without a local FILE_READY-style id to dispatch.
  const refreshPhotos = useCallback(async () => {
    const { photos, tags } = await photosService.listPhotos();
    dispatch({ type: 'PHOTOS_REFRESHED', photos, tags });
  }, []);

  const setBuildAthlete = useCallback((athleteId: string | null) => dispatch({ type: 'SET_BUILD_ATHLETE', athleteId }), []);
  const setBuildTemplate = useCallback((size: TemplateSize) => dispatch({ type: 'SET_BUILD_TEMPLATE', size }), []);
  const setBuildHeader = useCallback((patch: Partial<BuildHeader>) => dispatch({ type: 'SET_BUILD_HEADER', patch }), []);
  const setBatchFilter = useCallback(
    (photoIds: string[], meetId: string) => dispatch({ type: 'SET_BATCH_FILTER', photoIds, meetId }),
    [],
  );

  const addPick = useCallback(
    (athleteId: string, photoId: string) => {
      if (!canManageAthlete(actor, athleteId) || !canPickPhoto(state.tags[photoId], athleteId)) return;
      const before = state.picks[athleteId];
      if (before?.includes(photoId)) return;
      if (before && before.length >= 5) return;
      const after = [...(before ?? []), photoId];
      applyEntry({ label: 'Add pick', tagChanges: [], pickChanges: [{ athleteId, before, after }], photoChanges: [] });
    },
    [actor, state.picks, state.tags, applyEntry],
  );

  const removePick = useCallback(
    (athleteId: string, photoId: string) => {
      if (!canManageAthlete(actor, athleteId)) return;
      const before = state.picks[athleteId];
      if (!before?.includes(photoId)) return;
      const after = before.filter((id) => id !== photoId);
      applyEntry({
        label: 'Remove pick',
        tagChanges: [],
        pickChanges: [{ athleteId, before, after: after.length > 0 ? after : undefined }],
        photoChanges: [],
      });
    },
    [actor, state.picks, applyEntry],
  );

  const swapPick = useCallback(
    (athleteId: string, position: number, photoId: string) => {
      if (!canManageAthlete(actor, athleteId) || !canPickPhoto(state.tags[photoId], athleteId)) return;
      const before = state.picks[athleteId] ?? [];
      const after = [...before];
      after[position] = photoId;
      applyEntry({ label: 'Swap pick', tagChanges: [], pickChanges: [{ athleteId, before, after }], photoChanges: [] });
    },
    [actor, state.picks, state.tags, applyEntry],
  );

  const reorderPick = useCallback(
    (athleteId: string, fromIndex: number, toIndex: number) => {
      if (!canManageAthlete(actor, athleteId)) return;
      const before = state.picks[athleteId];
      if (!before || fromIndex === toIndex) return;
      const after = [...before];
      const [moved] = after.splice(fromIndex, 1);
      after.splice(toIndex, 0, moved);
      applyEntry({ label: 'Reorder picks', tagChanges: [], pickChanges: [{ athleteId, before, after }], photoChanges: [] });
    },
    [actor, state.picks, applyEntry],
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
    hidePhoto,
    undo,
    redo,
    addMeet,
    refreshPhotos,
    setBuildAthlete,
    setBuildTemplate,
    setBuildHeader,
    setBatchFilter,
    addPick,
    removePick,
    swapPick,
    reorderPick,
    dispatch,
  };

  return <PhotosWorkspaceCtx.Provider value={value}>{children}</PhotosWorkspaceCtx.Provider>;
};
