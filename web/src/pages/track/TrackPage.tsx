import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { trackService, type TrackGender } from '@/api/trackService';
import { BrowserEventProgressImportPanel } from '@/components/track/BrowserEventProgressImportPanel';
import { formatMeetDate, formatResult } from '@/lib/trackFormat';
import { useTeamPath } from '@/hooks/useTeamRoute';

// Track & Field for a coach: this season's leaders by event, points by
// event across seasons, the meets behind them, and the import that fills
// it all. A track season exists once results are imported for it, so a
// team with nothing yet lands on Import.

const GENDERS: Array<{ value: TrackGender; label: string }> = [
  { value: 'M', label: 'Boys' },
  { value: 'F', label: 'Girls' },
];

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-sm text-muted-foreground">{children}</p>;

const Leaders: React.FC<{ year: number; gender: TrackGender }> = ({ year, gender }) => {
  const teamPath = useTeamPath();
  const { data, isLoading } = useQuery({ queryKey: ['track', 'leaders', year, gender], queryFn: () => trackService.getLeaders(year, gender) });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <Empty>No marks for this group in {year} yet.</Empty>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map(({ event, leaders }) => (
        <Card key={event.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{event.name}</CardTitle>
            <CardDescription>
              {leaders.length} athlete{leaders.length === 1 ? '' : 's'} with a mark
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1 text-sm">
              {leaders.slice(0, 8).map((r, i) => (
                <li key={r.id} className="flex items-baseline gap-2">
                  <span className="w-5 shrink-0 text-right text-muted-foreground">{i + 1}</span>
                  <Link to={teamPath(`/track/athlete/${r.athleteId}`)} className="min-w-0 flex-1 truncate hover:underline">
                    {r.athleteName}
                    {r.grade ? <span className="text-muted-foreground"> · {r.grade}</span> : null}
                  </Link>
                  <span className="shrink-0 font-semibold tabular-nums">{formatResult(r, event.unit)}</span>
                </li>
              ))}
            </ol>
            {leaders.length > 8 && <p className="mt-2 text-xs text-muted-foreground">and {leaders.length - 8} more</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const Points: React.FC<{ gender: TrackGender }> = ({ gender }) => {
  const { data, isLoading } = useQuery({ queryKey: ['track', 'points', gender], queryFn: () => trackService.getPoints(gender) });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.events.length) return <Empty>No results imported for this group yet.</Empty>;
  const totals = data.seasons.map((s) => data.events.reduce((sum, e) => sum + (e.bySeason[s]?.points ?? 0), 0));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Points by event</CardTitle>
        <CardDescription>
          Places in finals, scored {data.table.join('-')} for the top {data.table.length}. That table is an assumption: meets score
          differently, so read this as where the team places, not as official meet scores. The small number is how many athletes scored.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Event</th>
              {data.seasons.map((s) => (
                <th key={s} className="px-2 py-2 text-right font-medium">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.events.map(({ event, bySeason }) => (
              <tr key={event.id} className="border-b last:border-0">
                <td className="py-1.5 pr-4">{event.name}</td>
                {data.seasons.map((s) => {
                  const cell = bySeason[s];
                  return (
                    <td key={s} className="px-2 py-1.5 text-right tabular-nums">
                      {cell ? (
                        <>
                          <span className={cell.points ? 'font-semibold' : 'text-muted-foreground'}>{cell.points}</span>
                          <span className="ml-1 text-xs text-muted-foreground">({cell.scorers})</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2 pr-4">Total</td>
              {totals.map((t, i) => (
                <td key={data.seasons[i]} className="px-2 py-2 text-right tabular-nums">
                  {t}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

const Meets: React.FC<{ year: number }> = ({ year }) => {
  const { data, isLoading } = useQuery({ queryKey: ['track', 'meets', year], queryFn: () => trackService.getMeets(year) });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <Empty>No meets imported for {year} yet.</Empty>;
  return (
    <Card>
      <CardContent className="divide-y p-0">
        {data.map((m) => (
          <div key={m.id} className="flex items-baseline gap-3 px-4 py-3 text-sm">
            <span className="w-28 shrink-0 text-muted-foreground">{formatMeetDate(m.date)}</span>
            <span className="min-w-0 flex-1 truncate">
              {m.sourceUrl ? (
                <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  {m.name}
                </a>
              ) : (
                m.name
              )}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {m.resultCount} result{m.resultCount === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

const TrackPage: React.FC = () => {
  const { data: seasons, isLoading } = useQuery({ queryKey: ['track', 'seasons'], queryFn: () => trackService.getSeasons() });
  const [year, setYear] = useState<number | null>(null);
  const [gender, setGender] = useState<TrackGender>('M');
  const [tab, setTab] = useState<string | null>(null);
  const [importYear, setImportYear] = useState(String(new Date().getFullYear()));

  const hasData = Boolean(seasons?.length);
  useEffect(() => {
    if (!seasons) return;
    if (seasons.length && (year == null || !seasons.some((s) => s.year === year))) setYear(seasons[0].year);
    if (tab == null) setTab(seasons.length ? 'leaders' : 'import');
  }, [seasons, year, tab]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <PageHeader section="neutral" icon={Activity} title="Track & Field" description="Event leaders, points by event, and every meet you've imported." />

      {isLoading || tab == null ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-wrap items-center gap-3">
            <TabsList>
              <TabsTrigger value="leaders" disabled={!hasData}>
                Leaders
              </TabsTrigger>
              <TabsTrigger value="points" disabled={!hasData}>
                Points
              </TabsTrigger>
              <TabsTrigger value="meets" disabled={!hasData}>
                Meets
              </TabsTrigger>
              <TabsTrigger value="import">Import</TabsTrigger>
            </TabsList>
            {hasData && tab !== 'import' && (
              <div className="flex flex-wrap items-center gap-2">
                {tab !== 'meets' &&
                  GENDERS.map((g) => (
                    <Button key={g.value} type="button" size="sm" variant={gender === g.value ? 'default' : 'outline'} onClick={() => setGender(g.value)}>
                      {g.label}
                    </Button>
                  ))}
                {tab !== 'points' && (
                  <select
                    aria-label="Season"
                    value={year ?? ''}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {seasons!.map((s) => (
                      <option key={s.year} value={s.year}>
                        {s.year} Outdoor
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          <TabsContent value="leaders" className="mt-4">
            {year != null && <Leaders year={year} gender={gender} />}
          </TabsContent>
          <TabsContent value="points" className="mt-4">
            <Points gender={gender} />
          </TabsContent>
          <TabsContent value="meets" className="mt-4">
            {year != null && <Meets year={year} />}
          </TabsContent>
          <TabsContent value="import" className="mt-4 space-y-4">
            {!hasData && <Empty>Nothing imported yet. Bring in a season from Athletic.net to get started.</Empty>}
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="track-import-year" className="font-medium">
                Season to import
              </label>
              <Input id="track-import-year" type="number" value={importYear} onChange={(e) => setImportYear(e.target.value)} className="w-28" />
            </div>
            <BrowserEventProgressImportPanel season={importYear} onComplete={() => setYear(Number(importYear))} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default TrackPage;
