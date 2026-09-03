import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Trophy } from 'lucide-react';
import type { PostseasonLevel, ProgramPostseasonSeason } from '@/hooks/useProgramAnalytics';

// How far the program got, year by year.
//
// The number a program is actually judged on — how many made districts, how
// many made state — and until races could be marked, nothing in the app
// could answer it: the championship at the end of the year looked exactly
// like the invitational in September.
//
// The distinction this section works hardest to keep: an unmarked season is
// not a season nobody qualified in. Showing a bar of zero for a team that
// won its district would be the worst thing this screen could do, so
// unmarked seasons are named as unmarked and left off the chart.

const LEVELS: PostseasonLevel[] = ['LEAGUE', 'DISTRICT', 'REGIONAL', 'STATE', 'NATIONAL'];

const LEVEL_LABELS: Record<PostseasonLevel, string> = {
  LEAGUE: 'League',
  DISTRICT: 'Districts',
  REGIONAL: 'Regionals',
  STATE: 'State',
  NATIONAL: 'Nationals',
};

const LEVEL_COLORS: Record<PostseasonLevel, string> = {
  LEAGUE: '#94a3b8',
  DISTRICT: '#3b82f6',
  REGIONAL: '#8b5cf6',
  STATE: '#f59e0b',
  NATIONAL: '#ef4444',
};

export const PostseasonSection: React.FC<{ postseason: ProgramPostseasonSeason[] }> = ({ postseason }) => {
  const marked = postseason.filter((s) => s.marked);
  const unmarked = postseason.filter((s) => !s.marked).map((s) => s.season);

  // Only the rungs this program has actually reached — a team that never
  // sends anyone to nationals shouldn't carry an empty series for it.
  const usedLevels = LEVELS.filter((level) => marked.some((s) => s.counts[level].total > 0));

  const chartData = marked.map((s) => {
    const row: Record<string, number | string> = { season: s.season };
    for (const level of usedLevels) row[level] = s.counts[level].total;
    return row;
  });

  const latest = marked[marked.length - 1];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5" />
          Post Season
        </CardTitle>
        <CardDescription>
          Athletes who reached each round, per season. Counted once per athlete per level, from races marked on the
          meet itself — set a meet's level on its own page and it appears here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {marked.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No races marked as postseason yet.
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Districts and state look like every other meet until someone says so. Open a championship meet and set
              its level — nothing is guessed from the name, because "Penn State Invitational" isn't a state meet.
            </p>
          </div>
        ) : (
          <>
            {latest && latest.furthestLevel && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{latest.season}:</span>
                {LEVELS.filter((level) => latest.counts[level].total > 0).map((level) => (
                  <Badge key={level} variant={level === latest.furthestLevel ? 'default' : 'secondary'}>
                    {latest.counts[level].total} {LEVEL_LABELS[level]}
                  </Badge>
                ))}
              </div>
            )}
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="season" />
                <YAxis allowDecimals={false} />
                <Tooltip
                  labelFormatter={(l) => `Season: ${l}`}
                  formatter={(value: number | string, name: string) => [
                    `${value} athlete${Number(value) === 1 ? '' : 's'}`,
                    LEVEL_LABELS[name as PostseasonLevel] ?? name,
                  ]}
                />
                <Legend formatter={(value: string) => LEVEL_LABELS[value as PostseasonLevel] ?? value} />
                {usedLevels.map((level) => (
                  <Bar key={level} dataKey={level} name={level} fill={LEVEL_COLORS[level]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </>
        )}

        {unmarked.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {unmarked.join(', ')} {unmarked.length === 1 ? 'has' : 'have'} no postseason races marked. That's a gap in
            the record, not a season nobody qualified in — those seasons are left off the chart rather than drawn as
            zero.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default PostseasonSection;
