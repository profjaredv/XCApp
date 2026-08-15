import React, { useMemo } from 'react';
import SwarmChart from './SwarmChart';
import { formatTime } from '@/lib/formatUtils';
import { RaceResult } from '@/types/analytics';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';


interface RaceVisualizationProps {
  race: {
    id: string;
    name: string;
    results: RaceResult[];
  } | null;
  onClose: () => void;
  athleteNameMap: Map<string, string>;
}

const RaceVisualization: React.FC<RaceVisualizationProps> = ({ race, onClose, athleteNameMap }) => {

  const processedResults = useMemo(() => {
    if (!race || !Array.isArray(race.results)) return [];

    // Sorted by time for display/animation order only — NOT where "place"
    // comes from. r.place/r.teamPlace already arrive from the backend as
    // two distinct numbers (see lib/fieldPlacement.js / lib/teamPlace.js):
    // this used to silently fall back to the sorted array index whenever
    // r.place was unset, which meant "place" quietly meant team-relative
    // rank until a field-results upload existed for the race, then quietly
    // switched to meaning something else entirely under the same label.
    return [...race.results]
      .sort((a, b) => a.time - b.time)
      .map((r) => ({
        ...r,
        name: athleteNameMap.get(r.athleteId) || 'Unknown Runner',
      }));
  }, [race, athleteNameMap]);

  if (!race) return null;

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between pb-4 border-b">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{race.name}</h2>
          <p className="text-muted-foreground">Race Results & Visualization</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex-1 flex flex-col lg:flex-row gap-6 mt-6 overflow-hidden">
                <div className="lg:w-2/3 flex flex-col h-full">
          <h3 className="text-lg font-semibold mb-2">Race Distribution</h3>
          <div className="flex-1 relative border rounded-lg p-2">
            <SwarmChart results={processedResults} />
          </div>
        </div>
                <div className="lg:w-1/3 flex flex-col h-full">
          <h3 className="text-lg font-semibold mb-2">Full Results</h3>
          <div className="flex-1 border rounded-lg overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team Place</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Place</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PR</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {processedResults.map((result) => (
                  <tr key={result.athleteId}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {result.teamPlace != null ? `#${result.teamPlace}` : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{result.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{formatTime(result.time)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {result.place != null ? (
                        <>
                          #{result.place}
                          {result.overallPlace != null && (
                            <span className="block text-xs text-gray-400">Overall #{result.overallPlace}</span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{result.pr ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RaceVisualization;
