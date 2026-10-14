import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, Download, RefreshCw, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useGroupScope } from '@/contexts/GroupScopeContext';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useAllGroupMembers, useGroups } from '@/hooks/useGroups';
import { rosterService } from '@/api/rosterService';
import { analyticsService } from '@/api/analyticsService';
import { performanceService } from '@/api/performanceService';
import { isFullCoach } from '@/lib/teamRole';
import { matchesQuery } from '@/lib/athleteSearch';
import { normalizeGender } from '@/lib/gender';
import { gradeLabelShort, gradeLabel } from '@/lib/seasonUtils';
import { formatFiveK } from '@/lib/fiveK';
import { toCsv, downloadCsv } from '@/lib/csvParse';
import { buildAthleteRows, sortAthleteRows, type AthleteListRow, type AthleteSort } from '@/lib/athletesList';
import { cn } from '@/lib/utils';
import { NextPageHeader } from '@/components/next/PageHeader';
import { AddAthleteDialog } from '@/components/roster/AddAthleteDialog';
import { AthleteInspector } from '@/components/next/AthleteInspector';
import { useMediaQuery } from '@/components/next/useMediaQuery';

// Athletes (docs/leadpack-new-ui-trial.md §4.4): one list, replacing the
// overlap between Roster and Season → Athletes. Starts from the season
// roster, so every rostered athlete appears whether or not they've raced;
// the Athletes-tab metrics are merged in by athlete id, client-side.
// Roster administration stays in Setup (/roster).

const AthletesPage: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const scope = useGroupScope();
  const { seasons, activeYear } = useSeasonSelection();
  const season = activeYear ?? undefined;
  const seasonId = seasons.find((s) => s.year === activeYear)?.id ?? null;
  const wide = useMediaQuery('(min-width: 1280px)');
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('athlete');

  const [query, setQuery] = useState('');
  const [gender, setGender] = useState<'all' | 'M' | 'F'>('all');
  const [grade, setGrade] = useState<'all' | number>('all');
  const [includePast, setIncludePast] = useState(false);
  const [sort, setSort] = useState<AthleteSort>('name');
  const [addOpen, setAddOpen] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const fullCoach = isFullCoach(currentUser);

  const { data: roster = [], isLoading } = useQuery({
    queryKey: ['roster', season, includePast],
    queryFn: () => rosterService.getRoster(season, { activeOnly: !includePast }),
    enabled: season !== undefined,
  });
  const { data: analytics } = useQuery({
    queryKey: ['analyticsOverview', season],
    queryFn: () => analyticsService.getAnalyticsOverview(season as number),
    enabled: season !== undefined,
  });
  const { data: groups = [] } = useGroups(seasonId);
  const groupIds = useMemo(() => groups.filter((g) => !g.archived && g.type !== 'X_TRAINING').map((g) => g.id), [groups]);
  const { data: membersByGroup } = useAllGroupMembers(seasonId, groupIds);

  const rows = useMemo(
    () => buildAthleteRows(roster, analytics?.athletes ?? [], groups, membersByGroup ?? {}),
    [roster, analytics, groups, membersByGroup]
  );
  const grades = useMemo(() => [...new Set(rows.map((r) => r.grade).filter((g): g is number => g != null))].sort((a, b) => b - a), [rows]);
  const visible = useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        (!scope.athleteIdsInScope || scope.athleteIdsInScope.has(r.id)) &&
        (gender === 'all' || normalizeGender(r.gender) === gender) &&
        (grade === 'all' || r.grade === grade) &&
        matchesQuery(`${r.name} ${r.legalName}`, query)
    );
    return sortAthleteRows(filtered, sort);
  }, [rows, scope.athleteIdsInScope, gender, grade, query, sort]);

  // A link shared from a wide screen (?athlete=) opens the athlete page on
  // a narrow one rather than an inspector that has no room.
  useEffect(() => {
    if (selectedId && !wide) navigate(teamPath(`/athlete/${selectedId}`), { replace: true });
  }, [selectedId, wide, navigate, teamPath]);

  const select = (id: string) => {
    if (wide) setParams(selectedId === id ? {} : { athlete: id }, { replace: true });
    else navigate(teamPath(`/athlete/${id}`));
  };

  const recalc = async () => {
    const teamId = currentUser?.team?.id;
    if (!teamId || !season) return;
    setRecalculating(true);
    try {
      await performanceService.recalculateMetrics(teamId, season);
      queryClient.invalidateQueries({ queryKey: ['analyticsOverview'] });
      toast.success('Metrics recalculated.');
    } catch {
      toast.error('Could not recalculate metrics.');
    } finally {
      setRecalculating(false);
    }
  };

  const exportCsv = () => {
    const headers = ['Name', 'Class', 'Gender', 'Groups', 'SB 5K', 'PR 5K', 'Races'];
    const data = visible.map((r) => ({
      Name: r.name,
      Class: r.grade != null ? gradeLabel(r.grade) : '',
      Gender: r.gender ?? '',
      Groups: r.groups.map((g) => g.name).join('; '),
      'SB 5K': r.sb ? formatFiveK(r.sb) : '',
      'PR 5K': r.pr ? formatFiveK(r.pr) : '',
      Races: String(r.races),
    }));
    downloadCsv(`athletes-${season ?? 'season'}.csv`, toCsv(headers, data));
  };

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className={cn('mx-auto', wide && selected ? 'max-w-none' : 'max-w-6xl')}>
      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          <NextPageHeader
            title="Athletes"
            subtitle={`${visible.length} of ${rows.length}${activeYear ? ` · ${activeYear}` : ''}`}
            primary={
              fullCoach && (
                <Button onClick={() => setAddOpen(true)} className="min-h-12 lg:min-h-10">
                  <UserPlus className="mr-1 h-4 w-4" />
                  Add athlete
                </Button>
              )
            }
            overflow={[
              ...(fullCoach ? [{ label: 'Manage roster', to: teamPath('/roster'), icon: ClipboardList }] : []),
              ...(fullCoach ? [{ label: recalculating ? 'Recalculating…' : 'Recalculate metrics', onClick: recalc, icon: RefreshCw, disabled: recalculating }] : []),
              { label: 'Export this list (CSV)', onClick: exportCsv, icon: Download },
            ]}
          />

          <div className="mb-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search athletes" aria-label="Search athletes" className="h-12 pl-9 text-base lg:h-10 lg:text-sm" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'M', 'F'] as const).map((g) => (
                <Chip key={g} active={gender === g} onClick={() => setGender(g)}>
                  {g === 'all' ? 'All' : g === 'M' ? 'Boys' : 'Girls'}
                </Chip>
              ))}
              <span className="mx-1 w-px self-stretch bg-border" />
              <Chip active={grade === 'all'} onClick={() => setGrade('all')}>
                All classes
              </Chip>
              {grades.map((g) => (
                <Chip key={g} active={grade === g} onClick={() => setGrade(grade === g ? 'all' : g)}>
                  {gradeLabelShort(g)}
                </Chip>
              ))}
              <span className="mx-1 w-px self-stretch bg-border" />
              <Chip active={includePast} onClick={() => setIncludePast((v) => !v)}>
                Include past athletes
              </Chip>
              <Chip active={sort === 'sb'} onClick={() => setSort(sort === 'sb' ? 'name' : 'sb')}>
                Sort: {sort === 'sb' ? 'SB' : 'Name'}
              </Chip>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nobody is on the {activeYear} roster yet.</p>
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No athlete matches these filters.</p>
          ) : (
            <>
              <AthleteTable rows={visible} selectedId={selectedId} onSelect={select} />
              <AthleteRowsMobile rows={visible} onSelect={select} />
            </>
          )}
        </div>

        {wide && selected && (
          <aside className="sticky top-0 h-[calc(100dvh-8rem)] w-[420px] shrink-0 overflow-y-auto rounded-xl border bg-card">
            <AthleteInspector athlete={selected} season={season} onClose={() => setParams({}, { replace: true })} />
          </aside>
        )}
      </div>

      <AddAthleteDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        season={season}
        onAdded={() => queryClient.invalidateQueries({ queryKey: ['roster'] })}
      />
    </div>
  );
};

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      'inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-medium lg:min-h-8',
      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent'
    )}
  >
    {children}
  </button>
);

const Trend: React.FC<{ value: number | null }> = ({ value }) =>
  value == null || Math.abs(value) < 0.5 ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <span
      className={value > 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}
      title="First race to latest race this season"
    >
      {value > 0 ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  );

const AthleteTable: React.FC<{ rows: AthleteListRow[]; selectedId: string | null; onSelect: (id: string) => void }> = ({ rows, selectedId, onSelect }) => (
  <div className="hidden overflow-hidden rounded-xl border lg:block">
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
        <tr>
          <th className="px-3 py-2 font-medium">Name</th>
          <th className="px-3 py-2 font-medium">Class</th>
          <th className="px-3 py-2 font-medium">Groups</th>
          <th className="px-3 py-2 text-right font-medium">SB 5K</th>
          <th className="px-3 py-2 text-right font-medium">PR 5K</th>
          <th className="px-3 py-2 text-right font-medium">Races</th>
          <th className="px-3 py-2 text-right font-medium">Trend</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            onClick={() => onSelect(r.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(r.id)}
            tabIndex={0}
            aria-selected={selectedId === r.id}
            className={cn('cursor-pointer border-t hover:bg-muted/60', selectedId === r.id && 'bg-muted')}
          >
            <td className="px-3 py-2.5">
              <span className="font-medium">{r.name}</span>
              {r.isCaptain && <Badge variant="secondary" className="ml-2 font-normal">Captain</Badge>}
              {!r.onRoster && <span className="ml-2 text-xs text-muted-foreground">past</span>}
            </td>
            <td className="px-3 py-2.5">{r.grade != null ? gradeLabelShort(r.grade) : '—'}</td>
            <td className="max-w-[16rem] truncate px-3 py-2.5 text-muted-foreground">{r.groups.map((g) => g.name).join(', ') || '—'}</td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatFiveK(r.sb)}</td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatFiveK(r.pr)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{r.races}</td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"><Trend value={r.trend} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const AthleteRowsMobile: React.FC<{ rows: AthleteListRow[]; onSelect: (id: string) => void }> = ({ rows, onSelect }) => (
  <div className="divide-y rounded-xl border lg:hidden">
    {rows.map((r) => (
      <button key={r.id} type="button" onClick={() => onSelect(r.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/50">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {r.name}
            {r.isCaptain && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· Captain</span>}
          </span>
          <span className="block text-xs text-muted-foreground">{r.grade != null ? gradeLabel(r.grade) : 'Class unknown'}</span>
        </span>
        <span className="shrink-0 text-right text-sm tabular-nums">
          <span className="block text-[10px] uppercase text-muted-foreground">SB 5K</span>
          {formatFiveK(r.sb)}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    ))}
  </div>
);

export default AthletesPage;
