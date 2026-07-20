import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
          {athleteName}'s performance compared to team, boys, and girls averages
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="5k-times">5K Times</TabsTrigger>
            <TabsTrigger value="pace">Average Pace</TabsTrigger>
          </TabsList>
          
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
                <Line 
                  type="monotone" 
                  dataKey="boys5K" 
                  stroke="#dc2626" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Boys Average"
                  connectNulls={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="girls5K" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Girls Average"
                  connectNulls={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="team5K" 
                  stroke="#16a34a" 
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  name="Team Average"
                  connectNulls={false}
                />
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
                <Line 
                  type="monotone" 
                  dataKey="boysPace" 
                  stroke="#dc2626" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Boys Average"
                  connectNulls={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="girlsPace" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Girls Average"
                  connectNulls={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="teamPace" 
                  stroke="#16a34a" 
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  name="Team Average"
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AthleteProgressChart;
