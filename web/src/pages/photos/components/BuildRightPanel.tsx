import React from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import type { Athlete, Photo, PhotoAthleteTags, TemplateSize } from '../state/types';

interface BuildRightPanelProps {
  athlete: Athlete | undefined;
  photosById: Map<string, Photo>;
  tags: PhotoAthleteTags;
  picks: string[];
  exportBlocked: boolean;
  onExport: () => void;
}

const TEMPLATE_SIZES: TemplateSize[] = [3, 4, 5];

export const BuildRightPanel: React.FC<BuildRightPanelProps> = ({
  athlete,
  photosById,
  tags,
  picks,
  exportBlocked,
  onExport,
}) => {
  const { state, setBuildTemplate, setBuildHeader, addPick, removePick, swapPick, reorderPick } = usePhotosWorkspace();
  const dragIndexRef = React.useRef<number | null>(null);

  if (!athlete) {
    return <div className="flex h-full items-center justify-center p-4 text-sm text-ink-muted">Choose an athlete.</div>;
  }

  const taggedPhotoIds = Object.entries(tags)
    .filter(([, entries]) => entries.some((e) => e.athleteId === athlete.id))
    .map(([photoId]) => photoId)
    .filter((id) => photosById.has(id));

  const notPicked = taggedPhotoIds.filter((id) => !picks.includes(id));

  function cycleSlot(index: number) {
    if (notPicked.length === 0) return;
    const nextPhotoId = notPicked[0];
    swapPick(athlete!.id, index, nextPhotoId);
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Picks ({picks.length}/5) — click a photo to swap it, drag or use the arrows to reorder
        </div>
        <div className="flex flex-wrap gap-1.5">
          {picks.map((photoId, index) => {
            const photo = photosById.get(photoId);
            if (!photo) return null;
            return (
              // Not itself a button — it holds three independent controls
              // (swap, remove, reorder), and a button can't contain another
              // button, so each gets its own focusable sibling here instead
              // of one wrapper intercepting every interaction.
              <div key={photoId} className="relative h-12 w-16">
                <button
                  type="button"
                  draggable
                  onDragStart={() => {
                    dragIndexRef.current = index;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndexRef.current !== null) reorderPick(athlete.id, dragIndexRef.current, index);
                    dragIndexRef.current = null;
                  }}
                  onClick={() => cycleSlot(index)}
                  aria-label={`Pick ${index + 1} of ${picks.length}. Activate to swap for another tagged photo.`}
                  className="h-full w-full overflow-hidden rounded ring-1 ring-ink-border/60 hover:ring-accent"
                >
                  <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
                <button
                  type="button"
                  onClick={() => removePick(athlete.id, photoId)}
                  className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center bg-ink/80 text-ink-foreground"
                  aria-label={`Remove pick ${index + 1}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
                {picks.length > 1 && (
                  <div className="absolute bottom-0 left-0 flex">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => reorderPick(athlete.id, index, index - 1)}
                      className="flex h-4 w-4 items-center justify-center bg-ink/80 text-ink-foreground disabled:opacity-30"
                      aria-label={`Move pick ${index + 1} earlier`}
                    >
                      <ChevronLeft className="h-2.5 w-2.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === picks.length - 1}
                      onClick={() => reorderPick(athlete.id, index, index + 1)}
                      className="flex h-4 w-4 items-center justify-center bg-ink/80 text-ink-foreground disabled:opacity-30"
                      aria-label={`Move pick ${index + 1} later`}
                    >
                      <ChevronRight className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {picks.length < 3 && (
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Tagged photos — add at least {3 - picks.length} more
          </div>
          <div className="flex flex-wrap gap-1.5">
            {notPicked.slice(0, 12).map((photoId) => {
              const photo = photosById.get(photoId)!;
              return (
                <button
                  key={photoId}
                  type="button"
                  onClick={() => addPick(athlete.id, photoId)}
                  className="group relative h-12 w-16 overflow-hidden rounded ring-1 ring-ink-border/60 hover:ring-accent"
                >
                  <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40">
                    <Plus className="h-4 w-4 text-white opacity-0 group-hover:opacity-100" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Template</div>
        <div className="flex gap-1.5">
          {TEMPLATE_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setBuildTemplate(size)}
              className={cn(
                'rounded-md px-3 py-1 text-xs',
                state.buildTemplateSize === size ? 'bg-accent text-accent-foreground' : 'bg-ink-border/40 hover:bg-ink-border/60',
              )}
            >
              {size} photos
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Header</div>
        <Input
          value={state.buildHeader.name || athlete.preferredName || athlete.name}
          onChange={(e) => setBuildHeader({ name: e.target.value })}
          className="h-8 border-ink-border bg-transparent text-sm text-ink-foreground"
        />
        <Input
          value={state.buildHeader.team}
          onChange={(e) => setBuildHeader({ team: e.target.value })}
          className="h-8 border-ink-border bg-transparent text-sm text-ink-foreground"
        />
        <Input
          value={state.buildHeader.season}
          onChange={(e) => setBuildHeader({ season: e.target.value })}
          className="h-8 border-ink-border bg-transparent text-sm text-ink-foreground"
        />
      </div>

      {exportBlocked && (
        <p className="text-xs text-ink-muted">
          This athlete has opted out of photos — collages aren't generated for them.
        </p>
      )}

      <Button
        size="sm"
        className="mt-auto gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
        disabled={picks.length < 3 || exportBlocked}
        onClick={onExport}
      >
        <Download className="h-3.5 w-3.5" /> Export PNG
      </Button>
    </div>
  );
};
