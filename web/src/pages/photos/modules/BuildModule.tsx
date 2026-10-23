import React, { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { toast } from 'sonner';
import { ModuleShell } from '../components/ModuleShell';
import { BuildLeftPanel } from '../components/BuildLeftPanel';
import { BuildRightPanel } from '../components/BuildRightPanel';
import { CollagePreview } from '../components/CollagePreview';
import { BuildPaceChart } from '../components/BuildPaceChart';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { renderCollage, type FocalPoint } from '../lib/collageRender';
import { athletesById as buildAthletesById, eligibleForCollage } from '../lib/selectors';
import { isPhotoVisible } from '../lib/tagRules';
import { useExportPalette } from '../../../hooks/useTeamColors';
import { photosService } from '../../../api/photosService';
import type { Athlete, AthleteBuildStats } from '../state/types';

const EXPORT_W = 2550;
const EXPORT_H = 3300;

export const BuildModule: React.FC = () => {
  const palette = useExportPalette();
  const { state, actor, teamName, setPhotoFocal } = usePhotosWorkspace();
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<AthleteBuildStats | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);

  // The real team's name once a coach hasn't typed a custom one in —
  // same "blank means use the sensible default" pattern as the athlete
  // name field just below.
  const teamLabel = state.buildHeader.team || teamName || '';

  const linkedDefault = !actor.isCoach ? actor.linkedAthleteIds[0] : undefined;
  const athleteId = state.buildAthleteId ?? linkedDefault;
  const athlete = state.athletes.find((a) => a.id === athleteId);

  // Printed onto the collage itself (the stat strip + results block in
  // collageRender.ts), so both the preview and the export need the same
  // object — fetched once per athlete, not per render.
  useEffect(() => {
    if (!athleteId) {
      setStats(null);
      return;
    }
    let cancelled = false;
    setStats(null);
    photosService
      .getAthleteBuildStats(athleteId)
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch((error) => {
        console.error('Failed to load athlete build stats:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  async function handleDownload() {
    if (!athleteId) return;
    setDownloading(true);
    try {
      await photosService.downloadAthletePhotos(athleteId);
    } catch (error) {
      console.error('Photo folder download failed:', error);
      toast.error("Couldn't download that athlete's photos.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDownloading(false);
    }
  }

  const athletesByIdMap = buildAthletesById(state.athletes);
  // Same rule the Tag grid enforces: a hidden photo, or one tagged with an
  // opted-out athlete, must not surface here either — not in the preview,
  // not in the exported PNG. Picks and the "add from tagged" list both
  // read from this filtered map, never the raw photo list.
  const visiblePhotosById = new Map(
    state.photos
      .filter((p) => isPhotoVisible(p, state.tags[p.id], athletesByIdMap, actor))
      .map((p) => [p.id, p] as const),
  );

  const picks = ((athlete && state.picks[athlete.id]) || []).filter((id) => visiblePhotosById.has(id));
  const pickedPhotos = picks.map((id) => visiblePhotosById.get(id));
  const exportBlocked = Boolean(athlete?.photosOptOut);

  // Each pick's crop position for this athlete — lives on the tag, not
  // the pick, so it survives a swap-out/swap-back. Aligned 1:1 with
  // `picks`/`pickedPhotos`.
  const focalPoints: (FocalPoint | undefined)[] = picks.map((photoId) => {
    const tag = state.tags[photoId]?.find((t) => t.athleteId === athlete?.id);
    return tag?.focalX != null && tag?.focalY != null ? { x: tag.focalX, y: tag.focalY } : undefined;
  });

  function handleFocalChange(index: number, focal: FocalPoint) {
    const photoId = picks[index];
    if (!athlete || !photoId) return;
    setPhotoFocal(photoId, athlete.id, focal.x, focal.y);
  }

  function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  // The export canvas loads photos same-origin (photosService.getPhotoWebBlobUrl)
  // rather than straight from R2, so it never depends on CORS surviving the
  // user's own network — see that function's own comment for why. One
  // fetch per pick, done once up front so renderCollage's own per-slot
  // image loading never touches the network at all.
  async function loadExportableUrls(photoIds: string[]): Promise<{ urls: string[]; revoke: () => void }> {
    const urls = await Promise.all(photoIds.map((id) => photosService.getPhotoWebBlobUrl(id)));
    return { urls, revoke: () => urls.forEach((url) => URL.revokeObjectURL(url)) };
  }

  // "Generate all" (build spec, Collage generation: "renders a collage for
  // every athlete with at least three picks, one at a time in a queue").
  // Reuses the exact same renderCollage() the single "Export PNG" button
  // calls, on the same hidden canvas, one athlete at a time — there's no
  // separate server render path (see collageRender.ts's own header
  // comment on why that's fine: it's instant and free either way). Each
  // athlete's own name/stats/focal points are used, never the manual
  // header overrides, which only ever make sense for the one athlete
  // currently open in the right panel.
  async function handleGenerateAll(candidates: Athlete[]) {
    const canvas = exportCanvasRef.current;
    if (!canvas) return;
    const eligible = eligibleForCollage(candidates, state.picks);
    if (eligible.length === 0) {
      toast.error('No athletes with at least 3 picks (and not opted out) in this selection.');
      return;
    }

    setGeneratingAll(true);
    const zip = new JSZip();
    let failed = 0;
    try {
      for (const candidate of eligible) {
        let exportable: { urls: string[]; revoke: () => void } | null = null;
        try {
          const candidatePicks = (state.picks[candidate.id] ?? []).filter((id) => visiblePhotosById.has(id));
          const candidateFocalPoints: (FocalPoint | undefined)[] = candidatePicks.map((photoId) => {
            const tag = state.tags[photoId]?.find((t) => t.athleteId === candidate.id);
            return tag?.focalX != null && tag?.focalY != null ? { x: tag.focalX, y: tag.focalY } : undefined;
          });
          const [candidateStats, candidateExportable] = await Promise.all([
            photosService.getAthleteBuildStats(candidate.id),
            loadExportableUrls(candidatePicks),
          ]);
          exportable = candidateExportable;
          await renderCollage(
            canvas,
            EXPORT_W,
            EXPORT_H,
            state.buildTemplateSize,
            exportable.urls,
            { name: candidate.preferredName || candidate.name, team: teamLabel, season: state.buildHeader.season },
            true,
            candidateStats,
            candidateFocalPoints,
            palette?.paperAccent,
          );
          const blob = await canvasToPngBlob(canvas);
          if (!blob) throw new Error('canvas.toBlob returned null');
          zip.file(`leadpack-photos-collage-${candidate.id}.png`, blob);
        } catch (error) {
          console.error(`Collage generation failed for one athlete in the batch:`, error);
          failed += 1;
        } finally {
          exportable?.revoke();
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `leadpack-photos-collages-${state.buildTemplateSize}up.zip`;
      link.click();
      URL.revokeObjectURL(url);

      const succeeded = eligible.length - failed;
      toast.success(`Generated ${succeeded} collage${succeeded === 1 ? '' : 's'}`, {
        description: failed > 0 ? `${failed} failed — try ${failed === 1 ? 'it' : 'those'} individually.` : undefined,
      });
    } catch (error) {
      console.error('Batch collage generation failed:', error);
      toast.error("Couldn't generate the collages.", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setGeneratingAll(false);
    }
  }

  async function handleExport() {
    // The spec's opt-out rule: an opted-out athlete is "skipped by collage
    // generation" outright, not just hidden from grids.
    if (!athlete || athlete.photosOptOut) return;
    const canvas = exportCanvasRef.current;
    if (!canvas) return;
    let exportable: { urls: string[]; revoke: () => void } | null = null;
    try {
      exportable = await loadExportableUrls(picks);
      await renderCollage(
        canvas,
        EXPORT_W,
        EXPORT_H,
        state.buildTemplateSize,
        exportable.urls,
        {
          name: state.buildHeader.name || athlete.preferredName || athlete.name,
          team: teamLabel,
          season: state.buildHeader.season,
        },
        true, // requireExportableCanvas — this is the canvas toDataURL() reads below
        stats,
        focalPoints,
        palette?.paperAccent,
      );
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      // Opaque id only — the spec's privacy rule bars an athlete's name
      // from ever appearing in a key, URL, or download filename.
      link.download = `leadpack-photos-collage-${athlete.id}.png`;
      link.click();
      toast.success('Collage exported', { description: `${EXPORT_W}×${EXPORT_H}px, ready to print at letter size.` });
    } catch (error) {
      console.error('Collage export failed:', error);
      toast.error("Couldn't export that collage.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      exportable?.revoke();
    }
  }

  return (
    <ModuleShell
      leftLabel="Athletes"
      rightLabel="Build"
      leftPanel={
        <BuildLeftPanel
          athletes={state.athletes}
          picks={state.picks}
          onGenerateAll={handleGenerateAll}
          generatingAll={generatingAll}
        />
      }
      rightPanel={
        <BuildRightPanel
          athlete={athlete}
          photosById={visiblePhotosById}
          tags={state.tags}
          picks={picks}
          exportBlocked={exportBlocked}
          onExport={handleExport}
          onDownload={handleDownload}
          downloading={downloading}
        />
      }
      center={
        athlete ? (
          <div className="flex h-full flex-col items-center gap-3 overflow-y-auto bg-ink/40 p-6">
            <CollagePreview
              templateSize={state.buildTemplateSize}
              photos={pickedPhotos}
              header={{
                name: state.buildHeader.name || athlete.preferredName || athlete.name,
                team: teamLabel,
                season: state.buildHeader.season,
              }}
              stats={stats}
              focalPoints={focalPoints}
              onFocalChange={handleFocalChange}
            />
            {picks.length > 0 && <p className="text-xs text-ink-muted">Drag a photo to reposition it within its frame.</p>}
            <BuildPaceChart stats={stats} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-muted">
            Choose an athlete to build their collage.
          </div>
        )
      }
    >
      <canvas ref={exportCanvasRef} className="hidden" />
    </ModuleShell>
  );
};
