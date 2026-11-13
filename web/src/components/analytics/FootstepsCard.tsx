import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Footprints } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { footstepsService, type Footsteps } from '@/api/footstepsService';
import { gradeLabel, gradeLabelShort } from '@/lib/seasonUtils';

// Footsteps: the runners this program has had who ran like this athlete at
// the same grade, and what they went on to run.
//
// Built from the team's own history, not a formula. Everything is computed
// on the server (backend/lib/footsteps.js) and comes with its count and its
// range; below three matches there is no projection at all. A coach sees
// who the matches are. An athlete or a parent sees "Class of 2022" — the
// server never sends them another student's name.
//
// The chart follows the app's one rule for time axes: faster sits lower.

const clock = (sec: number | null | undefined) => {
  if (sec == null) return '—';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const gradeWord = (grade: number) => gradeLabel(grade).toLowerCase();

const EMPTY: Partial<Record<Footsteps['status'], string>> = {
  'no-class-year': 'Add a graduation year for this athlete and Footsteps can compare them with past runners at the same grade.',
  'no-races': 'Footsteps starts after a first finished race near 5K.',
  'no-matches':
    'No one in this program’s loaded seasons ran close to this at the same grade and then raced a later season. Loading earlier seasons gives Footsteps more runners to compare with.',
  'final-year': 'This is the last season on the path, so there is nothing ahead to project. This athlete is now one of the runners future teammates will be compared with.',
};

export const FootstepsCard: React.FC<{ athleteId: string }> = ({ athleteId }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['footsteps', athleteId],
    queryFn: () => footstepsService.get(athleteId),
    enabled: !!athleteId,
    staleTime: 1000 * 60 * 5,
  });

  const chart = useMemo(() => {
    if (!data?.self) return { rows: [], grades: [] as number[] };
    const byGrade = new Map<number, Record<string, number | null>>();
    const row = (grade: number) => {
      if (!byGrade.has(grade)) byGrade.set(grade, { grade });
      return byGrade.get(grade)!;
    };
    data.matches.forEach((m, i) => m.path.forEach((p) => (row(p.grade)[`m${i}`] = p.fiveKSec)));
    data.self.path.forEach((p) => (row(p.grade).me = p.fiveKSec));
    // The projection continues from the athlete's own latest point.
    row(data.self.fromGrade).projected = data.self.fiveKSec;
    data.projection.forEach((p) => (row(p.grade).projected = p.fiveKSec));
    const rows = [...byGrade.values()].sort((a, b) => (a.grade as number) - (b.grade as number));
    return { rows, grades: rows.map((r) => r.grade as number) };
  }, [data]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) return null;

  const { self, matches, projection, summary, status } = data;
  const last = projection[projection.length - 1];
  const first = data.athlete.name.split(' ')[0];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Footprints className="h-4 w-4 text-primary" />
          Footsteps
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {EMPTY[status] ? (
          <p className="text-sm text-muted-foreground">{EMPTY[status]}</p>
        ) : (
          self &&
          summary && (
            <>
              <p className="text-sm">
                <span className="font-semibold">
                  {summary.matchCount} runner{summary.matchCount === 1 ? '' : 's'}
                </span>{' '}
                from this program ran within {summary.toleranceSec}s per mile of {first} as{' '}
                {gradeWord(self.fromGrade) === 'unknown' ? `grade ${self.fromGrade}` : `a ${gradeWord(self.fromGrade)}`}.
                {summary.matchCount > 0 && (
                  <>
                    {' '}
                    {summary.improvedCount} of them got faster afterwards
                    {summary.medianGainSec != null && summary.medianGainSec > 0 && <>, by a median {clock(summary.medianGainSec)} over 5K</>}.
                  </>
                )}
              </p>

              {last ? (
                <div className="rounded-xl bg-primary/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    In their footsteps, by {gradeWord(last.grade)} year
                  </p>
                  <p className="mt-1 text-4xl font-bold tabular-nums leading-none">{clock(last.fiveKSec)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Now {clock(self.fiveKSec)}. From the same starting point, those runners ran between{' '}
                    <span className="font-medium text-foreground tabular-nums">{clock(last.fastestFiveKSec)}</span> and{' '}
                    <span className="font-medium text-foreground tabular-nums">{clock(last.slowestFiveKSec)}</span>. Based on{' '}
                    {last.basedOn} runners.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  That is too few to project from. Footsteps needs three runners with a later season before it puts a time on it.
                </p>
              )}

              {chart.rows.length > 1 && (
                <div className="h-56" aria-label="5K season bests by grade: this athlete, the matched runners, and the projection">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart.rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="grade" tickFormatter={(g) => gradeLabelShort(Number(g)) || String(g)} />
                      <YAxis width={52} tickFormatter={(v) => clock(Number(v))} domain={['dataMin - 20', 'dataMax + 20']} />
                      <Tooltip
                        labelFormatter={(g) => gradeLabel(Number(g))}
                        formatter={(value: number | string, name: string) => {
                          const i = name.startsWith('m') && name !== 'me' ? Number(name.slice(1)) : -1;
                          const label = name === 'me' ? first : name === 'projected' ? 'Projected' : matches[i]?.label ?? name;
                          return [clock(Number(value)), label];
                        }}
                      />
                      {matches.map((m, i) => (
                        <Line
                          key={`m${i}`}
                          type="monotone"
                          dataKey={`m${i}`}
                          stroke="var(--muted-foreground)"
                          strokeOpacity={0.45}
                          strokeWidth={1.5}
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      ))}
                      <Line type="monotone" dataKey="projected" stroke="var(--primary)" strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                      <Line type="monotone" dataKey="me" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {matches.length > 0 && (
                <ul className="divide-y text-sm">
                  {matches.map((m, i) => (
                    <li key={m.athleteId ?? `${m.label}-${i}`} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate font-medium">{m.label}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {clock(m.atGrade.fiveKSec)} → <span className="font-semibold text-foreground">{clock(m.best.fiveKSec)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-xs text-muted-foreground">
                Season bests from races near 5K. Courses differ from year to year, and nobody’s path is a promise.
                {!data.namesShown && ' Other runners are shown by class year only.'}
              </p>
            </>
          )
        )}
      </CardContent>
    </Card>
  );
};

export default FootstepsCard;
