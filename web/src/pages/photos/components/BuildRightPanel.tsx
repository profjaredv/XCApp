import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Mail, Pencil, Plus, Target, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { photosService } from '../../../api/photosService';
import { getApiErrorMessage } from '../../../lib/apiError';
import { REQUIRED_PICKS } from '../lib/templates';
import { EditStatsPanel } from './EditStatsPanel';
import type { Athlete, AthleteBuildStats, Photo, PhotoAthleteTags } from '../state/types';

interface BuildRightPanelProps {
  athlete: Athlete | undefined;
  photosById: Map<string, Photo>;
  tags: PhotoAthleteTags;
  picks: string[];
  exportBlocked: boolean;
  onExport: () => void;
  onDownload: () => void;
  downloading: boolean;
  // The backend's own resolved active season (e.g. "2026") — shown in the
  // Season field whenever the coach hasn't typed a custom one in, same
  // "blank means use the sensible default" pattern as the team field just
  // below it.
  seasonFallback: string;
  // "Edit data for print" (components/EditStatsPanel.tsx) — a coach's
  // local-only correction, never saved back. null while stats are still
  // loading, in which case the Edit button stays disabled (nothing to
  // seed the form from yet).
  editableStats: AthleteBuildStats | null;
  hasStatsOverride: boolean;
  onApplyStatsOverride: (edited: AthleteBuildStats) => void;
  onResetStatsOverride: () => void;
}

export const BuildRightPanel: React.FC<BuildRightPanelProps> = ({
  athlete,
  photosById,
  tags,
  picks,
  exportBlocked,
  onExport,
  onDownload,
  downloading,
  seasonFallback,
  editableStats,
  hasStatsOverride,
  onApplyStatsOverride,
  onResetStatsOverride,
}) => {
  const { state, actor, teamName, setBuildHeader, addPick, removePick, swapPick, reorderPick } = usePhotosWorkspace();
  const dragIndexRef = React.useRef<number | null>(null);
  const [editStatsOpen, setEditStatsOpen] = useState(false);
  const [parentEmail, setParentEmail] = useState('');
  const [sendingLink, setSendingLink] = useState(false);

  // "Notify parent" — coach-only, same authority as the download button
  // just below it. A family viewing their own athlete is already signed
  // in and can click Download directly; this exists for the parent who
  // isn't, and never will be, a LeadPack account holder. See
  // DownloadLinkPage.tsx for where the emailed link actually lands.
  async function handleSendDownloadLink() {
    if (!athlete || !parentEmail.trim()) return;
    setSendingLink(true);
    try {
      const result = await photosService.sendDownloadLink(athlete.id, parentEmail.trim());
      if (result.emailSent) {
        toast.success('Download link emailed.', {
          description: `Works until ${new Date(result.expiresAt).toLocaleDateString()}.`,
        });
        setParentEmail('');
      } else {
        // Best-effort send failed (eusend down/unconfigured) — same
        // fallback the athlete-invite flow uses: the link still exists,
        // so hand it to the coach to pass along themselves.
        await navigator.clipboard.writeText(result.downloadUrl).catch(() => {});
        toast.error("Couldn't send the email, but the link is copied — paste it to the parent yourself.", {
          description: result.downloadUrl,
        });
      }
    } catch (error) {
      toast.error("Couldn't create a download link.", { description: getApiErrorMessage(error) });
    } finally {
      setSendingLink(false);
    }
  }

  if (!athlete) {
    return <div className="flex h-full items-center justify-center p-4 text-sm text-ink-muted">Choose an athlete.</div>;
  }

  const taggedPhotoIds = Object.entries(tags)
    .filter(([, entries]) => entries.some((e) => e.athleteId === athlete.id))
    .map(([photoId]) => photoId)
    .filter((id) => photosById.has(id));

  const notPicked = taggedPhotoIds.filter((id) => !picks.includes(id));
  const requiredPicks = REQUIRED_PICKS;

  function cycleSlot(index: number) {
    if (notPicked.length === 0) return;
    const nextPhotoId = notPicked[0];
    swapPick(athlete!.id, index, nextPhotoId);
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Picks ({picks.length}/{requiredPicks}) — the first pick is the big circled hero photo. Click a photo to
          swap it, drag or use the arrows to reorder.
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
                {index === 0 && (
                  <span
                    className="absolute left-0 top-0 flex h-4 w-4 items-center justify-center bg-accent text-accent-foreground"
                    title="Hero photo — the big circled photo on the printed collage"
                  >
                    <Target className="h-2.5 w-2.5" />
                  </span>
                )}
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

      {picks.length < requiredPicks && (
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Tagged photos ({notPicked.length}) — add at least {requiredPicks - picks.length} more
          </div>
          {/* Every tagged-but-unpicked photo, not just a handful — an
              athlete easily ends up with dozens tagged across a season, and
              a coach needs to actually browse all of them to pick the best
              five, not just whichever happened to load first. Scrolls
              within its own bounded area instead of growing the whole
              right panel unbounded. */}
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {notPicked.map((photoId) => {
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

      <div className="space-y-1.5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Header</div>
        <Input
          value={state.buildHeader.name || athlete.preferredName || athlete.name}
          onChange={(e) => setBuildHeader({ name: e.target.value })}
          className="h-8 border-ink-border bg-transparent text-sm text-ink-foreground"
        />
        <Input
          value={state.buildHeader.team || teamName || ''}
          onChange={(e) => setBuildHeader({ team: e.target.value })}
          className="h-8 border-ink-border bg-transparent text-sm text-ink-foreground"
        />
        <Input
          value={state.buildHeader.season || seasonFallback}
          onChange={(e) => setBuildHeader({ season: e.target.value })}
          className="h-8 border-ink-border bg-transparent text-sm text-ink-foreground"
        />
      </div>

      <div>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5"
          disabled={!editableStats}
          onClick={() => setEditStatsOpen(true)}
        >
          <Pencil className="h-3.5 w-3.5" /> {hasStatsOverride ? 'Edit data (adjusted)' : 'Edit data for print'}
        </Button>
        {editableStats && (
          <EditStatsPanel
            open={editStatsOpen}
            onOpenChange={setEditStatsOpen}
            stats={editableStats}
            hasOverride={hasStatsOverride}
            onApply={onApplyStatsOverride}
            onResetToOriginal={onResetStatsOverride}
          />
        )}
      </div>

      {exportBlocked && (
        <p className="text-xs text-ink-muted">
          This athlete has opted out of photos — collages aren't generated for them.
        </p>
      )}

      <div className="mt-auto flex flex-col gap-1.5">
        <Button
          size="sm"
          className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
          disabled={picks.length < requiredPicks || exportBlocked}
          onClick={onExport}
        >
          <Download className="h-3.5 w-3.5" /> Export PDF
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={downloading} onClick={onDownload}>
          <Download className="h-3.5 w-3.5" /> {downloading ? 'Downloading…' : 'Download photos (ZIP)'}
        </Button>
        {actor.isCoach && (
          <div className="flex gap-1.5">
            <Input
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              placeholder="Email a parent a download link"
              className="h-8 flex-1 border-ink-border bg-transparent text-xs text-ink-foreground"
            />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={sendingLink || !parentEmail.trim()}
              onClick={handleSendDownloadLink}
            >
              <Mail className="h-3.5 w-3.5" /> {sendingLink ? 'Sending…' : 'Send'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
