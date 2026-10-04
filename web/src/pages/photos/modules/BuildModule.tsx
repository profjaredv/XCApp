import React, { useRef } from 'react';
import { toast } from 'sonner';
import { ModuleShell } from '../components/ModuleShell';
import { BuildLeftPanel } from '../components/BuildLeftPanel';
import { BuildRightPanel } from '../components/BuildRightPanel';
import { CollagePreview } from '../components/CollagePreview';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { renderCollage } from '../lib/collageRender';
import { athletesById as buildAthletesById } from '../lib/selectors';
import { isPhotoVisible } from '../lib/tagRules';

const EXPORT_W = 2550;
const EXPORT_H = 3300;

export const BuildModule: React.FC = () => {
  const { state, actor } = usePhotosWorkspace();
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);

  const linkedDefault = !actor.isCoach ? actor.linkedAthleteIds[0] : undefined;
  const athleteId = state.buildAthleteId ?? linkedDefault;
  const athlete = state.athletes.find((a) => a.id === athleteId);

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
        />
      }
      center={
        athlete ? (
          <div className="flex h-full items-center justify-center bg-ink/40 p-6">
            <CollagePreview
              templateSize={state.buildTemplateSize}
              photos={pickedPhotos}
              header={{
                name: state.buildHeader.name || athlete.preferredName || athlete.name,
                team: state.buildHeader.team,
                season: state.buildHeader.season,
              }}
            />
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
