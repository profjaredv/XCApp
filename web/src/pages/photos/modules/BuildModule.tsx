import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ModuleShell } from '../components/ModuleShell';
import { BuildLeftPanel } from '../components/BuildLeftPanel';
import { BuildRightPanel } from '../components/BuildRightPanel';
import { CollagePreview } from '../components/CollagePreview';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { renderCollage, type FocalPoint } from '../lib/collageRender';
import { athletesById as buildAthletesById } from '../lib/selectors';
import { isPhotoVisible } from '../lib/tagRules';
import { photosService } from '../../../api/photosService';
import type { AthleteBuildStats } from '../state/types';

const EXPORT_W = 2550;
const EXPORT_H = 3300;

export const BuildModule: React.FC = () => {
  const { state, actor, setPhotoFocal } = usePhotosWorkspace();
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<AthleteBuildStats | null>(null);
  const [downloading, setDownloading] = useState(false);

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

  async function handleExport() {
    // The spec's opt-out rule: an opted-out athlete is "skipped by collage
    // generation" outright, not just hidden from grids.
    if (!athlete || athlete.photosOptOut) return;
    const canvas = exportCanvasRef.current;
    if (!canvas) return;
    try {
      await renderCollage(
        canvas,
        EXPORT_W,
        EXPORT_H,
        state.buildTemplateSize,
        picks.map((id) => visiblePhotosById.get(id)?.webUrl ?? ''),
        {
          name: state.buildHeader.name || athlete.preferredName || athlete.name,
          team: state.buildHeader.team,
          season: state.buildHeader.season,
        },
        true, // requireExportableCanvas — this is the canvas toDataURL() reads below
        stats,
        focalPoints,
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
    }
  }

  return (
    <ModuleShell
      leftLabel="Athletes"
      rightLabel="Build"
      leftPanel={<BuildLeftPanel athletes={state.athletes} picks={state.picks} />}
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
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-ink/40 p-6">
            <CollagePreview
              templateSize={state.buildTemplateSize}
              photos={pickedPhotos}
              header={{
                name: state.buildHeader.name || athlete.preferredName || athlete.name,
                team: state.buildHeader.team,
                season: state.buildHeader.season,
              }}
              stats={stats}
              focalPoints={focalPoints}
              onFocalChange={handleFocalChange}
            />
            {picks.length > 0 && <p className="text-xs text-ink-muted">Drag a photo to reposition it within its frame.</p>}
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
