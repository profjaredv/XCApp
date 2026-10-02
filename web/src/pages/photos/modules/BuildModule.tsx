import React, { useRef } from 'react';
import { toast } from 'sonner';
import { ModuleShell } from '../components/ModuleShell';
import { BuildLeftPanel } from '../components/BuildLeftPanel';
import { BuildRightPanel } from '../components/BuildRightPanel';
import { CollagePreview } from '../components/CollagePreview';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { renderCollage } from '../lib/collageRender';

const EXPORT_W = 2550;
const EXPORT_H = 3300;

export const BuildModule: React.FC = () => {
  const { state, actor } = usePhotosWorkspace();
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);

  const linkedDefault = !actor.isCoach ? actor.linkedAthleteIds[0] : undefined;
  const athleteId = state.buildAthleteId ?? linkedDefault;
  const athlete = state.athletes.find((a) => a.id === athleteId);

  const picks = (athlete && state.picks[athlete.id]) || [];
  const photosById = new Map(state.photos.map((p) => [p.id, p]));
  const pickedPhotos = picks.map((id) => photosById.get(id));

  async function handleExport() {
    if (!athlete) return;
    const canvas = exportCanvasRef.current;
    if (!canvas) return;
    await renderCollage(
      canvas,
      EXPORT_W,
      EXPORT_H,
      state.buildTemplateSize,
      picks.map((id) => photosById.get(id)?.seed ?? 0),
      {
        name: state.buildHeader.name || athlete.preferredName || athlete.name,
        team: state.buildHeader.team,
        season: state.buildHeader.season,
      },
    );
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(athlete.preferredName || athlete.name).replace(/\s+/g, '-').toLowerCase()}-collage.png`;
    link.click();
    toast.success('Collage exported', { description: `${EXPORT_W}×${EXPORT_H}px, ready to print at letter size.` });
  }

  return (
    <ModuleShell
      leftLabel="Athletes"
      rightLabel="Build"
      leftPanel={<BuildLeftPanel athletes={state.athletes} picks={state.picks} />}
      rightPanel={
        <BuildRightPanel
          athlete={athlete}
          photosById={photosById}
          tags={state.tags}
          picks={picks}
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
