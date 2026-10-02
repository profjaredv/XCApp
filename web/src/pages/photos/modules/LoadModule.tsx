import React, { useCallback, useRef, useState } from 'react';
import { Plus, RotateCcw, Tags, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { placeholderThumbUrl } from '../data/placeholderPhoto';
import type { LoadBatch, LoadBatchFile, Photo } from '../state/types';

let photoCounter = 0;
function nextPhotoSeed() {
  photoCounter += 1;
  return Date.now() % 1_000_000 + photoCounter;
}

export const LoadModule: React.FC = () => {
  const { state, dispatch, setModule, setMeetFilter } = usePhotosWorkspace();
  const [loadMeetId, setLoadMeetId] = useState(state.meets[state.meets.length - 1]?.id ?? '');
  const [newMeetName, setNewMeetName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const currentBatch = state.loadBatches.find((b) => b.meetId === loadMeetId);

  const processFile = useCallback(
    (batchId: string, fileId: string) => {
      const tick = () => {
        const batch = stateRef.current.loadBatches.find((b) => b.id === batchId);
        if (!batch) return;
        if (batch.paused) {
          setTimeout(tick, 250);
          return;
        }
        const file = batch.files.find((f) => f.id === fileId);
        if (!file || file.status === 'error' || file.status === 'duplicate') return;

        const nextProgress = Math.min(100, file.progress + 15 + Math.random() * 15);
        if (nextProgress >= 100) {
          // ~8% chance of a simulated duplicate (re-running the same batch
          // skips it silently, per the spec) and a ~4% chance of a transient
          // upload error that the per-file Retry button recovers from.
          const roll = Math.random();
          if (roll < 0.08) {
            dispatch({ type: 'UPDATE_FILE', batchId, fileId, patch: { status: 'duplicate', progress: 100 } });
            return;
          }
          if (roll < 0.12) {
            dispatch({ type: 'UPDATE_FILE', batchId, fileId, patch: { status: 'error', progress: nextProgress } });
            return;
          }
          const photo: Photo = {
            id: `photo-load-${batchId}-${fileId}`,
            meetId: loadMeetId,
            takenAt: new Date().toISOString(),
            width: 1600,
            height: 1067,
            status: 'ready',
            seed: nextPhotoSeed(),
          };
          dispatch({ type: 'FILE_READY', batchId, fileId, photo });
          return;
        }
        dispatch({ type: 'UPDATE_FILE', batchId, fileId, patch: { status: 'uploading', progress: nextProgress } });
        setTimeout(tick, 200 + Math.random() * 200);
      };
      tick();
    },
    [dispatch, loadMeetId],
  );

  function startBatch(names: string[]) {
    if (!loadMeetId || names.length === 0) return;
    const batchId = `batch-${Date.now()}`;
    const files: LoadBatchFile[] = names.map((name, i) => ({
      id: `file-${batchId}-${i}`,
      name,
      status: 'queued',
      progress: 0,
    }));
    const batch: LoadBatch = { id: batchId, meetId: loadMeetId, files, paused: false, startedAt: new Date().toISOString() };
    dispatch({ type: 'START_BATCH', batch });
    // A few photos at a time, matching the spec's "a few photos in
    // parallel" — not all 400 at once.
    const CONCURRENCY = 4;
    files.slice(0, CONCURRENCY).forEach((f) => processFile(batchId, f.id));
    let nextIndex = CONCURRENCY;
    const launchNext = () => {
      if (nextIndex >= files.length) return;
      const f = files[nextIndex++];
      processFile(batchId, f.id);
      setTimeout(launchNext, 300);
    };
    setTimeout(launchNext, 300);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).map((f) => f.name);
    startBatch(files.length > 0 ? files : simulatedNames(24));
  }

  function simulatedNames(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `IMG_${1000 + Math.floor(Math.random() * 9000) + i}.jpg`);
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
            onClick={() => {
              const id = `meet-${Date.now()}`;
              dispatch({ type: 'ADD_MEET', meet: { id, name: newMeetName.trim(), date: new Date().toISOString() } });
              setLoadMeetId(id);
              setNewMeetName('');
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
            <Button size="sm" variant="secondary" onClick={() => startBatch(simulatedNames(24))}>
              Simulate a batch
            </Button>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-[repeat(auto-fill,120px)] gap-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="relative aspect-[3/2] overflow-hidden rounded-md bg-ink-border/30"
                  title={f.name}
                >
                  {f.status === 'done' && f.photoId && (
                    <img
                      src={placeholderThumbUrl(
                        state.photos.find((p) => p.id === f.photoId)?.seed ?? 0,
                        120,
                        80,
                      )}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                  {f.status !== 'done' && (
                    <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
                      <span className="truncate text-[10px] text-ink-muted">{f.name}</span>
                      {f.status === 'error' ? (
                        <button
                          type="button"
                          onClick={() => {
                            dispatch({ type: 'UPDATE_FILE', batchId: currentBatch!.id, fileId: f.id, patch: { status: 'queued', progress: 0 } });
                            processFile(currentBatch!.id, f.id);
                          }}
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
              ))}
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
                  setMeetFilter(loadMeetId);
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
