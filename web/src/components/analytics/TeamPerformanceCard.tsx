import React from 'react';
import { TeamPerformance } from '@/types/analytics';
import { formatPace } from '@/lib/utils';

interface TeamPerformanceCardProps {
  title: string;
  data: TeamPerformance;
  className?: string;
}

export const TeamPerformanceCard: React.FC<TeamPerformanceCardProps> = ({ 
  title, 
  data,
  className = '' 
}) => {
  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-sm text-gray-500">Total Races</div>
          <div className="text-2xl font-bold">{data.totalRaces}</div>
        </div>
        
        <div className="space-y-2">
          <div className="text-sm text-gray-500">Total Distance</div>
          <div className="text-2xl font-bold">{data.totalMiles.toFixed(1)} mi</div>
        </div>
        
        <div className="space-y-2">
          <div className="text-sm text-gray-500">Avg Mile Pace</div>
          <div className="text-2xl font-bold">{formatPace(data.avgMilePace)}</div>
        </div>
        
        <div className="space-y-2">
          <div className="text-sm text-gray-500">Improvement</div>
          <div className="text-2xl font-bold text-green-600">
            {data.improvementPercent > 0 ? '+' : ''}
            {data.improvementPercent.toFixed(1)}%
          </div>
        </div>
      </div>
      
      <div className="mt-4">
        <div className="flex justify-between text-sm text-gray-500 mb-1">
          <span>First Meet: {data.firstMeet.name}</span>
          <span>{formatPace(data.firstMeet.avgPace)}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-500">
          <span>Last Meet: {data.lastMeet.name}</span>
          <span>{formatPace(data.lastMeet.avgPace)}</span>
        </div>
      </div>
    </div>
  );
};
