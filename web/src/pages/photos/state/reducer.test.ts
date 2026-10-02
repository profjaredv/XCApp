import { describe, it, expect } from 'vitest';
import { workspaceReducer, type WorkspaceState } from './reducer';
import type { LoadBatch, LoadBatchFile } from './types';

// SET_BATCH_FILES is the one new action added for the Google Photos
// import's live progress polling (modules/LoadModule.tsx) — a wholesale
// replace of one batch's files, unlike UPDATE_FILE's single-file patch,
// since each poll tick hands back a full snapshot of every item.
function baseState(loadBatches: LoadBatch[]): WorkspaceState {
  return {
    loading: false,
    bootstrapError: null,
    athletes: [],
    meets: [],
    photos: [],
    tags: {},
    picks: {},
    loadBatches,
    module: 'load',
    previewRole: 'coach',
    armedAthleteId: null,
    selectedPhotoIds: [],
    anchorPhotoId: null,
    loupePhotoId: null,
    thumbSize: 120,
    tagFilter: 'all',
    meetFilter: null,
    searchQuery: '',
    timeWindow: null,
    buildAthleteId: null,
    buildTemplateSize: 3,
    buildHeader: { name: '', team: '', season: '' },
    batchFilterPhotoIds: null,
    past: [],
    future: [],
  };
}

const batch = (id: string, files: LoadBatchFile[] = []): LoadBatch => ({
  id,
  meetId: 'meet-1',
  files,
  paused: false,
  startedAt: '2026-01-01T00:00:00.000Z',
});

describe('SET_BATCH_FILES', () => {
  it('replaces the named batch\'s files wholesale', () => {
    const before = baseState([batch('google-job-1', [{ id: 'scraping', name: 'Finding photos…', status: 'queued', progress: 0 }])]);
    const newFiles: LoadBatchFile[] = [
      { id: 'item-0', name: 'Photo 1', status: 'done', progress: 100, photoId: 'photo-a' },
      { id: 'item-1', name: 'Photo 2', status: 'uploading', progress: 60 },
    ];

    const after = workspaceReducer(before, { type: 'SET_BATCH_FILES', batchId: 'google-job-1', files: newFiles });

    expect(after.loadBatches[0].files).toEqual(newFiles);
  });

  it('leaves every other batch untouched', () => {
    const untouched = batch('batch-regular', [{ id: 'f1', name: 'IMG_1.jpg', status: 'done', progress: 100, photoId: 'p1' }]);
    const before = baseState([untouched, batch('google-job-1', [])]);

    const after = workspaceReducer(before, {
      type: 'SET_BATCH_FILES',
      batchId: 'google-job-1',
      files: [{ id: 'item-0', name: 'Photo 1', status: 'queued', progress: 0 }],
    });

    expect(after.loadBatches[0]).toBe(untouched);
  });

  it('is a no-op (returns the same batch list) when the batchId does not match any batch', () => {
    const before = baseState([batch('google-job-1', [])]);
    const after = workspaceReducer(before, { type: 'SET_BATCH_FILES', batchId: 'no-such-batch', files: [] });
    expect(after.loadBatches).toEqual(before.loadBatches);
  });
});
