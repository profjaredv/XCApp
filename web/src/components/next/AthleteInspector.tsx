import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Eye, Map as MapIcon, Compass, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useFeatureEnabled } from '@/hooks/useTeamFeatures';
import { useAthleteSplits } from '@/hooks/useSplits';
import { athleteService } from '@/api/athleteService';
import { raceReflectionService } from '@/api/raceReflectionService';
import { isFullCoach } from '@/lib/teamRole';
import { setPreviewAthlete } from '@/lib/impersonation';
import { formatDateShort, formatTime } from '@/lib/formatUtils';
import { formatFiveK } from '@/lib/fiveK';
import { gradeLabel } from '@/lib/seasonUtils';
import { formatSplitMMSS, SPLIT_PATTERN_LABEL } from '@/lib/splitPatternDisplay';
import type { AthleteListRow } from '@/lib/athletesList';
import { cn } from '@/lib/utils';
import { AthleteGroupsCard } from '../AthleteGroupsCard';
import { RacePredictionCard } from '../predictions/RacePredictionCard';
import { AthleteAdminPanel } from '../athletes/AthleteAdminPanel';

// The Athletes inspector (docs/leadpack-new-ui-trial.md §4.4): a detail
// panel at ≥1280px, beside the list, keyed by ?athlete=. Everything in it
// is an existing component or endpoint; AthleteDetailModal isn't used.

type Tab = 'summary' | 'races' | 'reflections' | 'admin';

export const AthleteInspector: React.FC<{ athlete: AthleteListRow; season: number | undefined; onClose: () => void }> = ({
  athlete,
  season,
  onClose,
}) => {
  const { currentUser } = useAuth();
  const teamPath = useTeamPath();
  const fullCoach = isFullCoach(currentUser);
  const reflectionsOn = useFeatureEnabled('reflections');
  const [tab, setTab] = useState<Tab>('summary');
  const tabs: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'races', label: 'Races' },
    ...(reflectionsOn ? [{ key: 'reflections' as Tab, label: 'Goals & reflections' }] : []),
    ...(fullCoach ? [{ key: 'admin' as Tab, label: 'Admin' }] : []),
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-2 border-b p-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{athlete.name}</h2>
          <p className="text-sm text-muted-foreground">
            {athlete.grade != null ? gradeLabel(athlete.grade) : 'Class unknown'}
            {athlete.isCaptain ? ' · Captain' : ''}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-accent">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 border-b px-4 py-2">
        <Button asChild variant="outline" size="sm">
          <Link to={teamPath(`/athlete/${athlete.id}/journey`)}>
            <MapIcon className="mr-1.5 h-4 w-4" /> Journey
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={teamPath(`/athlete/${athlete.id}/strategy`)}>
            <Compass className="mr-1.5 h-4 w-4" /> Strategy
          </Link>
        </Button>
        {fullCoach && (
          <Button variant="outline" size="sm" onClick={() => setPreviewAthlete(athlete.id, athlete.name, teamPath)}>
            <Eye className="mr-1.5 h-4 w-4" /> Preview as athlete
          </Button>
        )}
      </div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b px-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'h-11 shrink-0 border-b-2 px-3 text-sm font-medium',
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {tab === 'summary' && <SummaryTab athlete={athlete} />}
        {tab === 'races' && <RacesTab athleteId={athlete.id} />}
        {tab === 'reflections' && <ReflectionsTab athleteId={athlete.id} />}
        {tab === 'admin' && season != null && <AthleteAdminPanel athleteId={athlete.id} season={season} />}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-lg bg-muted/50 p-3">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold tabular-nums">{value}</p>
  </div>
);

const SummaryTab: React.FC<{ athlete: AthleteListRow }> = ({ athlete }) => (
  <>
    <div className="grid grid-cols-3 gap-2">
      <Stat label="SB 5K" value={formatFiveK(athlete.sb)} />
      <Stat label="PR 5K" value={formatFiveK(athlete.pr)} />
      <Stat label="Races" value={athlete.races} />
    </div>
    <RacePredictionCard athleteId={athlete.id} />
    <AthleteGroupsCard athleteId={athlete.id} />
  </>
);

const RacesTab: React.FC<{ athleteId: string }> = ({ athleteId }) => {
  const { data: races = [], isLoading } = useQuery({
    queryKey: ['athleteRaces', athleteId, 30],
    queryFn: () => athleteService.getRecentRaces(athleteId, 30),
  });
  const { data: splits = [] } = useAthleteSplits(athleteId);
  const splitsByRace = new Map(splits.filter((s) => s.segments.length > 0).map((s) => [s.raceId, s]));

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading races…</p>;
  if (races.length === 0) return <p className="text-sm text-muted-foreground">No races on record yet.</p>;
  return (
    <ul className="divide-y">
      {races.map((r) => {
        const s = splitsByRace.get(r.raceId);
        return (
          <li key={r.id} className="py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium">{r.raceName}</p>
              <p className="shrink-0 text-sm tabular-nums">{formatTime(r.time)}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDateShort(r.date)}
              {s?.analysis ? ` · ${SPLIT_PATTERN_LABEL[s.analysis.pattern]}` : ''}
            </p>
            {s && (
              <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {s.segments.map((seg) => (
                  <span key={seg.sequence}>
                    {seg.isClosing ? 'Final' : `Seg ${seg.sequence}`} {formatSplitMMSS(seg.segmentSec)}
                  </span>
                ))}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
};

const ReflectionsTab: React.FC<{ athleteId: string }> = ({ athleteId }) => {
  const { data: races = [] } = useQuery({
    queryKey: ['athleteRaces', athleteId, 30],
    queryFn: () => athleteService.getRecentRaces(athleteId, 30),
  });
  const recent = races.slice(0, 10);
  // Coach-visible reflections are per race; only what the athlete chose to
  // share comes back (routes/raceReflections.js).
  const results = useQueries({
    queries: recent.map((r) => ({
      queryKey: ['raceReflections', r.raceId],
      queryFn: () => raceReflectionService.getForRace(r.raceId),
    })),
  });
  const mine = recent
    .map((r, i) => ({ race: r, reflection: results[i]?.data?.find((x) => x.athleteId === athleteId) }))
    .filter((x) => x.reflection);
  const loading = results.some((q) => q.isLoading);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (mine.length === 0) return <p className="text-sm text-muted-foreground">No goals or reflections shared with coaches yet.</p>;
  return (
    <ul className="space-y-3">
      {mine.map(({ race, reflection }) => (
        <li key={race.id} className="rounded-lg border p-3 text-sm">
          <p className="font-medium">{race.raceName}</p>
          <p className="mb-1 text-xs text-muted-foreground">{formatDateShort(race.date)} · ran {formatTime(race.time)}</p>
          {(reflection!.outcomeGoal || reflection!.targetTimeSec) && (
            <p>
              <span className="text-muted-foreground">Goal: </span>
              {[reflection!.outcomeGoal, reflection!.targetTimeSec ? formatTime(reflection!.targetTimeSec) : null].filter(Boolean).join(' · ')}
            </p>
          )}
          {reflection!.processGoal && (
            <p>
              <span className="text-muted-foreground">Process: </span>
              {reflection!.processGoal}
            </p>
          )}
          {reflection!.whatWorked && (
            <p>
              <span className="text-muted-foreground">Worked: </span>
              {reflection!.whatWorked}
            </p>
          )}
          {reflection!.whatDidnt && (
            <p>
              <span className="text-muted-foreground">Didn't: </span>
              {reflection!.whatDidnt}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
};
