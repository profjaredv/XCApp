import React, { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardList, Download, Flag, Link2, MoreHorizontal, Pencil, Play, Split, Timer, Upload, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useGroupScope } from '@/contexts/GroupScopeContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useTodayIso } from '@/hooks/useTodayIso';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useFeatureEnabled } from '@/hooks/useTeamFeatures';
import { useMeet, useMeets, useUpdateMeet } from '@/hooks/useMeetOps';
import { useRaceSplits } from '@/hooks/useSplits';
import { useReflectionsForRace } from '@/hooks/useRaceReflections';
import { meetSeriesService, seriesForRaces, type MeetSeriesHistoryRow } from '@/api/meetSeriesService';
import { isAnyCoach, isFullCoach } from '@/lib/teamRole';
import { formatDateShort, formatTime } from '@/lib/formatUtils';
import { DISTANCE_PRESETS } from '@/lib/distancePresets';
import { cn } from '@/lib/utils';
import MeetDetailPage from '../MeetDetailPage';
import { MeetPredictionsCard } from '@/components/predictions/MeetPredictionsCard';
import { RaceDistanceDialog } from '@/components/meets/RaceDistanceDialog';
import { ImportResultsDialog } from '@/components/meets/ImportResultsDialog';
import { EnterRaceResultsDialog } from '@/components/meets/EnterRaceResultsDialog';
import { NextPageHeader, StickyActionBar } from '@/components/next/PageHeader';
import { Sheet, SheetContent, SheetRow } from '@/components/next/Sheet';
import { DateTile, Panel, SegmentedTabs } from '@/components/next/Visual';

// One meet (docs/leadpack-new-ui-trial.md §4.6): Preview, Results, History.
// No entrants or entry status anywhere — entries live on Athletic.net.
// Results replaces the five identical buttons per race with a status strip
// and the one next step; History is the meet series, year over year.

type Tab = 'preview' | 'results' | 'history';

const MeetPageNext: React.FC = () => {
  const { meetId } = useParams<{ meetId: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const today = useTodayIso();
  const { currentUser } = useAuth();
  const coach = isAnyCoach(currentUser);
  const fullCoach = isFullCoach(currentUser);
  const { seasons, activeYear } = useSeasonSelection();
  const seasonId = seasons.find((s) => s.year === activeYear)?.id ?? null;
  // The list endpoint is open to the whole team; the detail one is full
  // coaches only — so the page is built from the list, and the detail only
  // adds race distances for the people who can change them.
  const { data: meets = [], isLoading } = useMeets(seasonId);
  const summary = meets.find((m) => m.id === meetId) ?? null;
  const { data: detail } = useMeet(fullCoach ? meetId ?? null : null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [timerPick, setTimerPick] = useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'preview', label: 'Preview' },
    ...(coach ? [{ key: 'results' as Tab, label: 'Results' }] : []),
    { key: 'history', label: 'History' },
  ];
  const tab = (tabs.find((t) => t.key === params.get('tab'))?.key ?? 'preview') as Tab;

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!summary) {
    return (
      <div className="mx-auto max-w-4xl">
        <NextPageHeader title="Meet" />
        <p className="text-sm text-muted-foreground">This meet isn't in the {activeYear} season. Pick its season from the top bar, or open it from Meets.</p>
      </div>
    );
  }

  const races = summary.races;
  const raceDay = summary.date.slice(0, 10) === today;
  const daysOut = Math.round((Date.parse(summary.date.slice(0, 10)) - Date.parse(today)) / 86400000);
  const startTimer =
    coach && raceDay && races.length > 0 ? (
      <Button
        className="min-h-12 w-full lg:min-h-10 lg:w-auto"
        onClick={() => (races.length === 1 ? navigate(teamPath(`/race/${races[0].id}/timer`)) : setTimerPick(true))}
      >
        <Timer className="mr-2 h-4 w-4" />
        Start timer
      </Button>
    ) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <NextPageHeader
        title={summary.name}
        primary={startTimer}
        primaryDesktopOnly
        overflow={fullCoach ? [{ label: 'Meet details & races', onClick: () => setDetailsOpen(true), icon: Pencil }] : []}
      />
      <div className="-mt-2 mb-4 flex items-center gap-3">
        <DateTile date={summary.date} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{summary.location || 'Location not set'}</p>
          <p className="text-sm text-muted-foreground">
            {formatDateShort(summary.date)}
            {summary.isHome != null ? ` · ${summary.isHome ? 'Home' : 'Away'}` : ''}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
            raceDay ? 'bg-primary text-primary-foreground' : daysOut > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
        >
          {raceDay ? 'Race day' : daysOut > 0 ? (daysOut === 1 ? 'Tomorrow' : `In ${daysOut} days`) : 'Done'}
        </span>
      </div>
      <SegmentedTabs<Tab>
        label="Meet"
        tabs={tabs}
        value={tab}
        onChange={(k) => setParams(k === 'preview' ? {} : { tab: k }, { replace: true })}
        className="mb-4"
      />

      {tab === 'preview' && (
        <PreviewTab
          meetId={summary.id}
          races={races.map((r) => ({ id: r.id, name: r.name, distance: r.distance, distanceMeters: detail?.races?.find((d) => d.id === r.id)?.distanceMeters ?? null }))}
          meetDistance={detail?.distance ?? null}
          canEdit={fullCoach}
          coach={coach}
          raceDay={raceDay}
        />
      )}
      {tab === 'results' && coach && <ResultsTab races={races} seasonYear={detail?.seasonYear ?? activeYear ?? null} fullCoach={fullCoach} />}
      {tab === 'history' && <HistoryTab raceIds={races.map((r) => r.id)} coach={fullCoach} />}

      {startTimer && <StickyActionBar>{startTimer}</StickyActionBar>}

      <Sheet open={timerPick} onOpenChange={setTimerPick}>
        <SheetContent title="Which race?">
          {races.map((r) => (
            <SheetRow key={r.id} onClick={() => navigate(teamPath(`/race/${r.id}/timer`))}>
              {r.name}
            </SheetRow>
          ))}
        </SheetContent>
      </Sheet>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Meet details & races</DialogTitle>
            <DialogDescription>Name, date, place, post season, and races added by hand.</DialogDescription>
          </DialogHeader>
          {detailsOpen && <MeetDetailPage detailsOnly />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

const PreviewTab: React.FC<{
  meetId: string;
  races: Array<{ id: string; name: string; distance: string | null; distanceMeters: number | null }>;
  meetDistance: string | null;
  canEdit: boolean;
  coach: boolean;
  raceDay: boolean;
}> = ({ meetId, races, meetDistance, canEdit, coach }) => {
  const [editing, setEditing] = useState<{ id: string; name: string; distanceMeters: number | null } | null>(null);
  const [meetDistanceOpen, setMeetDistanceOpen] = useState(false);
  const reflectionsOn = useFeatureEnabled('reflections');
  const { data: context } = useTeamContext();

  return (
    <div className="space-y-4">
      <Panel title="Races">
          {races.length === 0 ? (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">No races yet — this team's races appear once results are imported after the meet.</p>
              <p>
                Distance: <span className="font-medium">{meetDistance ?? 'not set'}</span>
                {canEdit && (
                  <Button variant="link" className="h-auto p-0 pl-2" onClick={() => setMeetDistanceOpen(true)}>
                    {meetDistance ? 'Change' : 'Set distance'}
                  </Button>
                )}
              </p>
              {!meetDistance && <p className="text-xs text-muted-foreground">Setting it now lets predictions use the real distance.</p>}
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {races.map((r) => (
                <li key={r.id} className="flex min-h-14 flex-wrap items-center gap-3 py-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Flag className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => setEditing({ id: r.id, name: r.name, distanceMeters: r.distanceMeters })}
                      className={cn(
                        'min-h-10 rounded-full px-3 text-sm font-semibold',
                        r.distanceMeters ? 'bg-muted' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                      )}
                      title="Set this race's distance"
                    >
                      {r.distanceMeters ? `${Math.round(r.distanceMeters)}m` : 'Set distance'}
                    </button>
                  ) : (
                    <span className="text-sm text-muted-foreground">{r.distance ?? 'Distance not set'}</span>
                  )}
                  {coach && reflectionsOn && <GoalsCount raceId={r.id} rosterCount={context?.activeSeasonSummary.rosterCount ?? null} />}
                </li>
              ))}
            </ul>
          )}
      </Panel>
      {coach && <MeetPredictionsCard meetId={meetId} />}
      <RaceDistanceDialog race={editing} onClose={() => setEditing(null)} />
      {meetDistanceOpen && <MeetDistanceDialog meetId={meetId} current={meetDistance} onClose={() => setMeetDistanceOpen(false)} />}
    </div>
  );
};

/** "Goals shared: n of m" — only reflections athletes chose to share reach a coach. */
const GoalsCount: React.FC<{ raceId: string; rosterCount: number | null }> = ({ raceId, rosterCount }) => {
  const { data } = useReflectionsForRace(raceId);
  if (!data) return null;
  const n = data.filter((r) => r.processGoal || r.outcomeGoal || r.targetTimeSec != null || r.keyFocus).length;
  return (
    <span className="flex w-full items-center gap-2 pl-[3.25rem] text-xs text-muted-foreground" title="Only goals athletes chose to share with coaches are counted">
      {rosterCount ? (
        <span className="h-1.5 max-w-40 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((n / rosterCount) * 100))}%` }} />
        </span>
      ) : null}
      <span className="shrink-0">
        Goals shared: {n}
        {rosterCount ? ` of ${rosterCount}` : ''}
      </span>
    </span>
  );
};

// Before a race row exists, the distance is the meet's own (PUT
// /meet-ops/:meetId distance — the same field classic's details card sets).
const MeetDistanceDialog: React.FC<{ meetId: string; current: string | null; onClose: () => void }> = ({ meetId, current, onClose }) => {
  const update = useUpdateMeet(meetId);
  const [value, setValue] = useState(current ?? '');
  const save = async () => {
    try {
      await update.mutateAsync({ distance: value.trim() });
      toast.success('Distance saved.');
      onClose();
    } catch {
      toast.error('Could not save the distance.');
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Meet distance</DialogTitle>
          <DialogDescription>Used for predictions until this team's races exist.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {DISTANCE_PRESETS.map((p) => (
            <Button key={p.label} type="button" size="sm" variant={value === p.label ? 'default' : 'outline'} onClick={() => setValue(p.label)}>
              {p.label}
            </Button>
          ))}
        </div>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 5K, 2 Miles" aria-label="Distance" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={update.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

const ResultsTab: React.FC<{ races: Array<{ id: string; name: string }>; seasonYear: number | null; fullCoach: boolean }> = ({
  races,
  seasonYear,
  fullCoach,
}) =>
  races.length === 0 ? (
    <p className="text-sm text-muted-foreground">No races yet. Results arrive with the season import, or add a race by hand from Meet details.</p>
  ) : (
    <div className="space-y-4">
      {races.map((r) => (
        <RaceResultsCard key={r.id} race={r} seasonYear={seasonYear} fullCoach={fullCoach} />
      ))}
    </div>
  );

const RaceResultsCard: React.FC<{ race: { id: string; name: string }; seasonYear: number | null; fullCoach: boolean }> = ({
  race,
  seasonYear,
  fullCoach,
}) => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const scope = useGroupScope();
  const reflectionsOn = useFeatureEnabled('reflections');
  const { data: view, isLoading } = useRaceSplits(race.id);
  const { data: reflections } = useReflectionsForRace(race.id, { enabled: reflectionsOn });
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [enterOpen, setEnterOpen] = useState(false);

  const finishers = (view?.results ?? []).filter((r) => r.finishSec != null);
  const withSplits = finishers.filter((r) => r.splits.length > 0).length;
  const reflected = (reflections ?? []).filter((r) => r.whatWorked || r.whatDidnt || r.postNotes || r.feelingRating != null).length;
  const shown = useMemo(
    () => (view?.results ?? []).filter((r) => !scope.athleteIdsInScope || scope.athleteIdsInScope.has(r.athleteId)),
    [view, scope.athleteIdsInScope]
  );

  // The one next step: results first, then splits. Nothing left → no button.
  const next =
    finishers.length === 0
      ? fullCoach
        ? { label: 'Import results', icon: Upload, run: () => setImportOpen(true) }
        : null
      : withSplits < finishers.length
      ? { label: 'Enter splits', icon: Split, run: () => navigate(teamPath(`/race/${race.id}/splits`)) }
      : null;

  const menu = [
    ...(fullCoach ? [{ label: 'Enter results manually', icon: ClipboardList, run: () => setEnterOpen(true) }] : []),
    { label: 'Live timer', icon: Play, run: () => navigate(teamPath(`/race/${race.id}/timer`)) },
    ...(fullCoach ? [{ label: finishers.length ? 'Re-import results' : 'Import results', icon: Download, run: () => setImportOpen(true) }] : []),
    { label: 'Race visualization', icon: Video, run: () => navigate(teamPath('/race-visualization')) },
  ];

  return (
    <section className="rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border/60">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate font-semibold">{race.name}</h3>
          {next && (
            <Button size="sm" className="min-h-10 shrink-0" onClick={next.run}>
              <next.icon className="mr-1.5 h-4 w-4" />
              {next.label}
            </Button>
          )}
          <button type="button" onClick={() => setMenuOpen(true)} aria-label={`More for ${race.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted hover:bg-accent">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
        {/* The status strip — what's done for this race, at a glance. */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : finishers.length === 0 ? (
          <span className="inline-block rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">No results yet</span>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Progress label="Results" value={finishers.length} max={finishers.length} />
            <Progress label="Splits" value={withSplits} max={finishers.length} />
            {reflectionsOn && reflections ? (
              <Progress label="Reflections" value={reflected} max={finishers.length} title="Reflections athletes shared with coaches" />
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
      {finishers.length > 0 && (
        <div className="mt-3">
          {scope.athleteIdsInScope && (
            <p className="mb-1 text-xs text-muted-foreground">
              {scope.label}: {shown.length} of {view!.results.length}
            </p>
          )}
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody from {scope.label} ran this race.</p>
          ) : (
            <ol className="text-sm">
              {shown.map((r) => (
                <li key={r.resultId}>
                  <Link to={teamPath(`/athlete/${r.athleteId}`)} className="-mx-2 flex min-h-12 items-center gap-3 rounded-2xl px-2 hover:bg-accent/60">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                        r.place != null && r.place <= 3 ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {r.place ?? '–'}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.athleteName}</span>
                    {r.splits.length > 0 && <Split className="h-4 w-4 shrink-0 text-primary" aria-label="Has splits" />}
                    <span className="shrink-0 font-semibold tabular-nums">{r.finishSec != null ? formatTime(r.finishSec) : '—'}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent title={race.name}>
          {menu.map((m) => (
            <SheetRow
              key={m.label}
              onClick={() => {
                setMenuOpen(false);
                m.run();
              }}
            >
              <m.icon className="h-5 w-5" />
              {m.label}
            </SheetRow>
          ))}
        </SheetContent>
      </Sheet>
      {fullCoach && (
        <>
          <ImportResultsDialog raceId={race.id} raceName={race.name} seasonYear={seasonYear} open={importOpen} onOpenChange={setImportOpen} />
          <EnterRaceResultsDialog raceId={race.id} raceName={race.name} seasonYear={seasonYear} open={enterOpen} onOpenChange={setEnterOpen} />
        </>
      )}
    </section>
  );
};

const Progress: React.FC<{ label: string; value: number; max: number; title?: string }> = ({ label, value, max, title }) => (
  <div className="min-w-0 rounded-2xl bg-muted/60 p-2.5" title={title}>
    <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-sm font-bold tabular-nums">
      {value}/{max}
    </p>
    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-background" aria-hidden="true">
      <span className={cn('block h-full rounded-full', value >= max ? 'bg-primary' : 'bg-amber-500')} style={{ width: `${max ? Math.round((value / max) * 100) : 0}%` }} />
    </span>
  </div>
);

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const HistoryTab: React.FC<{ raceIds: string[]; coach: boolean }> = ({ raceIds, coach }) => {
  const teamPath = useTeamPath();
  const { data: series = [], isLoading } = useQuery({ queryKey: ['meetSeries'], queryFn: () => meetSeriesService.list() });
  const match = seriesForRaces(series, raceIds);
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['meetSeriesHistory', match?.id],
    queryFn: () => meetSeriesService.history(match!.id),
    enabled: !!match,
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!match) {
    return (
      <Panel>
        <div className="space-y-2 text-sm">
          <p className="font-semibold">Not linked to past years</p>
          <p className="text-muted-foreground">
            {raceIds.length === 0
              ? "A meet joins its series through its races, and this team's races appear once results are imported."
              : 'None of these races belong to a meet series yet.'}
          </p>
          {coach && (
            <Button asChild variant="outline" className="min-h-12 lg:min-h-10">
              <Link to={teamPath('/settings#meet-groups')}>
                <Link2 className="mr-2 h-4 w-4" />
                Link to a meet series
              </Link>
            </Button>
          )}
        </div>
      </Panel>
    );
  }
  if (historyLoading || !history) return <Skeleton className="h-32 w-full" />;
  const showMine = history.rows.some((r) => r.mine);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Meet series: <span className="font-medium text-foreground">{history.groupName}</span> · team averages; years run at a different distance aren't compared.
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        {history.rows.map((row) => (
          <HistoryCard key={`${row.season}-${row.distanceMeters}`} row={row} showMine={showMine} />
        ))}
      </div>
    </div>
  );
};

const Delta: React.FC<{ sec: number | null | undefined }> = ({ sec }) =>
  sec == null ? null : (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
        sec < 0 ? 'bg-primary/10 text-primary' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
      )}
      title={sec < 0 ? 'Faster than the last comparable year' : 'Slower than the last comparable year'}
    >
      {sec < 0 ? '−' : '+'}
      {formatTime(Math.abs(sec))}
    </span>
  );

const HistoryCard: React.FC<{ row: MeetSeriesHistoryRow; showMine: boolean }> = ({ row, showMine }) => (
  <div className={cn('rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border/60', row.mine && 'ring-2 ring-primary/50')}>
    <div className="flex items-baseline gap-2">
      <p className="text-2xl font-bold tabular-nums">{row.season}</p>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
        {row.distanceMeters ? `${row.distanceMeters}m` : row.distanceLabel ?? 'Distance unknown'}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">
        {row.finishers} finisher{row.finishers === 1 ? '' : 's'}
      </span>
    </div>
    <div className={cn('mt-3 grid gap-2', showMine ? 'grid-cols-3' : 'grid-cols-2')}>
      {(['M', 'F'] as const).map((sex) => (
        <div key={sex} className="min-w-0 rounded-2xl bg-muted/60 p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{sex === 'M' ? 'Boys avg' : 'Girls avg'}</p>
          <p className="text-lg font-bold tabular-nums">{row.bySex[sex].avgSec != null ? formatTime(row.bySex[sex].avgSec!) : '—'}</p>
          <Delta sec={row.comparedTo?.deltaSec[sex]} />
        </div>
      ))}
      {showMine && (
        <div className="min-w-0 rounded-2xl bg-primary/10 p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary">You</p>
          <p className="text-lg font-bold tabular-nums">{row.mine ? formatTime(row.mine.timeSec) : '—'}</p>
        </div>
      )}
    </div>
  </div>
);

export default MeetPageNext;
