import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUpdateRaceDistance } from '@/hooks/useMeetOps';
import { DISTANCE_PRESETS } from '@/lib/distancePresets';

// Correct one race's distance (every pace is time ÷ distance). Moved here
// verbatim from MeetDetailPage so the next shell's meet page (§4.6, the
// editable distance chip) uses the same dialog and the same endpoint.


export const RaceDistanceDialog: React.FC<{
  race: { id: string; name: string; distanceMeters: number | null } | null;
  onClose: () => void;
}> = ({ race, onClose }) => {
  const updateRaceDistance = useUpdateRaceDistance();
  const [distanceDraft, setDistanceDraft] = useState('');
  // Prefilled from the race being opened, as the inline version did on click.
  useEffect(() => {
    if (race) setDistanceDraft(race.distanceMeters ? String(Math.round(race.distanceMeters)) : '');
  }, [race]);

  return (
      <Dialog open={race !== null} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Distance — {race?.name}</DialogTitle>
            <DialogDescription>
              For a race that was published at one distance and revised later. Every pace in the app
              is time ÷ distance, so correcting this here fixes average pace, course difficulty and
              the adjusted times that depend on it. Finish times and places are untouched.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {DISTANCE_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant={Number(distanceDraft) === preset.meters ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDistanceDraft(String(preset.meters))}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="raceDistanceMeters">Metres</Label>
              <Input
                id="raceDistanceMeters"
                type="number"
                inputMode="numeric"
                value={distanceDraft}
                onChange={(e) => setDistanceDraft(e.target.value)}
                placeholder="e.g. 4800"
              />
            </div>
            {/* A re-scrape will not fix this and is not a second option:
                a Race is keyed on (team, name, date, distance), so the
                revised distance does not match and the import creates a
                DUPLICATE race — the original keeping the field results,
                splits and entrants, the new one holding a fresh copy of
                the results and none of the rest. */}
            <p className="text-xs text-muted-foreground">
              Fix it here rather than re-importing: a re-import would add a second copy of this race
              instead of correcting this one.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!(Number(distanceDraft) > 0) || updateRaceDistance.isPending}
              onClick={() => {
                if (!race) return;
                const meters = Number(distanceDraft);
                const preset = DISTANCE_PRESETS.find((p) => p.meters === meters);
                updateRaceDistance.mutate(
                  { raceId: race.id, distanceMeters: meters, distance: preset?.label },
                  {
                    onSuccess: () => {
                      onClose();
                      toast.success('Distance updated — season metrics are recalculating.');
                    },
                    onError: () => toast.error('Could not update that distance.'),
                  }
                );
              }}
            >
              {updateRaceDistance.isPending ? 'Saving…' : 'Save distance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
};
