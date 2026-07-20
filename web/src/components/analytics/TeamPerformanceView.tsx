import React from 'react';
import { TeamPerformance, Athlete, Meet } from '../../types/analytics';
import { formatTime, formatPace, formatDateShort } from '../../lib/utils';

interface TeamPerformanceViewProps {
  title: string;
  team: TeamPerformance;
  athletes: Athlete[];
  meets: Meet[];
}

export const TeamPerformanceView: React.FC<TeamPerformanceViewProps> = ({
  title,
  team,
  athletes,
  meets
}) => {
  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-4">{title} Overview</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="space-y-2">
            <div className="text-sm text-gray-500">Total Meets</div>
            <div className="text-3xl font-bold">{team.meetCount || 0}</div>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm text-gray-500">Total Races</div>
            <div className="text-3xl font-bold">{team.totalRaces || 0}</div>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm text-gray-500">Total Distance</div>
            <div className="text-3xl font-bold">{typeof team.totalMiles === 'number' ? team.totalMiles.toFixed(1) : '0.0'} mi</div>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm text-gray-500">Athlete Count</div>
            <div className="text-3xl font-bold">{team.totalRunners || athletes.length || 0}</div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-2">
            <div className="text-sm text-gray-500">Avg Mile Pace</div>
            <div className="text-3xl font-bold">{formatPace(team.avgMilePace || 0)}</div>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm text-gray-500">Improvement</div>
            <div className="text-3xl font-bold text-green-600">
              {(team.improvementPercent || 0) > 0 ? '+' : ''}
              {(team.improvementPercent || 0).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold mb-4">Top Performers</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Athlete</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grade</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Best Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Meet</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pace</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {athletes
                .sort((a, b) => (a.bestTime || Infinity) - (b.bestTime || Infinity))
                .slice(0, 10)
                .map((athlete) => (
                  <tr key={athlete.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{athlete.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{athlete.currentGrade}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium">
                        {athlete.bestTime ? formatTime(athlete.bestTime) : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {athlete.currentSeason?.bestRace?.name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {athlete.currentSeason?.bestRace?.pace ? formatPace(athlete.currentSeason.bestRace.pace) : 'N/A'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold mb-4">Meet Results</h3>
        <div className="space-y-4">
          {meets
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map((meet) => (
              <div key={meet.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium">{meet.name}</h4>
                  <span className="text-sm text-gray-500">{formatDateShort(meet.date)}</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Distance</div>
                    <div>{(meet.distance / 1609.34).toFixed(2)} mi</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Avg Pace</div>
                    <div>{formatPace(meet.avgPace)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Runners</div>
                    <div>{meet.runners} athletes</div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
