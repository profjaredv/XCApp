import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatTime, formatPace } from '@/lib/formatUtils';


interface MultiSeasonTrendsProps {
  data: {
    seasons: number[];
    trends: {
      season: number;
      avg5K: {
        girls: number | null;
        boys: number | null;
        team: number | null;
      };
      avgPace: {
        girls: number | null;
        boys: number | null;
        team: number | null;
      };
      stateMeet: {
        avg5K: {
          girls: number | null;
          boys: number | null;
          team: number | null;
        };
        avgPace: {
          girls: number | null;
          boys: number | null;
          team: number | null;
        };
        hasData: boolean;
      };
      hasData: boolean;
    }[];
  };
  isLoading: boolean;
  selectedAthlete?: {
    id: string;
    name: string;
    seasons?: Array<{
      year: number;
      bestTime?: number;
      avgPace?: number;
      races?: Array<{ time: number; pace: number; distance: number; }>;
    }>;
  };
}

const MultiSeasonTrends: React.FC<MultiSeasonTrendsProps> = ({ data, isLoading, selectedAthlete }) => {
  const [activeTab, setActiveTab] = useState('avg5k');

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Multi Season Trends</CardTitle>
          <CardDescription>Loading trend data...</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[300px] flex items-center justify-center">
          <div className="animate-pulse">Loading multi-season data...</div>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.trends || data.trends.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Multi Season Trends</CardTitle>
          <CardDescription>No multi-season data available</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">Import data for multiple seasons to see trends over time</p>
        </CardContent>
      </Card>
    );
  }

  // Debug: Log the raw data
  console.log('MultiSeasonTrends data:', data);
  console.log('MultiSeasonTrends selectedAthlete:', selectedAthlete);

  // Format data for charts - use athlete data if available, otherwise team data
  const chartData = selectedAthlete && selectedAthlete.seasons 
    ? selectedAthlete.seasons.map(season => {
        // Convert athlete's best time to 5K equivalent and pace
        const bestTime5K = season.bestTime || 0;
        const avgPace = season.avgPace || 0;
        
        return {
          season: season.year,
          athlete5K: bestTime5K,
          athletePace: avgPace,
          // For individual athlete view, we show their data in the "team" slot
          team5K: bestTime5K,
          teamPace: avgPace,
          girls5K: null,
          boys5K: null,
          girlsPace: null,
          boysPace: null,
          girlsState5K: null,
          boysState5K: null,
          teamState5K: null,
          girlsStatePace: null,
          boysStatePace: null,
          teamStatePace: null,
        };
      })
    : data.trends.map(season => ({
        season: season.season,
        girls5K: season.avg5K.girls,
        boys5K: season.avg5K.boys,
        team5K: season.avg5K.team,
        girlsPace: season.avgPace.girls,
        boysPace: season.avgPace.boys,
        teamPace: season.avgPace.team,
        girlsState5K: season.stateMeet.avg5K.girls,
        boysState5K: season.stateMeet.avg5K.boys,
        teamState5K: season.stateMeet.avg5K.team,
        girlsStatePace: season.stateMeet.avgPace.girls,
        boysStatePace: season.stateMeet.avgPace.boys,
        teamStatePace: season.stateMeet.avgPace.team,
      }));

  // Debug: Log the final chart data
  console.log('MultiSeasonTrends chartData:', chartData);

  // Custom tooltip formatter for Recharts
  const formatTooltipValue = (value: string | number | Array<string | number> | undefined, name: string): string => {
    if (value === null || value === undefined) return 'No data';
    const numValue = Number(value);
    if (isNaN(numValue)) return 'Invalid data';
    if (name.toLowerCase().includes('pace')) {
      return formatPace(numValue);
    }
    return formatTime(numValue);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{selectedAthlete ? 'Career Progress' : 'Multi Season Trends'}</CardTitle>
        <CardDescription>
          {selectedAthlete 
            ? `${selectedAthlete.name}'s performance across multiple seasons` 
            : 'Performance trends across multiple seasons'
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="avg5k">{selectedAthlete ? 'Best 5K Times' : 'Average 5K Times'}</TabsTrigger>
            <TabsTrigger value="avgpace">{selectedAthlete ? 'Average Pace' : 'Average Mile Pace'}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="avg5k" className="min-h-[400px]">
            <h3 className="text-lg font-medium mb-2">
              {selectedAthlete ? `${selectedAthlete.name} - Best 5K Times by Season` : 'Average 5K Times (excluding State Meet)'}
            </h3>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="season" />
                <YAxis 
                  tickFormatter={(value) => formatTime(value)} 
                  domain={['dataMin - 60', 'dataMax + 60']}
                />
                <Tooltip 
                  formatter={formatTooltipValue}
                  labelFormatter={(label) => `Season: ${label}`}
                />
                <Legend />
                {selectedAthlete ? (
                  // Individual athlete view - show only their data
                  <Line 
                    type="monotone" 
                    dataKey="team5K" 
                    name={selectedAthlete.name} 
                    stroke="#4BC0C0" 
                    strokeWidth={3}
                    activeDot={{ r: 8 }} 
                    connectNulls
                  />
                ) : (
                  // Team view - show boys, girls, and team lines
                  <>
                    <Line 
                      type="monotone" 
                      dataKey="girls5K" 
                      name="Girls" 
                      stroke="#FF6384" 
                      strokeWidth={3}
                      activeDot={{ r: 8 }} 
                      connectNulls
                    />
                    <Line 
                      type="monotone" 
                      dataKey="boys5K" 
                      name="Boys" 
                      stroke="#36A2EB" 
                      strokeWidth={3}
                      activeDot={{ r: 8 }} 
                      connectNulls
                    />
                    <Line 
                      type="monotone" 
                      dataKey="team5K" 
                      name="Team" 
                      stroke="#4BC0C0" 
                      strokeWidth={3}
                      activeDot={{ r: 8 }} 
                      connectNulls
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
            <p className="text-sm text-muted-foreground mt-2">
              Lower times indicate better performance
            </p>
          </TabsContent>
          
          <TabsContent value="avgpace" className="min-h-[400px]">
            <h3 className="text-lg font-medium mb-2">
              {selectedAthlete ? `${selectedAthlete.name} - Average Pace by Season` : 'Average Mile Pace'}
            </h3>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="season" />
                <YAxis 
                  tickFormatter={(value) => formatPace(value)} 
                  domain={['dataMin - 20', 'dataMax + 20']}
                />
                <Tooltip 
                  formatter={formatTooltipValue}
                  labelFormatter={(label) => `Season: ${label}`}
                />
                <Legend />
                {selectedAthlete ? (
                  // Individual athlete view - show only their data
                  <Line 
                    type="monotone" 
                    dataKey="teamPace" 
                    name={selectedAthlete.name} 
                    stroke="#4BC0C0" 
                    strokeWidth={3}
                    activeDot={{ r: 8 }} 
                    connectNulls
                  />
                ) : (
                  // Team view - show boys, girls, and team lines
                  <>
                    <Line 
                      type="monotone" 
                      dataKey="girlsPace" 
                      name="Girls" 
                      stroke="#FF6384" 
                      strokeWidth={3}
                      activeDot={{ r: 8 }} 
                      connectNulls
                    />
                    <Line 
                      type="monotone" 
                      dataKey="boysPace" 
                      name="Boys" 
                      stroke="#36A2EB" 
                      strokeWidth={3}
                      activeDot={{ r: 8 }} 
                      connectNulls
                    />
                    <Line 
                      type="monotone" 
                      dataKey="teamPace" 
                      name="Team" 
                      stroke="#4BC0C0" 
                      strokeWidth={3}
                      activeDot={{ r: 8 }} 
                      connectNulls
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
            <p className="text-sm text-muted-foreground mt-2">
              Lower pace indicates better performance
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default MultiSeasonTrends;
