import React, { useCallback, useRef, useState } from 'react';
import { ImageDown, Loader2, Plus, RotateCcw, Tags, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/apiError';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { photosService, type AuthorizeFile } from '../../../api/photosService';
import { hashFile, putWithProgress } from '../lib/uploadPipeline';
import { makeThumb, makeWeb } from '../lib/resize';
import { readCaptureTime, readImageDimensions } from '../lib/exif';
import type { LoadBatch, LoadBatchFile, Photo } from '../state/types';

// A few photos in parallel (spec: "the browser... uploads all three
// objects directly to R2, a few photos in parallel") — enough to fill a
// typical connection without the browser opening hundreds of sockets at
// once for a 400-photo meet.
const UPLOAD_CONCURRENCY = 4;
// Hashing/EXIF-reading is CPU/IO-bound, not network-bound, so it can run
// at a higher concurrency than the actual uploads.
const PREP_CONCURRENCY = 6;
// Mirrors backend/routes/photos.js's MAX_FILES_PER_AUTHORIZE.
const MAX_FILES_PER_AUTHORIZE = 60;

/** Runs `worker` over indices [0, count) with at most `concurrency` in flight at once. */
async function runPool(count: number, concurrency: number, worker: (index: number) => Promise<void>): Promise<void> {
  let next = 0;
  async function runner() {
    while (next < count) {
      const i = next++;
      await worker(i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, count) }, runner));
}

export const LoadModule: React.FC = () => {
  const { state, dispatch, setModule, setBatchFilter, addMeet, refreshPhotos } = usePhotosWorkspace();
  const [loadMeetId, setLoadMeetId] = useState(state.meets[state.meets.length - 1]?.id ?? '');
  const [newMeetName, setNewMeetName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [googleAlbumUrl, setGoogleAlbumUrl] = useState('');
  const [importingAlbum, setImportingAlbum] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Real File objects, keyed by `${batchId}:${fileId}` — kept out of Redux
  // state, which only tracks what the UI renders (status/progress), not
  // raw bytes. Cleared per file once it's done so a 400-photo batch
  // doesn't hold every original in memory for longer than it has to.
  const filesRef = useRef(new Map<string, File>());

  // Most RECENT matching batch — re-dropping into a meet that already has
  // one appends a new batch, and `find` alone would keep pinning the UI
  // (progress, pause, "Tag these now") to the first, now-stale one.
  const currentBatch = [...state.loadBatches].reverse().find((b) => b.meetId === loadMeetId);

  const isPaused = useCallback(
    (batchId: string) => stateRef.current.loadBatches.find((b) => b.id === batchId)?.paused ?? false,
    [],
  );
  const waitWhilePaused = useCallback(
    async (batchId: string) => {
      while (isPaused(batchId)) await new Promise((r) => setTimeout(r, 250));
    },
    [isPaused],
  );

  const uploadResult = useCallback(
    async (
      batchId: string,
      meetId: string,
      fileId: string,
      file: File,
      meta: AuthorizeFile,
      result: { photoId: string; duplicate: boolean; putUrls: { original: string; thumb: string; web: string } | null },
    ) => {
      if (result.duplicate) {
        dispatch({ type: 'UPDATE_FILE', batchId, fileId, patch: { status: 'duplicate', progress: 100 } });
        filesRef.current.delete(`${batchId}:${fileId}`);
        return;
      }
      if (!result.putUrls) {
        dispatch({ type: 'UPDATE_FILE', batchId, fileId, patch: { status: 'error', progress: 0 } });
        return;
      }

      try {
        await waitWhilePaused(batchId);
        dispatch({ type: 'UPDATE_FILE', batchId, fileId, patch: { status: 'uploading', progress: 1 } });

        const [thumbBlob, webBlob] = await Promise.all([makeThumb(file), makeWeb(file)]);
        const totalBytes = file.size + thumbBlob.size + webBlob.size;
        const loadedByPart = { original: 0, thumb: 0, web: 0 };
        const report = () => {
          const loaded = loadedByPart.original + loadedByPart.thumb + loadedByPart.web;
          dispatch({ type: 'UPDATE_FILE', batchId, fileId, patch: { progress: Math.min(99, Math.round((loaded / totalBytes) * 100)) } });
        };

        await Promise.all([
          putWithProgress(result.putUrls.original, file, 'image/jpeg', (loaded) => {
            loadedByPart.original = loaded;
            report();
          }),
          putWithProgress(result.putUrls.thumb, thumbBlob, 'image/webp', (loaded) => {
            loadedByPart.thumb = loaded;
            report();
          }),
          putWithProgress(result.putUrls.web, webBlob, 'image/webp', (loaded) => {
            loadedByPart.web = loaded;
            report();
          }),
        ]);

        const finalizeResults = await photosService.finalizeUpload([result.photoId]);
        if (!finalizeResults[result.photoId]?.ok) throw new Error('The server could not confirm the upload landed.');

        const photo: Photo = {
          id: result.photoId,
          meetId,
          takenAt: meta.takenAt ?? new Date().toISOString(),
          width: meta.width ?? 0,
          height: meta.height ?? 0,
          status: 'ready',
          // Instant local preview — no need to wait for a presigned GET
          // round-trip for a photo this tab just uploaded itself. A later
          // reload gets the real presigned URL from GET /api/photos.
          thumbUrl: URL.createObjectURL(thumbBlob),
          webUrl: URL.createObjectURL(webBlob),
        };
        dispatch({ type: 'FILE_READY', batchId, fileId, photo });
        filesRef.current.delete(`${batchId}:${fileId}`);
      } catch (error) {
        console.error('Upload failed for', file.name, error);
        dispatch({ type: 'UPDATE_FILE', batchId, fileId, patch: { status: 'error', progress: 0 } });
      }
    },
    [dispatch, waitWhilePaused],
  );

  const retryFile = useCallback(
    (batchId: string, meetId: string, fileId: string) => {
      const file = filesRef.current.get(`${batchId}:${fileId}`);
      if (!file) return;
      dispatch({ type: 'UPDATE_FILE', batchId, fileId, patch: { status: 'queued', progress: 0 } });
      void (async () => {
        try {
          const [sha256, dims, takenAt] = await Promise.all([hashFile(file), readImageDimensions(file), readCaptureTime(file)]);
          const meta: AuthorizeFile = { sha256, width: dims?.width, height: dims?.height, bytes: file.size, takenAt: takenAt ?? undefined };
          const [result] = await photosService.authorizeUpload(meetId, [meta]);
          await uploadResult(batchId, meetId, fileId, file, meta, result);
        } catch (error) {
          console.error('Retry failed for', file.name, error);
          dispatch({ type: 'UPDATE_FILE', batchId, fileId, patch: { status: 'error', progress: 0 } });
        }
      })();
    },
    [dispatch, uploadResult],
  );

  const runBatch = useCallback(
    async (batchId: string, meetId: string, files: File[]) => {
      const fileIds = files.map((_, i) => `file-${batchId}-${i}`);
      files.forEach((file, i) => filesRef.current.set(`${batchId}:${fileIds[i]}`, file));

      // Step 1 (Select): hash + EXIF, a few at a time.
      const prepared: Array<{ fileId: string; file: File; meta: AuthorizeFile } | null> = new Array(files.length).fill(null);
      await runPool(files.length, PREP_CONCURRENCY, async (i) => {
        await waitWhilePaused(batchId);
        const file = files[i];
        const [sha256, dims, takenAt] = await Promise.all([hashFile(file), readImageDimensions(file), readCaptureTime(file)]);
        prepared[i] = {
          fileId: fileIds[i],
          file,
          meta: { sha256, width: dims?.width, height: dims?.height, bytes: file.size, takenAt: takenAt ?? undefined },
        };
      });
      const ready = prepared.filter((p): p is NonNullable<typeof p> => p !== null);

      // Step 2 (Authorize), in chunks the backend will accept in one call.
      for (let start = 0; start < ready.length; start += MAX_FILES_PER_AUTHORIZE) {
        const chunk = ready.slice(start, start + MAX_FILES_PER_AUTHORIZE);
        await waitWhilePaused(batchId);
        let results;
        try {
          results = await photosService.authorizeUpload(meetId, chunk.map((p) => p.meta));
        } catch (error) {
          console.error('Authorize failed for a batch chunk:', error);
          chunk.forEach((p) => dispatch({ type: 'UPDATE_FILE', batchId, fileId: p.fileId, patch: { status: 'error', progress: 0 } }));
          continue;
        }
        // Step 3 (Resize and upload) + Step 4 (Finalize), a few at a time.
        await runPool(chunk.length, UPLOAD_CONCURRENCY, (j) =>
          uploadResult(batchId, meetId, chunk[j].fileId, chunk[j].file, chunk[j].meta, results[j]),
        );
      }
    },
    [dispatch, waitWhilePaused, uploadResult],
  );

  function startBatch(droppedFiles: File[]) {
    if (!loadMeetId) return;
    const jpegFiles = droppedFiles.filter((f) => f.type === 'image/jpeg' || /\.jpe?g$/i.test(f.name));
    const skipped = droppedFiles.length - jpegFiles.length;
    if (skipped > 0) {
      toast.error(`Skipped ${skipped} file${skipped === 1 ? '' : 's'} — only JPEG originals are supported.`);
    }
    if (jpegFiles.length === 0) return;

    const batchId = `batch-${Date.now()}`;
    const files: LoadBatchFile[] = jpegFiles.map((f, i) => ({ id: `file-${batchId}-${i}`, name: f.name, status: 'queued', progress: 0 }));
    const batch: LoadBatch = { id: batchId, meetId: loadMeetId, files, paused: false, startedAt: new Date().toISOString() };
    dispatch({ type: 'START_BATCH', batch });
    void runBatch(batchId, loadMeetId, jpegFiles);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    startBatch(Array.from(e.dataTransfer.files));
  }

  // Runs entirely server-side (backend/lib/googlePhotosImport.js) — there's
  // no per-file progress to show, just a wait and a final tally. Can take
  // a few minutes for a large album.
  async function handleGoogleImport() {
    const url = googleAlbumUrl.trim();
    if (!loadMeetId || !url || importingAlbum) return;
    setImportingAlbum(true);
    try {
      const summary = await photosService.importGoogleAlbum(loadMeetId, url);
      await refreshPhotos();
      const parts = [`${summary.imported} added`];
      if (summary.duplicates > 0) parts.push(`${summary.duplicates} already had`);
      if (summary.failed > 0) parts.push(`${summary.failed} failed`);
      if (summary.truncated > 0) parts.push(`${summary.truncated} skipped (album too large for one import)`);
      if (summary.failed > 0) {
        toast.warning(`Google Photos import: ${parts.join(', ')}.`, { description: summary.failedDetails[0] });
      } else {
        toast.success(`Google Photos import: ${parts.join(', ')}.`);
      }
      setGoogleAlbumUrl('');
    } catch (error) {
      console.error('Google Photos import failed:', error);
      toast.error(getApiErrorMessage(error, "Couldn't import that album."));
    } finally {
      setImportingAlbum(false);
    }
  }

  const files = currentBatch?.files ?? [];
  const done = files.filter((f) => f.status === 'done').length;
  const duplicates = files.filter((f) => f.status === 'duplicate').length;
  const errors = files.filter((f) => f.status === 'error').length;
  const overallProgress = files.length > 0 ? Math.round(((done + duplicates + errors) / files.length) * 100) : 0;
  const complete = files.length > 0 && done + duplicates + errors === files.length;

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="hidden w-56 shrink-0 flex-col gap-3 border-r border-ink-border p-3 md:flex">
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Meets</div>
        <ul className="space-y-0.5">
          {state.meets.map((meet) => (
            <li key={meet.id}>
              <button
                type="button"
                onClick={() => setLoadMeetId(meet.id)}
                className={cn(
                  'w-full truncate rounded-md px-2 py-1.5 text-left text-sm',
                  loadMeetId === meet.id ? 'bg-accent text-accent-foreground' : 'hover:bg-ink-border/40',
                )}
              >
                {meet.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex gap-1.5">
          <input
            value={newMeetName}
            onChange={(e) => setNewMeetName(e.target.value)}
            placeholder="New meet name"
            className="w-full rounded-md bg-ink-border/40 px-2 py-1.5 text-xs text-ink-foreground outline-none placeholder:text-ink-muted"
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 shrink-0 p-0"
            disabled={!newMeetName.trim()}
            onClick={async () => {
              const name = newMeetName.trim();
              setNewMeetName('');
              try {
                const id = await addMeet(name, new Date().toISOString());
                setLoadMeetId(id);
              } catch (error) {
                console.error('Failed to create meet:', error);
                toast.error("Couldn't create that meet.");
              }
            }}
            aria-label="Add meet"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg"
          className="hidden"
          onChange={(e) => {
            startBatch(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        {files.length === 0 ? (
          <div
            className={cn(
              'm-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-colors',
              dragOver ? 'border-accent bg-accent/10' : 'border-ink-border',
            )}
          >
            <Upload className="h-8 w-8 text-ink-muted" />
            <div className="text-sm text-ink-foreground">Drop a folder or files anywhere on the window</div>
            <div className="text-xs text-ink-muted">
              Uploading into{' '}
              <select
                value={loadMeetId}
                onChange={(e) => setLoadMeetId(e.target.value)}
                className="rounded bg-ink-border/40 px-1 py-0.5 text-ink-foreground"
              >
                {state.meets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <Button size="sm" variant="secondary" disabled={!loadMeetId} onClick={() => fileInputRef.current?.click()}>
              Browse files
            </Button>

            <div className="mt-2 flex w-full max-w-sm items-center gap-2 text-[11px] text-ink-muted">
              <div className="h-px flex-1 bg-ink-border" />
              or
              <div className="h-px flex-1 bg-ink-border" />
            </div>
            <div className="flex w-full max-w-sm items-center gap-1.5">
              <input
                value={googleAlbumUrl}
                onChange={(e) => setGoogleAlbumUrl(e.target.value)}
                placeholder="Paste a public Google Photos album link"
                disabled={importingAlbum}
                className="min-w-0 flex-1 rounded-md bg-ink-border/40 px-2 py-1.5 text-xs text-ink-foreground outline-none placeholder:text-ink-muted disabled:opacity-60"
              />
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0 gap-1.5"
                disabled={!loadMeetId || !googleAlbumUrl.trim() || importingAlbum}
                onClick={handleGoogleImport}
              >
                {importingAlbum ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageDown className="h-3.5 w-3.5" />}
                {importingAlbum ? 'Importing…' : 'Import'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-1.5 border-b border-ink-border px-3 py-1.5">
              <input
                value={googleAlbumUrl}
                onChange={(e) => setGoogleAlbumUrl(e.target.value)}
                placeholder="Paste another public Google Photos album link"
                disabled={importingAlbum}
                className="min-w-0 flex-1 rounded-md bg-ink-border/40 px-2 py-1 text-xs text-ink-foreground outline-none placeholder:text-ink-muted disabled:opacity-60"
              />
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0 gap-1.5"
                disabled={!loadMeetId || !googleAlbumUrl.trim() || importingAlbum}
                onClick={handleGoogleImport}
              >
                {importingAlbum ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageDown className="h-3.5 w-3.5" />}
                {importingAlbum ? 'Importing…' : 'Import'}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-[repeat(auto-fill,120px)] gap-2">
                {files.map((f) => {
                  const photo = f.photoId ? state.photos.find((p) => p.id === f.photoId) : undefined;
                  return (
                    <div key={f.id} className="relative aspect-[3/2] overflow-hidden rounded-md bg-ink-border/30" title={f.name}>
                      {f.status === 'done' && photo && (
                        <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      )}
                      {f.status !== 'done' && (
                        <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
                          <span className="truncate text-[10px] text-ink-muted">{f.name}</span>
                          {f.status === 'error' ? (
                            <button
                              type="button"
                              onClick={() => retryFile(currentBatch!.id, loadMeetId, f.id)}
                              className="flex items-center gap-1 rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] text-destructive"
                            >
                              <RotateCcw className="h-2.5 w-2.5" /> Retry
                            </button>
                          ) : f.status === 'duplicate' ? (
                            <span className="text-[10px] text-ink-muted">Duplicate — skipped</span>
                          ) : (
                            <div className="w-full">
                              <Progress value={f.progress} className="h-1" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="hidden w-64 shrink-0 flex-col gap-3 border-l border-ink-border p-3 md:flex">
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">This batch</div>
        {files.length === 0 ? (
          <div className="text-sm text-ink-muted">Drop photos to start a batch.</div>
        ) : (
          <>
            <Progress value={overallProgress} />
            <div className="space-y-1 text-xs text-ink-muted">
              <div>{done} added</div>
              <div>{duplicates} skipped as duplicates</div>
              {errors > 0 && <div className="text-destructive">{errors} failed</div>}
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-ink-border text-ink-foreground hover:bg-ink-border/40"
                onClick={() => dispatch({ type: 'SET_BATCH_PAUSED', batchId: currentBatch!.id, paused: !currentBatch!.paused })}
              >
                {currentBatch?.paused ? 'Resume' : 'Pause'}
              </Button>
            </div>
            {complete && (
              <Button
                size="sm"
                className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => {
                  // Scoped to just this batch's photos, per the spec's
                  // "Tag these now" — not every photo ever uploaded to
                  // this meet, which setMeetFilter alone would show.
                  const photoIds = files.map((f) => f.photoId).filter((id): id is string => Boolean(id));
                  setBatchFilter(photoIds, loadMeetId);
                  setModule('tag');
                }}
              >
                <Tags className="h-3.5 w-3.5" /> Tag these now
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
