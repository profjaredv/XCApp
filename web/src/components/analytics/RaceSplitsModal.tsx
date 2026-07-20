import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatTime } from '@/lib/formatUtils';
import { splitsService } from '@/api/splitsService';
import type { SplitFormData } from '@/types/splits';
import type { RaceResult } from '@/types/analytics';

interface RaceSplitsModalProps {
  raceId: string;
  raceName: string;
  raceDistance: number; // in meters
  results: RaceResult[];
  onClose: () => void;
  onSave?: () => void;
}

export const RaceSplitsModal: React.FC<RaceSplitsModalProps> = ({
  raceId,
  raceName,
  raceDistance,
  results,
  onClose,
  onSave
}) => {
  const [splits, setSplits] = useState<SplitFormData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine split configuration based on race distance
  const distanceMiles = raceDistance / 1609.34;
  const is5K = Math.abs(distanceMiles - 3.1) < 0.1;
  const is3Mile = Math.abs(distanceMiles - 3.0) < 0.1;
  const is2Mile = Math.abs(distanceMiles - 2.0) < 0.1;
  const is1_5Mile = Math.abs(distanceMiles - 1.5) < 0.1;
  const is1Mile = Math.abs(distanceMiles - 1.0) < 0.1;

  // Calculate final split distance (not used in current implementation)
  // let finalSplitDistance = 1.0; // default
  // if (is5K) finalSplitDistance = 1.1; // 5K = 3.1 miles, so last split is 1.1
  // else if (is3Mile) finalSplitDistance = 1.0;
  // else if (is2Mile) finalSplitDistance = 1.0; // 2 mile race: mile 1, mile 2
  // else if (is1_5Mile) finalSplitDistance = 0.5; // 1.5 mile: mile 1, 0.5 mile
  // else if (is1Mile) finalSplitDistance = 0; // 1 mile: just mile 1

  const needsMile3 = !is1Mile && !is1_5Mile;
  const needsMile2 = !is1Mile;

  // Initialize splits from results
  useEffect(() => {
    const loadSplits = async () => {
      setLoading(true);
      try {
        const existingSplits = await splitsService.getRaceSplits(raceId);
        const existingSplitsMap = new Map(existingSplits.map(s => [s.resultId, s]));

        const initialSplits: SplitFormData[] = results.map(result => {
          const existing = existingSplitsMap.get(result.id || '');
          return {
            resultId: result.id || '',
            athleteId: result.athleteId,
            raceId,
            athleteName: result.name || (result as unknown as { athlete?: { name?: string } }).athlete?.name || 'Unknown',
            finishTime: result.time,
            mile1: existing ? existing.mile1.toString() : '',
            mile2: existing ? existing.mile2.toString() : '',
            mile3: existing ? existing.mile3.toString() : ''
          };
        });

        setSplits(initialSplits);
      } catch (err) {
        console.error('Error loading splits:', err);
        // Still initialize with empty splits even if loading fails
        const initialSplits: SplitFormData[] = results.map(result => ({
          resultId: result.id || '',
          athleteId: result.athleteId,
          raceId,
          athleteName: result.name || (result as unknown as { athlete?: { name?: string } }).athlete?.name || 'Unknown',
          finishTime: result.time,
          mile1: '',
          mile2: '',
          mile3: ''
        }));
        setSplits(initialSplits);
      } finally {
        setLoading(false);
      }
    };

    loadSplits();
  }, [raceId, results]);

  // Parse time string (MM:SS or seconds) to seconds
  const parseTimeInput = (value: string): number => {
    if (!value) return 0;
    // Check if it's in MM:SS format
    if (value.includes(':')) {
      const [mins, secs] = value.split(':').map(s => parseFloat(s) || 0);
      return mins * 60 + secs;
    }
    // Otherwise treat as raw seconds
    return parseFloat(value) || 0;
  };

  // Format seconds to MM:SS for display
  const formatTimeInput = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSplitChange = (index: number, field: 'mile1' | 'mile2' | 'mile3', value: string) => {
    const newSplits = [...splits];
    newSplits[index] = { ...newSplits[index], [field]: value };
    setSplits(newSplits);
  };

  const calculateTwoMile = (mile1: string, mile2: string): number => {
    const m1 = parseTimeInput(mile1);
    const m2 = parseTimeInput(mile2);
    return m1 + m2;
  };

  const calculateMile3 = (finishTime: number, mile1: string, mile2: string): number => {
    const twoMile = calculateTwoMile(mile1, mile2);
    return finishTime - twoMile;
  };

  const autoCalculateMile3 = (index: number) => {
    const split = splits[index];
    const mile3 = calculateMile3(split.finishTime, split.mile1, split.mile2);
    if (mile3 > 0) {
      handleSplitChange(index, 'mile3', formatTimeInput(mile3));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Filter out splits that have at least one mile entered
      const splitsToSave = splits.filter(s => 
        s.mile1 || s.mile2 || s.mile3
      );

      if (splitsToSave.length === 0) {
        setError('No splits to save');
        setSaving(false);
        return;
      }

      // Convert time strings to seconds before saving
      const splitsWithSeconds = splitsToSave.map(s => ({
        ...s,
        mile1: parseTimeInput(s.mile1).toString(),
        mile2: parseTimeInput(s.mile2).toString(),
        mile3: parseTimeInput(s.mile3).toString()
      }));

      await splitsService.saveSplitsBatch(splitsWithSeconds);
      
      if (onSave) {
        onSave();
      }
      onClose();
    } catch (err) {
      console.error('Error saving splits:', err);
      setError('Failed to save splits. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const validSplitsCount = useMemo(() => {
    return splits.filter(s => s.mile1 && s.mile2 && s.mile3).length;
  }, [splits]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8">
          <p>Loading splits...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white w-full h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold">{raceName} - Race Splits</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {is5K && 'Enter mile splits (Mile 1, Mile 2, final 1.1 miles). Final split can be auto-calculated.'}
              {is3Mile && 'Enter mile splits (Mile 1, Mile 2, Mile 3). Mile 3 can be auto-calculated.'}
              {is2Mile && 'Enter mile splits (Mile 1, Mile 2).'}
              {is1_5Mile && 'Enter splits (Mile 1, final 0.5 miles).'}
              {is1Mile && 'Enter Mile 1 split.'}
              {!is5K && !is3Mile && !is2Mile && !is1_5Mile && !is1Mile && `Enter splits for ${distanceMiles.toFixed(2)} mile race.`}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Info/Warning */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
            ⚠️ Could not load existing splits (table may not exist yet). You can still enter new splits below.
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto p-6">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold">Athlete</th>
                <th className="text-right p-3 font-semibold">Finish Time</th>
                <th className="text-right p-3 font-semibold">Mile 1</th>
                {needsMile2 && <th className="text-right p-3 font-semibold">Mile 2</th>}
                {needsMile2 && <th className="text-right p-3 font-semibold">2-Mile</th>}
                {needsMile3 && (
                  <th className="text-right p-3 font-semibold">
                    {is5K ? 'Final 1.1mi' : is1_5Mile ? 'Final 0.5mi' : 'Mile 3'}
                  </th>
                )}
                <th className="text-center p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {splits.map((split, index) => {
                const twoMile = calculateTwoMile(split.mile1, split.mile2);
                
                return (
                  <tr key={split.resultId} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{split.athleteName}</td>
                    <td className="p-3 text-right font-mono text-sm">
                      {formatTime(split.finishTime)}
                    </td>
                    <td className="p-3">
                      <Input
                        type="text"
                        value={split.mile1}
                        onChange={(e) => handleSplitChange(index, 'mile1', e.target.value)}
                        placeholder="5:48"
                        className="text-right font-mono"
                      />
                    </td>
                    {needsMile2 && (
                      <td className="p-3">
                        <Input
                          type="text"
                          value={split.mile2}
                          onChange={(e) => handleSplitChange(index, 'mile2', e.target.value)}
                          placeholder="5:48"
                          className="text-right font-mono"
                        />
                      </td>
                    )}
                    {needsMile2 && (
                      <td className="p-3 text-right font-mono text-sm text-muted-foreground">
                        {twoMile > 0 ? formatTime(twoMile) : '-'}
                      </td>
                    )}
                    {needsMile3 && (
                      <td className="p-3">
                        <Input
                          type="text"
                          value={split.mile3}
                          onChange={(e) => handleSplitChange(index, 'mile3', e.target.value)}
                          placeholder="5:48"
                          className="text-right font-mono"
                        />
                      </td>
                    )}
                    <td className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => autoCalculateMile3(index)}
                        disabled={!split.mile1 || !split.mile2}
                        title="Auto-calculate Mile 3"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="text-sm text-muted-foreground">
            {validSplitsCount} of {splits.length} athletes have complete splits
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || validSplitsCount === 0}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Splits'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
