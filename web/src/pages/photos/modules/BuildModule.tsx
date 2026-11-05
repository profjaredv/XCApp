import React, { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { toast } from 'sonner';
import { ModuleShell } from '../components/ModuleShell';
import { BuildLeftPanel } from '../components/BuildLeftPanel';
import { BuildRightPanel } from '../components/BuildRightPanel';
import { CollagePreview } from '../components/CollagePreview';
import { BuildPaceChart } from '../components/BuildPaceChart';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { renderCollage, renderCollageBack, type CollageHeaderText, type FocalPoint } from '../lib/collageRender';
import { buildTwoPagePdf } from '../lib/pdfExport';
import { athletesById as buildAthletesById, eligibleForCollage } from '../lib/selectors';
import { REQUIRED_PICKS, PANELS } from '../lib/templates';
import { canBrowseFullRoster, isPhotoVisible } from '../lib/tagRules';
import { photosService, type CollageSettings } from '../../../api/photosService';
import { cn } from '@/lib/utils';
import type { Athlete, AthleteBuildStats, PhotoAthleteTags } from '../state/types';

const EXPORT_W = 2550;
const EXPORT_H = 3300;

/**
 * Each pick's crop position/zoom for one athlete — lives on the tag, not
 * the pick, so it survives a swap-out/swap-back. Aligned 1:1 with
 * `picks`. Returns undefined for a pick nobody has ever adjusted (so the
 * renderer falls back to that slot's own default — panels B/D default to
 * a lower focus, not dead-center; see lib/templates.ts's PhotoPanel), and
 * fills in the correct per-slot default position when only zoom was set
 * without ever panning, so zooming alone doesn't quietly reset a panel's
 * own default crop to dead-center.
 */
function buildFocalPoints(picks: string[], tags: PhotoAthleteTags, athleteId: string | undefined): (FocalPoint | undefined)[] {
  return picks.map((photoId, i) => {
    const tag = tags[photoId]?.find((t) => t.athleteId === athleteId);
    const hasPosition = tag?.focalX != null && tag?.focalY != null;
    const hasZoom = tag?.focalZoom != null && tag.focalZoom > 1;
    if (!hasPosition && !hasZoom) return undefined;
    const defaultY = i === 0 ? 0.5 : (PANELS[i - 1]?.focusY ?? 0.5);
    return {
      x: tag?.focalX ?? 0.5,
      y: tag?.focalY ?? defaultY,
      zoom: tag?.focalZoom ?? undefined,
    };
  });
}

export const BuildModule: React.FC = () => {
  const { state, actor, teamName, setPhotoFocal } = usePhotosWorkspace();
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<AthleteBuildStats | null>(null);
  // A coach's local-only "edit data for print" correction — see
  // displayStats below. Null means "no override, use the real fetched
  // stats."
  const [statsOverride, setStatsOverride] = useState<AthleteBuildStats | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  // Which page of the two-sided PDF the preview canvas currently shows —
  // the export itself always produces both pages regardless of this.
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  // Build settings — accent color, logo, and the shared group photo for
  // the back page. All team-wide, not athlete-specific, so this is
  // fetched once here (components/CollageSettingsPanel.tsx) rather than
  // as part of per-athlete stats. Null fields mean "use the collage's own
  // built-in default" (lib/collageRender.ts).
  const [collageSettings, setCollageSettings] = useState<CollageSettings | null>(null);

  useEffect(() => {
    photosService.getCollageSettings().then(setCollageSettings).catch((error) => {
      console.error('Failed to load collage settings:', error);
    });
  }, []);

  const groupPhotoId = collageSettings?.groupPhotoId ?? null;
  const accentColor = collageSettings?.accentColor ?? undefined;

  // The real team's name once a coach hasn't typed a custom one in —
  // same "blank means use the sensible default" pattern as the athlete
  // name field just below.
  const teamLabel = state.buildHeader.team || teamName || '';

  const linkedDefault = !canBrowseFullRoster(actor) ? actor.linkedAthleteIds[0] : undefined;
  const athleteId = state.buildAthleteId ?? linkedDefault;
  const athlete = state.athletes.find((a) => a.id === athleteId);

  // Printed onto the collage itself (the stat strip + results block in
  // collageRender.ts), so both the preview and the export need the same
  // object — fetched once per athlete, not per render.
  useEffect(() => {
    if (!athleteId) {
      setStats(null);
      setStatsOverride(null);
      return;
    }
    let cancelled = false;
    setStats(null);
    setStatsOverride(null); // a fresh fetch (new athlete, or a reload) always wins over a stale local edit
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

  // "Edit data for print" (components/EditStatsPanel.tsx) — a coach's
  // local-only correction, never sent to the backend. displayStats is
  // what the preview and the single-athlete export actually use;
  // "Generate all" deliberately does NOT use this (see handleGenerateAll)
  // — an override is scoped to the one athlete currently open here, not
  // silently applied across a whole batch of other athletes' real data.
  const displayStats = statsOverride ?? stats;

  // Same "blank means use the sensible default" pattern as teamLabel above
  // — a coach who never typed a season into the Header field used to get
  // no season printed anywhere on the front page at all, since unlike
  // `team` this field had no fallback. Defaults to the backend's own
  // resolved active season (the same number every other stat on this page
  // is already computed against).
  const seasonLabel = state.buildHeader.season || (displayStats?.season != null ? String(displayStats.season) : '');

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

  // Preview-only URL for the back page's group photo — a plain presigned
  // URL straight off state.photos, same as every other on-screen
  // thumbnail (never the same-origin blob the export needs).
  const groupPhotoPreviewUrl = (groupPhotoId && state.photos.find((p) => p.id === groupPhotoId)?.webUrl) || null;

  const focalPoints = buildFocalPoints(picks, state.tags, athlete?.id);

  function handleFocalChange(index: number, focal: FocalPoint) {
    const photoId = picks[index];
    if (!athlete || !photoId) return;
    setPhotoFocal(photoId, athlete.id, focal.x, focal.y, focal.zoom);
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

  // Same same-origin-blob reasoning as loadExportableUrls above, for the
  // one shared group photo — fetched once per export (or once for the
  // whole "Generate all" batch, not once per athlete, since it's the
  // same photo on every back page).
  async function loadGroupPhotoExportUrl(): Promise<{ url: string | null; revoke: () => void }> {
    if (!groupPhotoId) return { url: null, revoke: () => {} };
    const url = await photosService.getPhotoWebBlobUrl(groupPhotoId);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }

  // Same reasoning again, for a team's own custom logo — one fetch shared
  // across the whole export (or "Generate all" batch), not one per
  // athlete, since it's the same image on every collage. A missing/failed
  // logo degrades to the drawn roundel rather than failing the export
  // (lib/collageRender.ts's loadOptionalImage), so this never throws.
  async function loadLogoExportUrl(): Promise<{ url: string | null; revoke: () => void }> {
    if (!collageSettings?.logoUrl) return { url: null, revoke: () => {} };
    try {
      const url = await photosService.getCollageLogoBlobUrl();
      return { url, revoke: () => URL.revokeObjectURL(url) };
    } catch (error) {
      console.error('Failed to load the collage logo for export, falling back to the drawn logo:', error);
      return { url: null, revoke: () => {} };
    }
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
      toast.error(`No athletes with at least ${REQUIRED_PICKS} picks (and not opted out) in this selection.`);
      return;
    }

    setGeneratingAll(true);
    const zip = new JSZip();
    let failed = 0;
    let groupPhotoExport: { url: string | null; revoke: () => void } | null = null;
    let logoExport: { url: string | null; revoke: () => void } | null = null;
    try {
      [groupPhotoExport, logoExport] = await Promise.all([loadGroupPhotoExportUrl(), loadLogoExportUrl()]);
      for (const candidate of eligible) {
        let exportable: { urls: string[]; revoke: () => void } | null = null;
        try {
          const candidatePicks = (state.picks[candidate.id] ?? []).filter((id) => visiblePhotosById.has(id));
          const candidateFocalPoints = buildFocalPoints(candidatePicks, state.tags, candidate.id);
          const [candidateStats, candidateExportable] = await Promise.all([
            photosService.getAthleteBuildStats(candidate.id),
            loadExportableUrls(candidatePicks),
          ]);
          exportable = candidateExportable;
          const candidateHeader: CollageHeaderText = {
            name: candidate.preferredName || candidate.name,
            team: teamLabel,
            season: state.buildHeader.season || String(candidateStats.season),
          };
          await renderCollage(
            canvas,
            EXPORT_W,
            EXPORT_H,
            exportable.urls,
            candidateHeader,
            true,
            candidateStats,
            candidateFocalPoints,
            accentColor,
            logoExport.url,
          );
          const frontDataUrl = canvas.toDataURL('image/png');
          await renderCollageBack(
            canvas,
            EXPORT_W,
            EXPORT_H,
            candidateHeader,
            candidateStats,
            groupPhotoExport.url,
            true,
            accentColor,
            logoExport.url,
          );
          const backDataUrl = canvas.toDataURL('image/png');
          const pdfBlob = buildTwoPagePdf(frontDataUrl, backDataUrl).output('blob');
          zip.file(`leadpack-photos-collage-${candidate.id}.pdf`, pdfBlob);
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
      link.download = 'leadpack-photos-collages.zip';
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
      groupPhotoExport?.revoke();
      logoExport?.revoke();
    }
  }

  async function handleExport() {
    // The spec's opt-out rule: an opted-out athlete is "skipped by collage
    // generation" outright, not just hidden from grids.
    if (!athlete || athlete.photosOptOut) return;
    const canvas = exportCanvasRef.current;
    if (!canvas) return;
    let exportable: { urls: string[]; revoke: () => void } | null = null;
    let groupPhotoExport: { url: string | null; revoke: () => void } | null = null;
    let logoExport: { url: string | null; revoke: () => void } | null = null;
    try {
      [exportable, groupPhotoExport, logoExport] = await Promise.all([
        loadExportableUrls(picks),
        loadGroupPhotoExportUrl(),
        loadLogoExportUrl(),
      ]);
      const header: CollageHeaderText = {
        name: state.buildHeader.name || athlete.preferredName || athlete.name,
        team: teamLabel,
        season: seasonLabel,
      };
      await renderCollage(
        canvas,
        EXPORT_W,
        EXPORT_H,
        exportable.urls,
        header,
        true, // requireExportableCanvas — this is the canvas toDataURL() reads below
        displayStats,
        focalPoints,
        accentColor,
        logoExport.url,
      );
      const frontDataUrl = canvas.toDataURL('image/png');
      await renderCollageBack(canvas, EXPORT_W, EXPORT_H, header, displayStats, groupPhotoExport.url, true, accentColor, logoExport.url);
      const backDataUrl = canvas.toDataURL('image/png');
      // Opaque id only — the spec's privacy rule bars an athlete's name
      // from ever appearing in a key, URL, or download filename.
      buildTwoPagePdf(frontDataUrl, backDataUrl).save(`leadpack-photos-collage-${athlete.id}.pdf`);
      toast.success('Collage exported', { description: 'Two-page PDF, ready to print double-sided at letter size.' });
    } catch (error) {
      console.error('Collage export failed:', error);
      toast.error("Couldn't export that collage.", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      exportable?.revoke();
      groupPhotoExport?.revoke();
      logoExport?.revoke();
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
          photosById={visiblePhotosById}
          collageSettings={collageSettings}
          onCollageSettingsChange={setCollageSettings}
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
          seasonFallback={displayStats?.season != null ? String(displayStats.season) : ''}
          editableStats={displayStats}
          hasStatsOverride={statsOverride != null}
          onApplyStatsOverride={setStatsOverride}
          onResetStatsOverride={() => setStatsOverride(null)}
        />
      }
      center={
        athlete ? (
          <div className="flex h-full flex-col items-center gap-3 overflow-y-auto bg-ink/40 p-6">
            <div className="flex gap-1.5">
              {(['front', 'back'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setPreviewSide(side)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs capitalize',
                    previewSide === side ? 'bg-accent text-accent-foreground' : 'bg-ink-border/40 hover:bg-ink-border/60',
                  )}
                >
                  {side === 'front' ? 'Front · Photos' : 'Back · Stats'}
                </button>
              ))}
            </div>
            <CollagePreview
              photos={pickedPhotos}
              header={{
                name: state.buildHeader.name || athlete.preferredName || athlete.name,
                team: teamLabel,
                season: seasonLabel,
              }}
              stats={displayStats}
              focalPoints={focalPoints}
              onFocalChange={handleFocalChange}
              side={previewSide}
              groupPhotoUrl={groupPhotoPreviewUrl}
              accent={accentColor}
              logoUrl={collageSettings?.logoUrl ?? null}
            />
            {previewSide === 'front' && picks.length > 0 && (
              <p className="text-xs text-ink-muted">
                Drag a photo to reposition it, scroll to zoom in tighter, double-click to reset zoom.
              </p>
            )}
            <BuildPaceChart stats={displayStats} />
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
