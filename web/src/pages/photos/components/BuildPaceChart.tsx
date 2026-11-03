import React, { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatPace } from '../lib/raceFormat';
import { paceChartData, type PaceDatum } from '../lib/paceChart';
import type { AthleteBuildStats } from '../state/types';

interface BuildPaceChartProps {
  stats: AthleteBuildStats | null;
}

// Light card on the dark workspace background — same "a printed page's own
// light paper color, framed by the dark chrome around it" look the collage
// preview itself already uses (collageRender.ts's '#f7f6f2'), so this
// reads as part of the same visual family rather than a mismatched widget.
export const BuildPaceChart: React.FC<BuildPaceChartProps> = ({ stats }) => {
  const { data, isCareer } = useMemo(() => paceChartData(stats), [stats]);

  // A single point is a number, not a progression — nothing to chart yet.
  if (data.length < 2) return null;

  return (
    <div className="w-full max-w-md rounded-lg bg-[#f7f6f2] p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#5c5744]">
        Pace {isCareer ? '— Career' : '— This Season'}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d8d4c8" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5c5744' }} tickMargin={6} />
          <YAxis
            domain={['dataMin - 10', 'dataMax + 10']}
            tickFormatter={(v: number) => formatPace(v)}
            tick={{ fontSize: 11, fill: '#5c5744' }}
            width={52}
          />
          <Tooltip
            formatter={(value: number) => [formatPace(value), 'Pace']}
            labelFormatter={(_, payload) => (payload?.[0]?.payload as PaceDatum | undefined)?.raceName ?? ''}
            contentStyle={{ fontSize: 12 }}
          />
          <Line type="monotone" dataKey="pace" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
