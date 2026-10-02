import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { ModuleShell } from '../components/ModuleShell';
import { TagLeftPanel } from '../components/TagLeftPanel';
import { TagRightPanel } from '../components/TagRightPanel';
import { PhotoGrid } from '../components/PhotoGrid';
import { FilmStrip } from '../components/FilmStrip';
import { Loupe } from '../components/Loupe';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { athletesById, visiblePhotos } from '../lib/selectors';

export const TagModule: React.FC = () => {
  const { state, actor, setSelection, setThumbSize, openLoupe, closeLoupe, tagPhoto, untagPhoto } = usePhotosWorkspace();
  const byId = athletesById(state.athletes);

  const photos = visiblePhotos({
    photos: state.photos,
    tags: state.tags,
    athletesByIdMap: byId,
    actor,
    meetFilter: state.meetFilter,
    tagFilter: state.tagFilter,
    armedAthleteId: state.armedAthleteId,
    timeWindow: state.timeWindow,
    batchFilterPhotoIds: state.batchFilterPhotoIds,
  });

  const selectedPhotoId = state.selectedPhotoIds[state.selectedPhotoIds.length - 1] ?? null;
  const armedPicks = state.armedAthleteId ? state.picks[state.armedAthleteId] : undefined;
  // The filmstrip is a real (non-virtualized) render of every matching
  // photo, so it only gets a meet-scoped list — "All meets" can be ~2000
  // photos, which is what the main grid's virtualizer exists for.
  const filmStripPhotos = state.meetFilter ? photos : [];

  function handleToggleTagImmediate(photoId: string) {
    const athleteId = state.armedAthleteId;
    if (!athleteId) return;
    const already = (state.tags[photoId] ?? []).some((t) => t.athleteId === athleteId);
    if (already) untagPhoto(photoId, athleteId);
    else tagPhoto(photoId, athleteId);
  }

  return (
    <ModuleShell
      leftLabel="Roster"
      rightLabel="Tags"
      leftPanel={<TagLeftPanel meets={state.meets} photos={state.photos} tags={state.tags} athletes={state.athletes} />}
      rightPanel={
        <TagRightPanel
          photos={state.photos}
          selectedPhotoId={selectedPhotoId}
          tags={state.tags}
          athletes={state.athletes}
          meets={state.meets}
        />
      }
      filmStrip={
        <FilmStrip
          photos={filmStripPhotos}
          scoped={Boolean(state.meetFilter)}
          selectedId={selectedPhotoId}
          onSelect={(id) => setSelection([id], id)}
        />
      }
      center={
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-ink-border px-3 py-1.5">
            <span className="text-xs text-ink-muted">
              {photos.length} photo{photos.length === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-1.5">
              <ZoomOut className="h-3.5 w-3.5 text-ink-muted" />
              <input
                type="range"
                min={100}
                max={260}
                step={10}
                value={state.thumbSize}
                onChange={(e) => setThumbSize(Number(e.target.value))}
                className="h-1 w-24 accent-accent"
              />
              <ZoomIn className="h-3.5 w-3.5 text-ink-muted" />
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <PhotoGrid
              photos={photos}
              tags={state.tags}
              athletesById={byId}
              selectedIds={state.selectedPhotoIds}
              anchorId={state.anchorPhotoId}
              armedAthleteId={state.armedAthleteId}
              picks={armedPicks}
              thumbSize={state.thumbSize}
              onSelectionChange={setSelection}
              onToggleTagImmediate={handleToggleTagImmediate}
              onOpenLoupe={openLoupe}
            />
          </div>
        </div>
      }
    >
      {state.loupePhotoId && (
        <Loupe photos={photos} photoId={state.loupePhotoId} onClose={closeLoupe} onNavigate={openLoupe} />
      )}
    </ModuleShell>
  );
};
