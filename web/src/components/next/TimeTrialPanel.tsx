import React, { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useGroupScope } from '@/contexts/GroupScopeContext';
import { formatPace } from '@/lib/formatUtils';
import { buildTimeTrialFitness, type TimeTrialRow } from '@/lib/timeTrial';
import { cn } from '@/lib/utils';
import { Panel, SectionHeading, Stat } from './Visual';
import { useResultsGrid } from './useResultsGrid';

// Time trial vs race pace. The 1 mile time trial is every athlete's common
// starting line; when their average pace over 2 mile and up closes in on that
// mile pace, they are fundamentally fitter. See lib/timeTrial.ts.

const secs = (s: number) => `${s > 0 ? '+' : s < 0 ? '−' : ''}${Math.round(Math.abs(s))}s/mi`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const Chip: React.FC<{ tone?: 'good' | 'plain'; children: React.ReactNode; title?: string }> = ({ tone = 'plain', children, title }) => (
  <span title={title} className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', tone === 'good' ? 'bg-primary/10 text-primary' : 'bg-muted')}>
    {children}
  </span>
);

const Row: React.FC<{ r: TimeTrialRow }> = ({ r }) => (
  <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-2.5 py-2.5">
    <span className="min-w-0 flex-1">
      <span className="block truncate font-semibold">{r.name}</span>
      <span className="block text-xs text-muted-foreground tabular-nums">
        Mile {formatPace(r.tt.pace)} → races {formatPace(r.avgRacePace)} avg ({r.races.length})
      </span>
    </span>
    <span className="flex flex-wrap justify-end gap-1">
      {r.matched && <Chip tone="good" title="Their latest race of 2 miles or more was at or under their time trial mile pace">Matched mile pace</Chip>}
      {r.narrowed != null && r.narrowed > 0 && <Chip tone="good" title="How much the gap to the mile closed from their first distance race to their latest">Closed {Math.round(r.narrowed)}s</Chip>}
      {r.retest && r.retest.pace < r.tt.pace && <Chip tone="good" title="Faster when the time trial was run again">Retest {Math.round(r.tt.pace - r.retest.pace)}s faster</Chip>}
      <Chip title="Average race pace minus the time trial mile pace">{secs(r.gap)}</Chip>
    </span>
  </li>
);

export const TimeTrialPanel: React.FC<{ season: number | undefined }> = ({ season }) => {
  const { data: grid } = useResultsGrid(season);
  const scope = useGroupScope();
  const [all, setAll] = useState(false);
  const fit = useMemo(() => (grid ? buildTimeTrialFitness(grid.races, grid.athletes, scope.athleteIdsInScope) : null), [grid, scope.athleteIdsInScope]);
  if (!fit || fit.rows.length === 0) return null;

  const rows = [...fit.rows].sort((a, b) => (b.narrowed ?? -Infinity) - (a.narrowed ?? -Infinity) || a.gap - b.gap);
  const shown = all ? rows : rows.slice(0, 10);
  const s = fit.summary;
  return (
    <section>
      <SectionHeading title="Time trial vs race pace" />
      <Panel>
        <p className="mb-3 text-xs text-muted-foreground">
          Each athlete's 1 mile time trial pace against their average pace in races of 2 miles and up since. A smaller gap, or a race at their
          mile pace, means their endurance has caught up to their speed.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Stat label="Race pace vs mile" value={s.medianGap != null ? secs(s.medianGap) : '—'} sub={`median, ${s.athletes} athletes`} />
          <Stat
            label="Gap to the mile"
            value={s.medianNarrowed != null ? `${Math.round(Math.abs(s.medianNarrowed))}s/mi ${s.medianNarrowed >= 0 ? 'closer' : 'wider'}` : '—'}
            sub="median, first distance race to latest"
          />
          <Stat label="Matched mile pace" value={`${s.matched} of ${s.athletes}`} sub="latest 2 mi+ race at or under it" />
        </div>
        {s.retests > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {s.fasterRetests} of {s.retests} athlete{s.retests === 1 ? '' : 's'} ran the time trial again faster.
          </p>
        )}
        <ul className="-mx-1 mt-3 divide-y divide-border/60">
          {shown.map((r) => (
            <Row key={r.athleteId} r={r} />
          ))}
        </ul>
        {rows.length > 10 && (
          <button type="button" className="mt-2 text-sm font-medium text-primary" onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show all ${rows.length}`}
          </button>
        )}
      </Panel>
    </section>
  );
};

/** One athlete: their mile pace as a reference line, their distance-race paces after it. */
export const AthleteTimeTrial: React.FC<{ athleteId: string; season: number | undefined }> = ({ athleteId, season }) => {
  const { data: grid } = useResultsGrid(season);
  const row = useMemo(() => (grid ? buildTimeTrialFitness(grid.races, grid.athletes, new Set([athleteId])).rows[0] : undefined), [grid, athleteId]);
  if (!row) return null;
  const points = [
    ...row.races.map((r) => ({ date: r.date, label: shortDate(r.date), name: r.name, pace: Math.round(r.pace) })),
    ...(row.retest ? [{ date: row.retest.date, label: shortDate(row.retest.date), name: `${row.retest.name} (retest, mile)`, pace: Math.round(row.retest.pace) }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const paces = [row.tt.pace, ...row.races.map((r) => r.pace)];
  const lo = Math.floor((Math.min(...paces) - 10) / 15) * 15;
  const hi = Math.ceil((Math.max(...paces) + 10) / 15) * 15;
  return (
    <Panel title="Time trial vs race pace">
      <p className="text-sm">
        Mile {formatPace(row.tt.pace)} on {shortDate(row.tt.date)}. Races since average {formatPace(row.avgRacePace)}{' '}
        <span className="text-muted-foreground">({secs(row.gap)})</span>
        {row.matched && <span className="font-semibold text-primary"> · matched their mile pace</span>}
        {row.narrowed != null && row.narrowed > 0 && <span className="text-muted-foreground"> · gap closed {Math.round(row.narrowed)}s</span>}
      </p>
      {row.retest && (
        <p className="text-sm text-muted-foreground">
          Retest {formatPace(row.retest.pace)} ({row.retest.pace < row.tt.pace ? `${Math.round(row.tt.pace - row.retest.pace)}s faster` : 'not faster'}).
        </p>
      )}
      <div className="mt-2 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
            <YAxis domain={[lo, hi]} tickFormatter={(v: number) => formatPace(v).replace('/mi', '')} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={40} />
            <Tooltip formatter={(v) => formatPace(Number(v))} labelFormatter={(_, p) => p?.[0]?.payload?.name ?? ''} />
            <ReferenceLine y={row.tt.pace} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: 'Mile', position: 'insideTopRight', fontSize: 11, fill: 'var(--muted-foreground)' }} />
            <Line type="monotone" dataKey="pace" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 4, strokeWidth: 2, fill: 'var(--card)' }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">Lower is faster. The dashed line is the time trial mile pace.</p>
    </Panel>
  );
};
