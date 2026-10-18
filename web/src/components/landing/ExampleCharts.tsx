import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GROWTH, PACK, SEASON, mmss } from './exampleData';

// Three example charts for the public page, drawn with the app's own chart
// tokens so they match the product and follow its light/dark theme. One
// series per chart, thin marks, a recessive grid, direct labels on the points
// that matter, and a "view as table" under each so nothing is color-only.
// The numbers are invented (./exampleData.ts) and every card says so.

const AXIS = { fontSize: 12, fill: 'var(--muted-foreground)' } as const;
const GRID = 'var(--border)';
const TOOLTIP = {
  contentStyle: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--foreground)',
    fontSize: 13,
  },
  labelStyle: { color: 'var(--muted-foreground)' },
  itemStyle: { color: 'var(--foreground)' },
} as const;

const Card: React.FC<{
  title: string;
  headline: string;
  caption: string;
  table: React.ReactNode;
  legend?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, headline, caption, table, legend, children }) => (
  <figure className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm">
    <figcaption>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{headline}</p>
      <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
    </figcaption>
    <div className="mt-4 h-56 w-full">{children}</div>
    {legend}
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View as table</summary>
      <div className="mt-2 overflow-x-auto">{table}</div>
    </details>
    <p className="mt-3 text-xs text-muted-foreground">Example data, made up for illustration.</p>
  </figure>
);

const Table: React.FC<{ head: string[]; rows: string[][] }> = ({ head, rows }) => (
  <table className="w-full text-left text-xs">
    <thead>
      <tr className="border-b text-muted-foreground">
        {head.map((h) => (
          <th key={h} className="py-1 pr-4 font-medium">{h}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((r) => (
        <tr key={r[0]} className="border-b last:border-0">
          {r.map((c, i) => (
            <td key={i} className="py-1 pr-4 tabular-nums">{c}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

const first = SEASON[0].pace;
const last = SEASON[SEASON.length - 1].pace;
const gFirst = GROWTH[0].best5k;
const gLast = GROWTH[GROWTH.length - 1].best5k;

export default function ExampleCharts() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card
        title="Season progress"
        headline={`${mmss(first - last)} per mile faster`}
        caption="Team average pace at every meet, September to the league championship. Higher on the chart is faster."
        table={<Table head={['Meet', 'Avg pace']} rows={SEASON.map((p) => [p.meet, `${mmss(p.pace)}/mi`])} />}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={SEASON} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="meet" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
            <YAxis
              reversed
              domain={[360, 420]}
              ticks={[372, 390, 408]}
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              width={42}
              tickFormatter={mmss}
            />
            <Tooltip {...TOOLTIP} formatter={(v: number) => [`${mmss(v)}/mi`, 'Team average']} />
            <Area
              type="monotone"
              dataKey="pace"
              baseValue={420}
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="var(--chart-1)"
              fillOpacity={0.12}
              dot={{ r: 4, fill: 'var(--card)', stroke: 'var(--chart-1)', strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="pace"
                position="top"
                content={(p) => {
                  const { x, y, index } = p as unknown as { x: number; y: number; index: number };
                  if (index !== 0 && index !== SEASON.length - 1) return null;
                  return (
                    <text x={x} y={index === 0 ? y + 22 : y - 10} textAnchor={index === 0 ? 'start' : 'end'} fontSize={12} fontWeight={600} fill="var(--foreground)">
                      {mmss(SEASON[index].pace)}
                    </text>
                  );
                }}
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card
        title="Athlete growth"
        headline={`${mmss(gFirst - gLast)} faster in four seasons`}
        caption="One athlete’s best 5K in each season, freshman to senior. Every season stays on the record."
        table={<Table head={['Season', 'Grade', 'Best 5K']} rows={GROWTH.map((p) => [p.season, p.grade, mmss(p.best5k)])} />}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={GROWTH} margin={{ top: 16, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="season" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis reversed domain={[1100, 1450]} ticks={[1160, 1305, 1450]} tick={AXIS} tickLine={false} axisLine={false} width={46} tickFormatter={mmss} />
            <Tooltip {...TOOLTIP} labelFormatter={(l, items) => `${l} · ${(items?.[0]?.payload as { grade?: string })?.grade ?? ''}`} formatter={(v: number) => [mmss(v), 'Best 5K']} />
            <Line
              type="monotone"
              dataKey="best5k"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={{ r: 5, fill: 'var(--card)', stroke: 'var(--chart-1)', strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="best5k"
                content={(p) => {
                  const { x, y, index } = p as unknown as { x: number; y: number; index: number };
                  return (
                    <text x={x} y={index === 0 ? y + 24 : y - 12} textAnchor={index === 0 ? 'start' : index === GROWTH.length - 1 ? 'end' : 'middle'} fontSize={12} fontWeight={600} fill="var(--foreground)">
                      {mmss(GROWTH[index].best5k)}
                    </text>
                  );
                }}
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card
        title="Pack spread"
        headline="Top five within 0:48"
        caption="Seconds behind the team’s first finisher at one meet. Runners 1–5 score; 6 and 7 push other teams’ scores up."
        legend={
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-1)' }} aria-hidden />Scores</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/45" aria-hidden />Displaces</span>
        </div>
        }
        table={<Table head={['Place', 'Behind #1', 'Role']} rows={PACK.map((p) => [`#${p.place}`, `+${p.gap}s`, p.scorer ? 'Scores' : 'Displaces'])} />}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={PACK} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="place" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v) => `#${v}`} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={AXIS} tickLine={false} axisLine={false} width={34} tickFormatter={(v) => `${v}s`} />
            <Tooltip {...TOOLTIP} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} labelFormatter={(l) => `Runner #${l}`} formatter={(v: number) => [`+${v}s behind #1`, 'Gap']} />
            <Bar dataKey="gap" radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false}>
              {PACK.map((p) => (
                <Cell key={p.place} fill={p.scorer ? 'var(--chart-1)' : 'var(--muted-foreground)'} fillOpacity={p.scorer ? 1 : 0.45} />
              ))}
              <LabelList
                dataKey="gap"
                content={(p) => {
                  const { x, y, width, index } = p as unknown as { x: number; y: number; width: number; index: number };
                  if (index !== 4 && index !== 6) return null;
                  return (
                    <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--foreground)">
                      +{PACK[index].gap}s
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
