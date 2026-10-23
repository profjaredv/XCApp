import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModuleShell } from '../components/ModuleShell';
import { GroupFilterSelect } from '../components/GroupFilterSelect';
import { AthleteFilterSelect } from '../components/AthleteFilterSelect';
import { PhotoThumb } from '../components/PhotoThumb';
import { useVirtualizedGrid } from '../hooks/useVirtualizedGrid';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { athletesById, visiblePhotos } from '../lib/selectors';
import { photosService } from '../../../api/photosService';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { Photo } from '../state/types';

const GAP = 8;
const THUMB_SIZE = 150;

// A coach's flat, ordered photo collection for an end-of-season slideshow
// — see backend/lib/photosAccess.js's own header comment on why this is
// deliberately not Pick (not per-athlete, not tagging-gated, not capped).
// Unlike Tag/Build, this browses every ready photo across the whole
// season regardless of the shared meet filter those modules use — the
// point here is "find any photo of anyone," not one meet at a time — so
// this module ignores state.meetFilter rather than reading it.
export const SlideshowModule: React.FC = () => {
  const { state, actor, setGroupFilter, setAthleteFilter } = usePhotosWorkspace();
  const byId = athletesById(state.athletes);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    photosService
      .slideshowItems()
      .then(setCollectionIds)
      .catch((error) => console.error('Failed to load the slideshow collection:', error));
  }, []);

  const photos = visiblePhotos({
    photos: state.photos,
    tags: state.tags,
    athletesByIdMap: byId,
    actor,
    meetFilter: null,
    tagFilter: 'all',
    armedAthleteId: null,
    timeWindow: null,
    groupFilter: state.groupFilter,
    athleteFilter: state.athleteFilter,
  });

  const collectionSet = new Set(collectionIds);
  const photosById = new Map(state.photos.map((p) => [p.id, p] as const));
  const collectionPhotos = collectionIds.map((id) => photosById.get(id)).filter((p): p is Photo => Boolean(p));

  // Soft guidance toward "one photo per athlete" — never enforced. A
  // coach may legitimately want two photos of one athlete and none of
  // another, so this is a count to glance at, not a gate on adding.
  const representedAthleteIds = new Set<string>();
  for (const photoId of collectionIds) {
    for (const tag of state.tags[photoId] ?? []) representedAthleteIds.add(tag.athleteId);
  }
  const eligibleAthleteCount = state.athletes.filter((a) => !a.photosOptOut).length;

  async function toggle(photoId: string) {
    if (pendingIds.has(photoId)) return;
    setPendingIds((prev) => new Set(prev).add(photoId));
    try {
      const next = collectionSet.has(photoId)
        ? await photosService.removeSlideshowItem(photoId)
        : await photosService.addSlideshowItem(photoId);
      setCollectionIds(next);
    } catch (error) {
      toast.error("Couldn't update the slideshow collection.", { description: getApiErrorMessage(error) });
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await photosService.downloadSlideshowPhotos();
    } catch (error) {
      toast.error("Couldn't download the slideshow collection.", { description: getApiErrorMessage(error) });
    } finally {
      setDownloading(false);
    }
  }

  const { containerRef, columns, itemSize, totalHeight, startIndex, endIndex, offsetY } = useVirtualizedGrid({
    itemCount: photos.length,
    thumbSize: THUMB_SIZE,
    gap: GAP,
  });
  const visible = photos.slice(startIndex, endIndex);

  return (
    <ModuleShell
      leftLabel="Filter"
      rightLabel="Collection"
      leftPanel={
        <div className="flex flex-col gap-3 p-3">
          <div>
            <div className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Group</div>
            <GroupFilterSelect groups={state.groups} value={state.groupFilter} onChange={setGroupFilter} />
          </div>
          <div>
            <div className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Athlete</div>
            <AthleteFilterSelect athletes={state.athletes} value={state.athleteFilter} onChange={setAthleteFilter} />
          </div>
        </div>
      }
      rightPanel={
        <div className="flex h-full flex-col gap-3 p-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              Collection ({collectionPhotos.length})
            </div>
            <div className="text-[11px] text-ink-muted">
              {representedAthleteIds.size} of {eligibleAthleteCount} athletes represented
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-wrap gap-1.5">
              {collectionPhotos.map((photo) => (
                <div key={photo.id} className="relative h-14 w-14">
                  <img src={photo.thumbUrl} alt="" className="h-full w-full rounded object-cover" loading="lazy" />
                  <button
                    type="button"
                    onClick={() => toggle(photo.id)}
                    disabled={pendingIds.has(photo.id)}
                    className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center bg-ink/80 text-ink-foreground disabled:opacity-50"
                    aria-label="Remove from the slideshow collection"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              {collectionPhotos.length === 0 && (
                <p className="text-xs text-ink-muted">Click photos to add them to the slideshow collection.</p>
              )}
            </div>
          </div>
          <Button
            size="sm"
            className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={collectionPhotos.length === 0 || downloading}
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" /> {downloading ? 'Downloading…' : 'Download ZIP'}
          </Button>
        </div>
      }
      center={
        <div className="flex h-full flex-col">
          <div className="border-b border-ink-border px-3 py-1.5 text-xs text-ink-muted">
            {photos.length} photo{photos.length === 1 ? '' : 's'}
            <span className="hidden sm:inline"> · Click a photo to add it to the slideshow collection</span>
          </div>
          <div ref={containerRef} className="relative min-h-0 flex-1 overflow-y-auto">
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  top: offsetY,
                  left: 0,
                  right: 0,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columns}, ${itemSize}px)`,
                  gap: GAP,
                  gridAutoRows: itemSize,
                  justifyContent: 'start',
                }}
              >
                {visible.map((photo) => {
                  const inCollection = collectionSet.has(photo.id);
                  return (
                    <PhotoThumb
                      key={photo.id}
                      photo={photo}
                      size={itemSize}
                      selected={inCollection}
                      taggedWithArmed={false}
                      pickedForArmed={inCollection}
                      tags={[]}
                      label={inCollection ? 'Photo, in the slideshow collection' : 'Photo'}
                      onClick={() => toggle(photo.id)}
                    />
                  );
                })}
              </div>
            </div>
            {photos.length === 0 && (
              <div className="flex h-40 items-center justify-center text-sm text-ink-muted">No photos match this view.</div>
            )}
          </div>
        </div>
      }
    />
  );
};
