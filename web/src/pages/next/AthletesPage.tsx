import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, Download, RefreshCw, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useGroupScope } from '@/contexts/GroupScopeContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { performanceService } from '@/api/performanceService';
import { isFullCoach } from '@/lib/teamRole';
import { matchesQuery } from '@/lib/athleteSearch';
import { normalizeGender } from '@/lib/gender';
import { gradeLabelShort, gradeLabel } from '@/lib/seasonUtils';
import { formatFiveK } from '@/lib/fiveK';
import { toCsv, downloadCsv } from '@/lib/csvParse';
import { sortAthleteRows, type AthleteListRow, type AthleteSort } from '@/lib/athletesList';
import { useAthleteRows } from '@/components/next/useAthleteRows';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/next/Visual';
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

  const { rows, isLoading, season, activeYear } = useAthleteRows(includePast);
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
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search athletes" aria-label="Search athletes" className="h-12 rounded-full border-none bg-muted pl-10 text-base shadow-none lg:h-10 lg:text-sm" />
            </div>
            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
              {(['all', 'M', 'F'] as const).map((g) => (
                <Chip key={g} active={gender === g} onClick={() => setGender(g)}>
                  {g === 'all' ? 'All' : g === 'M' ? 'Boys' : 'Girls'}
                </Chip>
              ))}
              <span className="mx-1 w-px shrink-0 self-stretch bg-border" />
              <Chip active={grade === 'all'} onClick={() => setGrade('all')}>
                All classes
              </Chip>
              {grades.map((g) => (
                <Chip key={g} active={grade === g} onClick={() => setGrade(grade === g ? 'all' : g)}>
                  {gradeLabelShort(g)}
                </Chip>
              ))}
              <span className="mx-1 w-px shrink-0 self-stretch bg-border" />
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
          <aside className="sticky top-0 h-[calc(100dvh-8rem)] w-[420px] shrink-0 overflow-y-auto rounded-3xl bg-card shadow-sm ring-1 ring-border/60">
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
      'inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium lg:min-h-8',
      active ? 'bg-foreground text-background' : 'bg-muted text-foreground hover:bg-accent'
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
  <div className="hidden overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border/60 lg:block">
    <table className="w-full text-sm">
      <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
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
            className={cn('cursor-pointer border-t border-border/60 hover:bg-muted/60', selectedId === r.id && 'bg-primary/5')}
          >
            <td className="px-3 py-2">
              <span className="flex items-center gap-3">
                <Avatar name={r.name} size="sm" />
                <span className="font-medium">{r.name}</span>
                {r.isCaptain && <Badge variant="secondary" className="font-normal">Captain</Badge>}
                {!r.onRoster && <span className="text-xs text-muted-foreground">past</span>}
              </span>
            </td>
            <td className="px-3 py-2.5">{r.grade != null ? gradeLabelShort(r.grade) : '—'}</td>
            <td className="max-w-[16rem] truncate px-3 py-2.5 text-muted-foreground">{r.groups.map((g) => g.name).join(', ') || '—'}</td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">{formatFiveK(r.sb)}</td>
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
  <div className="rounded-3xl bg-card p-1.5 shadow-sm ring-1 ring-border/60 lg:hidden">
    {rows.map((r) => (
      <button key={r.id} type="button" onClick={() => onSelect(r.id)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left hover:bg-accent/60">
        <Avatar name={r.name} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{r.name}</span>
            {r.isCaptain && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">C</span>}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {r.grade != null ? gradeLabel(r.grade) : 'Class unknown'}
            {r.groups[0] ? ` · ${r.groups[0].name}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-base font-bold tabular-nums">{formatFiveK(r.sb)}</span>
          <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">SB 5K</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    ))}
  </div>
);

export default AthletesPage;
