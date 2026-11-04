import React, { useState } from 'react';
import { ArrowDown, ArrowRight, ChevronDown, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatPace } from '@/lib/formatUtils';
import type {
  PostseasonLevel,
  ProgramAnalyticsData,
  ProgramStoryBeat,
} from '@/hooks/useProgramAnalytics';

// The Program screen as one chain, not a list: who showed up -> who stayed
// -> how fast they are -> how tight the pack is -> how far it got.
// Each link is one number, its change on last year, a sparkline of every
// season loaded, and the server's one-line reading of it (the same
// sentences "What the numbers say" used to list, now attached to the figure
// they describe). The detail behind a sentence is one tap away.
//
// Pace and spread sparklines are drawn with lower = lower on the chart,
// like every other chart in the app: a faster team sits lower.

const LEVEL_RANK: Record<PostseasonLevel, number> = { LEAGUE: 1, DISTRICT: 2, REGIONAL: 3, STATE: 4, NATIONAL: 5 };
const LEVEL_LABEL: Record<PostseasonLevel, string> = {
  LEAGUE: 'League',
  DISTRICT: 'Districts',
  REGIONAL: 'Regionals',
  STATE: 'State',
  NATIONAL: 'Nationals',
};

type Tone = 'good' | 'bad' | 'flat';

interface Series {
  key: string;
  color: string;
  label?: string;
}

interface Link {
  id: string;
  label: string;
  value: React.ReactNode;
  unit?: string;
  delta?: { text: string; tone: Tone; up: boolean | null } | null;
  spark: Array<Record<string, number | null>>;
  series: Series[];
  beat?: ProgramStoryBeat;
  extra?: React.ReactNode;
}

function Delta({ delta }: { delta: NonNullable<Link['delta']> }) {
  const Icon = delta.up === null ? Minus : delta.up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        delta.tone === 'good' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        delta.tone === 'bad' && 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
        delta.tone === 'flat' && 'bg-muted text-muted-foreground'
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {delta.text}
    </span>
  );
}

function Spark({ data, series }: { data: Link['spark']; series: Series[] }) {
  if (data.length < 2) return <div className="h-14" aria-hidden />;
  return (
    <div className="h-14" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 6 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LinkCard({ link, step }: { link: Link; step: number }) {
  const [open, setOpen] = useState(false);
  const evidence = Object.entries(link.beat?.evidence ?? {}).filter(([, v]) => v != null && typeof v !== 'object');
  return (
    <Card className="flex h-full min-w-0 flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {step}. {link.label}
        </span>
        {link.delta && <Delta delta={link.delta} />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold tabular-nums leading-none whitespace-nowrap">{link.value}</span>
        {link.unit && <span className="truncate text-sm text-muted-foreground">{link.unit}</span>}
      </div>
      <Spark data={link.spark} series={link.series} />
      {link.extra}
      {link.beat && (
        <div className="mt-auto">
          <p className="text-sm font-medium leading-snug">{link.beat.headline}</p>
          {(link.beat.detail || evidence.length > 0) && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
              {open ? 'Less' : 'Why'}
            </button>
          )}
          {open && <p className="mt-1 text-xs text-muted-foreground">{link.beat.detail}</p>}
        </div>
      )}
    </Card>
  );
}

const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n)}`);

export function ProgramJourney({ data }: { data: ProgramAnalyticsData }) {
  const { seasons, attrition, postseason, story } = data;
  if (seasons.length === 0) return null;

  const last = seasons[seasons.length - 1];
  const prev = seasons.length > 1 ? seasons[seasons.length - 2] : null;
  const beatOf = (...ids: string[]) => {
    for (const id of ids) {
      const found = story?.find((b) => b.id === id);
      if (found) return found;
    }
    return undefined;
  };

  // 1. Turnout
  const rosterDelta = prev ? last.participants.total - prev.participants.total : null;
  const turnout: Link = {
    id: 'turnout',
    label: 'Turnout',
    value: last.participants.total,
    unit: 'athletes',
    delta:
      rosterDelta == null
        ? null
        : { text: `${rosterDelta > 0 ? '+' : ''}${rosterDelta}`, tone: rosterDelta > 0 ? 'good' : rosterDelta < 0 ? 'bad' : 'flat', up: rosterDelta === 0 ? null : rosterDelta > 0 },
    spark: seasons.map((s) => ({ v: s.participants.total })),
    series: [{ key: 'v', color: 'var(--chart-1, #6b2a7a)' }],
    beat: beatOf('participation', 'turnout'),
  };

  // 2. Staying
  const rate = last.churn?.returnRate ?? null;
  const prevRate = prev?.churn?.returnRate ?? null;
  const rateDelta = rate != null && prevRate != null ? Math.round(rate - prevRate) : null;
  const staying: Link = {
    id: 'staying',
    label: 'Staying',
    value: pct(rate),
    unit: '% came back',
    delta:
      rateDelta == null
        ? null
        : { text: `${rateDelta > 0 ? '+' : ''}${rateDelta} pts`, tone: rateDelta > 0 ? 'good' : rateDelta < 0 ? 'bad' : 'flat', up: rateDelta === 0 ? null : rateDelta > 0 },
    spark: seasons.map((s) => ({ v: s.churn?.returnRate ?? null })),
    series: [{ key: 'v', color: 'var(--chart-2, #f0b429)' }],
    beat: beatOf('returning', 'retention'),
    extra: (() => {
      const w = attrition.windows.find((x) => x >= 3) ?? attrition.windows[attrition.windows.length - 1];
      const r = w != null ? attrition.retention[String(w)] : null;
      return r != null ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">{Math.round(r)}%</span> still here {w} yrs after joining
        </p>
      ) : null;
    })(),
  };

  // 3. Speed (lower = faster)
  const paceNow = last.medianPace?.men?.paceSecPerMile ?? null;
  const paceNowW = last.medianPace?.women?.paceSecPerMile ?? null;
  const paceDelta = (a: number | null, b: number | null) => (a != null && b != null ? Math.round(a - b) : null);
  const dBoys = paceDelta(paceNow, prev?.medianPace?.men?.paceSecPerMile ?? null);
  const dGirls = paceDelta(paceNowW, prev?.medianPace?.women?.paceSecPerMile ?? null);
  const dPrimary = dBoys ?? dGirls;
  const speed: Link = {
    id: 'speed',
    label: 'Speed',
    value: paceNow != null ? formatPace(paceNow) : paceNowW != null ? formatPace(paceNowW) : '—',
    unit: paceNow != null ? 'boys median' : 'girls median',
    delta:
      dPrimary == null
        ? null
        : { text: `${Math.abs(dPrimary)}s/mi`, tone: dPrimary < 0 ? 'good' : dPrimary > 0 ? 'bad' : 'flat', up: dPrimary === 0 ? null : dPrimary > 0 },
    spark: seasons.map((s) => ({
      m: s.medianPace?.men?.paceSecPerMile ?? null,
      w: s.medianPace?.women?.paceSecPerMile ?? null,
    })),
    series: [
      { key: 'm', color: '#3b82f6' },
      { key: 'w', color: '#ec4899' },
    ],
    beat: beatOf('pace-men', 'pace-women'),
    extra:
      paceNow != null && paceNowW != null ? (
        <p className="text-xs text-muted-foreground">
          Girls <span className="font-semibold text-foreground tabular-nums">{formatPace(paceNowW)}</span>
          {dGirls != null && dGirls !== 0 && ` (${dGirls < 0 ? '' : '+'}${dGirls}s)`}
        </p>
      ) : null,
  };

  // 4. Depth (pack spread, lower = tighter)
  const spreadM = last.packSpread?.men?.spreadSec ?? null;
  const spreadW = last.packSpread?.women?.spreadSec ?? null;
  const spreadPrev = prev?.packSpread?.men?.spreadSec ?? prev?.packSpread?.women?.spreadSec ?? null;
  const spreadNow = spreadM ?? spreadW;
  const dSpread = spreadNow != null && spreadPrev != null ? Math.round(spreadNow - spreadPrev) : null;
  const depth: Link = {
    id: 'depth',
    label: 'Depth',
    value: spreadNow != null ? `${Math.round(spreadNow)}` : '—',
    unit: 's, 1st to 5th',
    delta:
      dSpread == null
        ? null
        : { text: `${Math.abs(dSpread)}s`, tone: dSpread < 0 ? 'good' : dSpread > 0 ? 'bad' : 'flat', up: dSpread === 0 ? null : dSpread > 0 },
    spark: seasons.map((s) => ({
      m: s.packSpread?.men?.spreadSec ?? null,
      w: s.packSpread?.women?.spreadSec ?? null,
    })),
    series: [
      { key: 'm', color: '#3b82f6' },
      { key: 'w', color: '#ec4899' },
    ],
    beat: beatOf('pack-men', 'pack-women'),
  };

  // 5. Result
  const marked = postseason.filter((s) => s.marked);
  const latestPost = marked[marked.length - 1];
  const result: Link = {
    id: 'result',
    label: 'Result',
    value: latestPost?.furthestLevel ? LEVEL_LABEL[latestPost.furthestLevel] : '—',
    unit: latestPost?.furthestLevel ? `in ${latestPost.season}` : marked.length === 0 ? 'none marked yet' : '',
    delta: null,
    beat: beatOf('postseason'),
    spark: marked.map((s) => ({ v: s.furthestLevel ? LEVEL_RANK[s.furthestLevel] : 0 })),
    series: [{ key: 'v', color: 'var(--chart-4, #f59e0b)' }],
  };

  const links = [turnout, staying, speed, depth, result];

  return (
    <section aria-label="Program story" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">The story of {last.season}</h2>
        <span className="text-xs text-muted-foreground">
          {seasons.length} season{seasons.length === 1 ? '' : 's'} · arrows show change on {prev ? prev.season : 'last year'}
        </span>
      </div>
      {/* Chain: horizontal on wide screens, stacked on phones. */}
      <div className="flex flex-col items-stretch gap-1 lg:flex-row lg:items-stretch lg:gap-0">
        {links.map((link, i) => (
          <React.Fragment key={link.id}>
            <div className="min-w-0 flex-1">
              <LinkCard link={link} step={i + 1} />
            </div>
            {i < links.length - 1 && (
              <div className="flex items-center justify-center text-muted-foreground lg:px-1" aria-hidden>
                <ArrowDown className="h-4 w-4 lg:hidden" />
                <ArrowRight className="hidden h-4 w-4 lg:block" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

export default ProgramJourney;
