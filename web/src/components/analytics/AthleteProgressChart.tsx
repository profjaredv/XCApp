import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTabsList } from '@/components/ui/responsive-tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatTime, formatPace } from '@/lib/formatUtils';

interface AthleteProgressData {
  season: number;
  athlete5K: number | null;
  athletePace: number | null;
  team5K: number | null;
  teamPace: number | null;
  boys5K: number | null;
  boysPace: number | null;
  girls5K: number | null;
  girlsPace: number | null;
  /** How many athletes each average stands on. One is not an average. */
  counts?: { team: number; boys: number; girls: number };
}

// A comparison line is only drawn when there is something behind it.
//
// This chart used to render four <Line>s unconditionally, which meant a
// legend advertising Boys Average, Girls Average and Team Average on a
// chart showing one line — the comparison data was null for a year after
// the endpoint it came from was removed. It also means a boys' team gets
// no phantom "Girls Average" entry, and a squad of one gets no average
// that is really just their own line drawn twice.
const MIN_FOR_AVERAGE = 2;

function hasSeries(data: AthleteProgressData[], key: keyof AthleteProgressData): boolean {
  return data.some((row) => typeof row[key] === 'number' && (row[key] as number) > 0);
}

function groupHasEnough(data: AthleteProgressData[], group: 'team' | 'boys' | 'girls'): boolean {
  // No counts at all (the fallback shape) — fall back to "is there a
  // number", which is the old behaviour minus the phantom lines.
  if (!data.some((row) => row.counts)) return true;
  return data.some((row) => (row.counts?.[group] ?? 0) >= MIN_FOR_AVERAGE);
}

interface AthleteProgressChartProps {
  athleteName: string;
  athleteGender: 'M' | 'F';
  data: AthleteProgressData[];
  isLoading?: boolean;
}

const AthleteProgressChart: React.FC<AthleteProgressChartProps> = ({ 
  athleteName, 
  data, 
  isLoading = false 
}) => {
  const [activeTab, setActiveTab] = useState('5k-times');

  const shows = (key: keyof AthleteProgressData, group: 'team' | 'boys' | 'girls') =>
    hasSeries(data, key) && groupHasEnough(data, group);

  const comparisons = {
    team5K: shows('team5K', 'team'),
    teamPace: shows('teamPace', 'team'),
    boys5K: shows('boys5K', 'boys'),
    boysPace: shows('boysPace', 'boys'),
    girls5K: shows('girls5K', 'girls'),
    girlsPace: shows('girlsPace', 'girls'),
  };
  const anyComparison = Object.values(comparisons).some(Boolean);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Career Progress</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2">Loading progress data...</span>
        </CardContent>
      </Card>
    );
  }


  const formatTooltipValue = (value: number | null, name: string) => {
    if (value === null || value === 0) return ['N/A', name];
    
    if (activeTab === '5k-times') {
      return [formatTime(value), name];
    } else {
      return [formatPace(value), name];
    }
  };

  const formatYAxisTick = (value: number) => {
    if (activeTab === '5k-times') {
      return formatTime(value);
    } else {
      return formatPace(value);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Career Progress</CardTitle>
        <p className="text-sm text-muted-foreground">
          {anyComparison
            ? `${athleteName} against the season averages of everyone they raced with.`
            : `${athleteName}'s times by season.`}
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <ResponsiveTabsList value={activeTab} onValueChange={setActiveTab} className="grid w-full grid-cols-2">
            <TabsTrigger value="5k-times">5K Times</TabsTrigger>
            <TabsTrigger value="pace">Average Pace</TabsTrigger>
          </ResponsiveTabsList>
          
          <TabsContent value="5k-times" className="mt-4">
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="season" 
                  type="category"
                />
                <YAxis 
                  tickFormatter={formatYAxisTick}
                  domain={['dataMin - 30', 'dataMax + 30']}
                />
                <Tooltip 
                  formatter={formatTooltipValue}
                  labelFormatter={(label) => `Season ${label}`}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="athlete5K" 
                  stroke="#2563eb" 
                  strokeWidth={3}
                  name={athleteName}
                  connectNulls={false}
                />
                {comparisons.boys5K && (
                  <Line 
                    type="monotone" 
                    dataKey="boys5K" 
                    stroke="#dc2626" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="Boys Average"
                    connectNulls={false}
                  />
                )}
                {comparisons.girls5K && (
                  <Line 
                    type="monotone" 
                    dataKey="girls5K" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="Girls Average"
                    connectNulls={false}
                  />
                )}
                {comparisons.team5K && (
                  <Line 
                    type="monotone" 
                    dataKey="team5K" 
                    stroke="#16a34a" 
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    name="Team Average"
                    connectNulls={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>
          
          <TabsContent value="pace" className="mt-4">
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="season" 
                  type="category"
                />
                <YAxis 
                  tickFormatter={formatYAxisTick}
                  domain={['dataMin - 10', 'dataMax + 10']}
                />
                <Tooltip 
                  formatter={formatTooltipValue}
                  labelFormatter={(label) => `Season ${label}`}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="athletePace" 
                  stroke="#2563eb" 
                  strokeWidth={3}
                  name={athleteName}
                  connectNulls={false}
                />
                {comparisons.boysPace && (
                  <Line 
                    type="monotone" 
                    dataKey="boysPace" 
                    stroke="#dc2626" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="Boys Average"
                    connectNulls={false}
                  />
                )}
                {comparisons.girlsPace && (
                  <Line 
                    type="monotone" 
                    dataKey="girlsPace" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="Girls Average"
                    connectNulls={false}
                  />
                )}
                {comparisons.teamPace && (
                  <Line 
                    type="monotone" 
                    dataKey="teamPace" 
                    stroke="#16a34a" 
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    name="Team Average"
                    connectNulls={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AthleteProgressChart;
