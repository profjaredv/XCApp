import React, { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardList, Download, Link2, MoreHorizontal, Pencil, Play, Split, Timer, Upload, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
        subtitle={`${formatDateShort(summary.date)}${summary.location ? ` · ${summary.location}` : ''}${summary.isHome != null ? ` · ${summary.isHome ? 'Home' : 'Away'}` : ''}`}
        primary={startTimer}
        primaryDesktopOnly
        overflow={fullCoach ? [{ label: 'Meet details & races', onClick: () => setDetailsOpen(true), icon: Pencil }] : []}
      />
      <div role="tablist" aria-label="Meet" className="mb-4 flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setParams(t.key === 'preview' ? {} : { tab: t.key }, { replace: true })}
            className={cn('min-h-12 border-b-2 px-4 text-sm font-medium', tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {t.label}
          </button>
        ))}
      </div>

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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Races</CardTitle>
        </CardHeader>
        <CardContent>
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
            <ul className="divide-y">
              {races.map((r) => (
                <li key={r.id} className="flex min-h-12 flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => setEditing({ id: r.id, name: r.name, distanceMeters: r.distanceMeters })}
                      className={cn(
                        'min-h-10 rounded-full border px-3 text-sm',
                        r.distanceMeters ? 'border-border' : 'border-dashed border-amber-500 text-amber-700 dark:text-amber-400'
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
        </CardContent>
      </Card>
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
    <span className="w-full text-xs text-muted-foreground sm:w-auto" title="Only goals athletes chose to share with coaches are counted">
      Goals shared: {n}
      {rosterCount ? ` of ${rosterCount}` : ''}
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
    <Card>
      <CardHeader className="space-y-2 pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="min-w-0 flex-1 truncate text-base">{race.name}</CardTitle>
          {next && (
            <Button size="sm" className="min-h-10 shrink-0" onClick={next.run}>
              <next.icon className="mr-1.5 h-4 w-4" />
              {next.label}
            </Button>
          )}
          <button type="button" onClick={() => setMenuOpen(true)} aria-label={`More for ${race.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border hover:bg-accent">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
        {/* The status strip — what's done for this race, at a glance. */}
        <p className="text-sm text-muted-foreground">
          {isLoading ? (
            '…'
          ) : (
            <>
              {finishers.length ? <span className="text-foreground">Results ✓</span> : 'No results yet'}
              {finishers.length > 0 && ` · Splits ${withSplits}/${finishers.length}`}
              {finishers.length > 0 && reflectionsOn && reflections && (
                <span title="Reflections athletes shared with coaches"> · Reflections {reflected}/{finishers.length}</span>
              )}
            </>
          )}
        </p>
      </CardHeader>
      {finishers.length > 0 && (
        <CardContent>
          {scope.athleteIdsInScope && (
            <p className="mb-1 text-xs text-muted-foreground">
              {scope.label}: {shown.length} of {view!.results.length}
            </p>
          )}
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody from {scope.label} ran this race.</p>
          ) : (
            <ol className="divide-y text-sm">
              {shown.map((r) => (
                <li key={r.resultId}>
                  <Link to={teamPath(`/athlete/${r.athleteId}`)} className="flex min-h-11 items-center gap-3 hover:bg-accent/50">
                    <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">{r.place ?? '–'}</span>
                    <span className="min-w-0 flex-1 truncate">{r.athleteName}</span>
                    {r.splits.length > 0 && <Badge variant="outline" className="font-normal">splits</Badge>}
                    <span className="shrink-0 tabular-nums">{r.finishSec != null ? formatTime(r.finishSec) : '—'}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
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
    </Card>
  );
};

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
      <Card>
        <CardContent className="space-y-2 py-6 text-sm">
          <p className="font-medium">Not linked to past years</p>
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
        </CardContent>
      </Card>
    );
  }
  if (historyLoading || !history) return <Skeleton className="h-32 w-full" />;
  const showMine = history.rows.some((r) => r.mine);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Meet series: <span className="font-medium text-foreground">{history.groupName}</span> · team averages; years run at a different distance aren't compared.
      </p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Year</th>
              <th className="px-3 py-2 font-medium">Distance</th>
              <th className="px-3 py-2 text-right font-medium">Finishers</th>
              <th className="px-3 py-2 text-right font-medium">Boys avg</th>
              <th className="px-3 py-2 text-right font-medium">Girls avg</th>
              {showMine && <th className="px-3 py-2 text-right font-medium">You</th>}
            </tr>
          </thead>
          <tbody>
            {history.rows.map((row) => (
              <HistoryRow key={`${row.season}-${row.distanceMeters}`} row={row} showMine={showMine} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Delta: React.FC<{ sec: number | null | undefined }> = ({ sec }) =>
  sec == null ? null : (
    <span className={cn('block text-xs', sec < 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400')}>
      {sec < 0 ? '−' : '+'}
      {formatTime(Math.abs(sec))}
    </span>
  );

const HistoryRow: React.FC<{ row: MeetSeriesHistoryRow; showMine: boolean }> = ({ row, showMine }) => (
  <tr className={cn('border-t', row.mine && 'bg-primary/5')}>
    <td className="px-3 py-2.5 font-medium">{row.season}</td>
    <td className="px-3 py-2.5">{row.distanceMeters ? `${row.distanceMeters}m` : row.distanceLabel ?? 'Unknown'}</td>
    <td className="px-3 py-2.5 text-right tabular-nums">{row.finishers}</td>
    {(['M', 'F'] as const).map((sex) => (
      <td key={sex} className="px-3 py-2.5 text-right tabular-nums">
        {row.bySex[sex].avgSec != null ? formatTime(row.bySex[sex].avgSec!) : '—'}
        <Delta sec={row.comparedTo?.deltaSec[sex]} />
      </td>
    ))}
    {showMine && <td className="px-3 py-2.5 text-right font-medium tabular-nums">{row.mine ? formatTime(row.mine.timeSec) : '—'}</td>}
  </tr>
);

export default MeetPageNext;
