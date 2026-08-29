import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label } from 'recharts';
import { formatPace, formatDateShort } from '@/lib/formatUtils';
import type { Athlete, Race } from '@/types/analytics';

interface CareerProgressChartProps {
  athlete: Athlete;
  height?: number;
}

// Helper function to get color based on grade
const getGradeColor = (grade: number): string => {
  switch (grade) {
    case 9: return '#000080'; // Navy for freshmen
    case 10: return '#16a34a'; // Green for sophomores
    case 11: return '#fbbf24'; // Gold for juniors
    case 12: return '#000000'; // Black for seniors
    default: return '#94a3b8'; // Default for other grades
  }
};

const CareerProgressChart: React.FC<CareerProgressChartProps> = ({ athlete, height = 150 }) => {
  const { chartData, avgPace, bestPace } = useMemo(() => {
    if (!athlete || !athlete.races || athlete.races.length === 0) {
      return { chartData: [], avgPace: 0, bestPace: 0 };
    }

    // Grade at each race is worked back from the athlete's current grade,
    // so an unknown grade means the whole chart's grade banding would be
    // guesswork. Defaulting to 12 quietly produced a plausible-looking
    // chart built on an invented graduation year; better to draw nothing
    // than to draw something wrong and confident.
    const currentYear = new Date().getFullYear();
    const currentGrade = athlete.currentGrade;
    if (!Number.isFinite(currentGrade)) {
      return { chartData: [], avgPace: 0, bestPace: 0 };
    }
    const graduationYear = currentYear + (12 - (currentGrade as number));

    interface ProcessedRace {
      x?: number;
      pace: number;
      grade: number;
      date: string;
      formattedDate: string;
      name?: string;
      time?: number;
      distance?: number;
      meetName?: string;
      meetId?: string;
      place?: number;
      totalRunners?: number;
      isPr?: boolean;
      isSeasonBest?: boolean;
      course?: string;
      conditions?: string;
      [key: string]: string | number | boolean | undefined;
    }

    // Group races by grade
    const racesByGrade: Record<number, Race[]> = {};
    
    // First pass: group races by grade
    athlete.races.forEach(race => {
      const raceDate = new Date(race.date);
      const raceYear = raceDate.getFullYear();
      
      // Calculate grade at time of race
      const gradeAtRace = 12 - (graduationYear - raceYear);
      
      // Only include high school grades and valid races
      if (gradeAtRace >= 9 && gradeAtRace <= 12 && race.time > 0 && race.distance > 0) {
        if (!racesByGrade[gradeAtRace]) {
          racesByGrade[gradeAtRace] = [];
        }
        racesByGrade[gradeAtRace].push(race);
      }
    });
    
    // Second pass: process races by grade
    const processedRaces: ProcessedRace[] = [];
    
    Object.entries(racesByGrade).forEach(([grade, races]) => {
      const gradeNum = parseInt(grade);
      const basePosition = gradeNum - 9; // 0 for freshman, 1 for sophomore, etc.
      
      // Sort races within this grade by date
      const sortedRaces = [...races].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      // Assign evenly spaced positions within the grade segment
      sortedRaces.forEach((race, index) => {
        const step = sortedRaces.length > 1 ? 1 / (sortedRaces.length - 1) : 0.5;
        const xPosition = basePosition + (index * step);
        
        // Calculate pace in seconds per mile (distance is in meters)
        const distance = race.distance || 0;
        const pace = race.time && distance > 0 ? (race.time * 1609.34) / distance : 0;
        
        const processedRace: ProcessedRace = {
          ...race,
          x: xPosition,
          pace: pace,
          grade: gradeNum,
          formattedDate: formatDateShort(race.date)
        };
        
        processedRaces.push(processedRace);
      });
    });
    
    // Sort all processed races by date for the line to connect properly
    processedRaces.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Calculate average and best pace
    let totalPace = 0;
    let bestPaceValue = Number.MAX_VALUE;
    
    processedRaces.forEach(race => {
      totalPace += race.pace;
      if (race.pace < bestPaceValue) {
        bestPaceValue = race.pace;
      }
    });
    
    const averagePace = processedRaces.length > 0 ? totalPace / processedRaces.length : 0;
    
    return { 
      chartData: processedRaces, 
      avgPace: averagePace,
      bestPace: bestPaceValue
    };
  }, [athlete]);

  if (!athlete || chartData.length === 0) {
    return <div className="text-sm text-muted-foreground">Career data not available yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 8, right: 30, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          type="number" 
          dataKey="x" 
          domain={[0, 4]}
          ticks={[0, 1, 2, 3, 4]}
          tickFormatter={(value) => {
            if (value === 0) return `Fr`;
            if (value === 1) return `So`;
            if (value === 2) return `Jr`;
            if (value === 3) return `Sr`;
            if (value === 4) return ``;
            return '';
          }}
        />
        <YAxis 
          domain={['dataMin - 20', 'dataMax + 20']} 
          tickFormatter={(value) => formatPace(value)}
        />
        <Tooltip 
          formatter={(value: number | string, name: string) => {
            if (name === 'Pace') return formatPace(Number(value));
            return value;
          }}
          labelFormatter={(value, payload) => {
            if (payload && payload[0]) {
              const data = payload[0].payload as {
                grade?: number;
                name?: string;
                formattedDate?: string;
              };
              const grade = data.grade || Math.floor(Number(value)) + 9;
              const gradeLabel = grade === 9 ? 'Freshman' : 
                               grade === 10 ? 'Sophomore' : 
                               grade === 11 ? 'Junior' : 'Senior';
              return `${data.name || 'Race'} (${gradeLabel})\n${data.formattedDate || ''}`;
            }
            return `Race`;
          }}
        />
        
        {/* Reference lines for average and best pace */}
        {avgPace > 0 && (
          <ReferenceLine 
            y={avgPace} 
            stroke="#64748b" 
            strokeDasharray="3 3"
          >
            <Label 
              value={`Avg: ${formatPace(avgPace)}`} 
              position="right" 
              fill="#64748b"
              fontSize={10}
            />
          </ReferenceLine>
        )}
        {bestPace > 0 && bestPace < Number.MAX_VALUE && (
          <ReferenceLine 
            y={bestPace} 
            stroke="#10b981" 
            strokeDasharray="3 3"
          >
            <Label 
              value={`Best: ${formatPace(bestPace)}`} 
              position="right" 
              fill="#10b981"
              fontSize={10}
            />
          </ReferenceLine>
        )}
        
        {/* Grade transition reference lines */}
        {[1, 2, 3].map(x => (
          <ReferenceLine 
            key={`grade-transition-${x}`}
            x={x} 
            stroke="#64748b" 
            strokeDasharray="3 3" 
          />
        ))}
        
        {/* Main data line with color-coded dots by grade */}
        <Line 
          type="monotone" 
          dataKey="pace" 
          data={chartData}
          stroke="#64748b" 
          strokeWidth={2} 
          name="Pace"
          dot={(props) => {
            // Extract grade from payload
            // Colour only — getGradeColor already has a neutral default
            // for anything outside 9-12, so an unknown grade draws grey
            // rather than being coloured as a freshman.
            const grade = props.payload?.grade ?? 0;
            return (
              <circle 
                cx={props.cx} 
                cy={props.cy} 
                r={4} 
                fill={getGradeColor(grade)} 
                stroke="none"
              />
            );
          }}
          activeDot={{ r: 6 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default CareerProgressChart;
