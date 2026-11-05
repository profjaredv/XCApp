import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatRaceTime, parseTimeToSeconds } from '../lib/raceFormat';
import type { AthleteBuildStats, AthleteRaceResult } from '../state/types';

interface DraftRace {
  // A stable React key independent of date/name — rows get added/removed
  // by index while being edited, so keying on their own (mutable) fields
  // would reorder/misattribute inputs mid-edit.
  key: string;
  date: string; // yyyy-mm-dd, matching <input type="date">
  raceName: string;
  distanceMeters: string;
  timeText: string; // m:ss
  best: boolean;
}

interface EditStatsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The currently-displayed stats (the override if one's active, else the
  // real fetched data) — what the form seeds from when it opens.
  stats: AthleteBuildStats;
  hasOverride: boolean;
  onApply: (edited: AthleteBuildStats) => void;
  onResetToOriginal: () => void;
}

let draftKeySeq = 0;
function newDraftKey(): string {
  draftKeySeq += 1;
  return `draft-${draftKeySeq}`;
}

function toDraftRace(r: AthleteRaceResult, isBest: boolean): DraftRace {
  return {
    key: newDraftKey(),
    date: r.date.slice(0, 10),
    raceName: r.raceName,
    distanceMeters: r.distanceMeters != null ? String(r.distanceMeters) : '',
    timeText: formatRaceTime(r.timeSec),
    best: isBest,
  };
}

/**
 * "Edit data for print" — a coach's local-only correction for whatever's
 * about to print, for when the computed/pulled numbers have an error that
 * needs fixing before handing out a collage, not a trip through the real
 * results-editing workflow. Nothing here ever reaches the backend: Apply
 * just swaps what modules/BuildModule.tsx renders/exports for an in-memory
 * edited copy (state.ts's AthleteBuildStats, not anything persisted), and
 * it resets the moment the athlete changes or their real stats refetch.
 *
 * Doesn't cover every field — careerRaces (the multi-season career chart)
 * and coaches are out of scope here; this is a quick-fix tool for the
 * season stats and race list a coach is most likely to spot a typo in
 * right before printing, not a full data-entry form.
 */
export const EditStatsPanel: React.FC<EditStatsPanelProps> = ({ open, onOpenChange, stats, hasOverride, onApply, onResetToOriginal }) => {
  const [grade, setGrade] = useState('');
  const [prText, setPrText] = useState('');
  const [totalRaces, setTotalRaces] = useState('');
  const [totalMiles, setTotalMiles] = useState('');
  const [avgPaceText, setAvgPaceText] = useState('');
  const [races, setRaces] = useState<DraftRace[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Re-seeds every time the dialog opens, from whatever's currently
  // displayed (the active override, if there is one, so re-opening to
  // tweak a previous edit doesn't lose it).
  useEffect(() => {
    if (!open) return;
    setGrade(stats.grade != null ? String(stats.grade) : '');
    setPrText(stats.careerBest5kSec != null ? formatRaceTime(stats.careerBest5kSec) : '');
    setTotalRaces(String(stats.totalRaces));
    setTotalMiles(stats.totalMiles != null ? String(stats.totalMiles) : '');
    setAvgPaceText(stats.averagePaceSecPerMile != null ? formatRaceTime(stats.averagePaceSecPerMile) : '');
    setRaces(stats.races.map((r) => toDraftRace(r, stats.bestByDistance.some((b) => b.raceName === r.raceName && b.date === r.date))));
    setError(null);
  }, [open, stats]);

  function updateRace(key: string, patch: Partial<DraftRace>) {
    setRaces((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRace(key: string) {
    setRaces((rs) => rs.filter((r) => r.key !== key));
  }

  function addRace() {
    setRaces((rs) => [...rs, { key: newDraftKey(), date: '', raceName: '', distanceMeters: '', timeText: '', best: false }]);
  }

  function handleApply() {
    const parsedGrade = grade.trim() === '' ? null : Number(grade);
    if (grade.trim() !== '' && !Number.isFinite(parsedGrade)) return setError('Grade must be a number.');

    const parsedPr = prText.trim() === '' ? null : parseTimeToSeconds(prText);
    if (prText.trim() !== '' && parsedPr == null) return setError('Career-best 5K must be m:ss, like 17:32.');

    const parsedTotalRaces = Number(totalRaces);
    if (!Number.isFinite(parsedTotalRaces) || parsedTotalRaces < 0) return setError('Races must be a non-negative number.');

    const parsedMiles = totalMiles.trim() === '' ? null : Number(totalMiles);
    if (totalMiles.trim() !== '' && !Number.isFinite(parsedMiles)) return setError('Race miles must be a number.');

    const parsedAvgPace = avgPaceText.trim() === '' ? null : parseTimeToSeconds(avgPaceText);
    if (avgPaceText.trim() !== '' && parsedAvgPace == null) return setError('Avg pace must be m:ss, like 6:45.');

    const parsedRaces: AthleteRaceResult[] = [];
    for (const r of races) {
      if (!r.raceName.trim() || !r.date) return setError('Every race needs a name and a date.');
      const timeSec = parseTimeToSeconds(r.timeText);
      if (timeSec == null) return setError(`"${r.raceName}"'s time must be m:ss, like 17:32.`);
      const distanceMeters = r.distanceMeters.trim() === '' ? null : Number(r.distanceMeters);
      if (r.distanceMeters.trim() !== '' && !Number.isFinite(distanceMeters)) return setError(`"${r.raceName}"'s distance must be a number of meters.`);
      parsedRaces.push({ raceName: r.raceName.trim(), date: r.date, distanceMeters, distanceLabel: null, timeSec });
    }
    parsedRaces.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const bestByDistance = races
      .filter((r) => r.best && r.raceName.trim() && r.date)
      .map((r) => ({
        raceName: r.raceName.trim(),
        date: r.date,
        distanceMeters: r.distanceMeters.trim() === '' ? null : Number(r.distanceMeters),
        distanceLabel: null,
        timeSec: parseTimeToSeconds(r.timeText) ?? 0,
      }));

    onApply({
      ...stats,
      grade: parsedGrade,
      careerBest5kSec: parsedPr,
      totalRaces: parsedTotalRaces,
      totalMiles: parsedMiles,
      averagePaceSecPerMile: parsedAvgPace,
      races: parsedRaces,
      bestByDistance,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit data for print</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-5 overflow-y-auto">
          <p className="text-sm text-ink-muted">
            Changes what prints on this athlete's collage only — nothing here is saved back to their real results.
            {hasOverride && ' Applying again replaces the previous adjustment.'}
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Grade</Label>
              <Input value={grade} onChange={(e) => setGrade(e.target.value)} className="h-8 border-ink-border bg-transparent text-sm text-ink-foreground" />
            </div>
            <div className="space-y-1">
              <Label>Career-best 5K</Label>
              <Input value={prText} onChange={(e) => setPrText(e.target.value)} placeholder="m:ss" className="h-8 border-ink-border bg-transparent text-sm text-ink-foreground" />
            </div>
            <div className="space-y-1">
              <Label>Races</Label>
              <Input value={totalRaces} onChange={(e) => setTotalRaces(e.target.value)} className="h-8 border-ink-border bg-transparent text-sm text-ink-foreground" />
            </div>
            <div className="space-y-1">
              <Label>Race miles</Label>
              <Input value={totalMiles} onChange={(e) => setTotalMiles(e.target.value)} className="h-8 border-ink-border bg-transparent text-sm text-ink-foreground" />
            </div>
            <div className="space-y-1">
              <Label>Avg pace / mile</Label>
              <Input value={avgPaceText} onChange={(e) => setAvgPaceText(e.target.value)} placeholder="m:ss" className="h-8 border-ink-border bg-transparent text-sm text-ink-foreground" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Races this season</Label>
              <Button type="button" size="sm" variant="outline" className="gap-1" onClick={addRace}>
                <Plus className="h-3.5 w-3.5" /> Add race
              </Button>
            </div>
            <div className="space-y-1.5">
              {races.map((r) => (
                <div key={r.key} className="grid grid-cols-[auto_1fr_4.5rem_4rem_auto_auto] items-center gap-1.5">
                  <input
                    type="date"
                    value={r.date}
                    onChange={(e) => updateRace(r.key, { date: e.target.value })}
                    className="h-8 rounded-md border border-ink-border bg-transparent px-1.5 text-xs text-ink-foreground"
                  />
                  <Input
                    value={r.raceName}
                    onChange={(e) => updateRace(r.key, { raceName: e.target.value })}
                    placeholder="Race name"
                    className="h-8 border-ink-border bg-transparent text-xs text-ink-foreground"
                  />
                  <Input
                    value={r.distanceMeters}
                    onChange={(e) => updateRace(r.key, { distanceMeters: e.target.value })}
                    placeholder="meters"
                    className="h-8 border-ink-border bg-transparent text-xs text-ink-foreground"
                  />
                  <Input
                    value={r.timeText}
                    onChange={(e) => updateRace(r.key, { timeText: e.target.value })}
                    placeholder="m:ss"
                    className="h-8 border-ink-border bg-transparent text-xs text-ink-foreground"
                  />
                  <label className="flex items-center gap-1 whitespace-nowrap text-[11px] text-ink-muted">
                    <input type="checkbox" checked={r.best} onChange={(e) => updateRace(r.key, { best: e.target.checked })} />
                    Best
                  </label>
                  <Button type="button" size="sm" variant="ghost" className="text-ink-muted" onClick={() => removeRace(r.key)} aria-label="Remove race">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {races.length === 0 && <p className="text-xs text-ink-muted">No races.</p>}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            className="text-ink-muted"
            disabled={!hasOverride}
            onClick={() => {
              onResetToOriginal();
              onOpenChange(false);
            }}
          >
            Reset to original data
          </Button>
          <Button type="button" onClick={handleApply}>
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
