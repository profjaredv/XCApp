import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { rosterService, type ExistingAthleteConflict } from '@/api/rosterService';
import { gradeLabel } from '@/lib/seasonUtils';

// Add an athlete to a season's roster — including the returning-athlete
// check (a 409 offers the existing record instead of a duplicate). Moved
// here verbatim from RosterPage so the next shell's Athletes page
// (docs/leadpack-new-ui-trial.md §4.4) adds athletes the same way.
export const AddAthleteDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  season: number | undefined;
  /** Called after a successful add — the host refreshes what it shows. */
  onAdded: () => void;
}> = ({ open, onOpenChange, season, onAdded }) => {
  const [newName, setNewName] = useState('');
  const [newPreferredName, setNewPreferredName] = useState('');
  const [newGrade, setNewGrade] = useState<string>('9');
  const [newGender, setNewGender] = useState<string>('M');

  // An athlete who is already on the team under this name. Adding a second
  // record for a returning athlete is the single most damaging thing a
  // coach can do by accident here: the new record goes into groups and
  // shows no history, while every past race stays on a row nothing points
  // at. The backend refuses with a 409 and hands back who it found; this
  // holds that answer so the dialog can offer the existing record instead.
  const [nameConflict, setNameConflict] = useState<ExistingAthleteConflict | null>(null);

  const addAthlete = useMutation({
    mutationFn: (opts?: { allowDuplicate?: boolean }) =>
      rosterService.addAthlete({
        name: newName.trim(),
        ...(newPreferredName.trim() ? { preferredName: newPreferredName.trim() } : {}),
        grade: parseInt(newGrade, 10),
        gender: newGender,
        season,
        ...(opts?.allowDuplicate ? { allowDuplicate: true } : {}),
      }),
    onSuccess: () => {
      toast.success(`${newName.trim()} added to the ${season} roster`);
      setNewName('');
      setNewPreferredName('');
      setNameConflict(null);
      onOpenChange(false);
      onAdded();
    },
    onError: (err: unknown) => {
      const response = (err as { response?: { status?: number; data?: ExistingAthleteConflict & { msg?: string } } })
        ?.response;
      if (response?.status === 409 && response.data?.code === 'ATHLETE_EXISTS') {
        setNameConflict(response.data);
        return;
      }
      toast.error(response?.data?.msg ?? 'Could not add athlete');
    },
  });

  // Put the existing record on this season's roster — the fix for the case
  // that brings a coach here: a returning athlete whose races are all in a
  // past season, so the roster filtered them out and they looked missing.
  const putExistingOnRoster = useMutation({
    mutationFn: (athleteId: string) => rosterService.addToRoster(season as number, athleteId),
    onSuccess: () => {
      toast.success('Added to the roster — their history came with them.');
      setNewName('');
      setNewPreferredName('');
      setNameConflict(null);
      onOpenChange(false);
      onAdded();
    },
    onError: () => toast.error('Could not add them to this season.'),
  });

  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add athlete</DialogTitle>
            <DialogDescription>
              Adds them to the {season} roster. Grade is stored as a class year, so they move up
              automatically each season.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="athleteName">Name</Label>
              <Input
                id="athleteName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="First Last"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="athletePreferredName">Preferred name / nickname (optional)</Label>
              <Input
                id="athletePreferredName"
                value={newPreferredName}
                onChange={(e) => setNewPreferredName(e.target.value)}
                placeholder="What they go by, if different"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Grade</Label>
                <Select value={newGrade} onValueChange={setNewGrade}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[9, 10, 11, 12].map((g) => (
                      <SelectItem key={g} value={g.toString()}>
                        {gradeLabel(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={newGender} onValueChange={setNewGender}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Boys</SelectItem>
                    <SelectItem value="F">Girls</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Almost always a returning athlete rather than two people
                with the same name. Their races live in a season this
                screen isn't showing, so the roster filtered them out and
                they looked missing — adding a second record is how ten
                seasons of history ends up orphaned. */}
            {nameConflict && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-3">
                  <p>{nameConflict.msg} Is this them?</p>
                  {nameConflict.existing.map((existing) => (
                    <div key={existing.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">
                        <strong>{existing.preferredName || existing.name}</strong>
                        {existing.graduationYear ? ` · class of ${existing.graduationYear}` : ''}
                        {' · '}
                        {existing.careerRaceCount} career race{existing.careerRaceCount === 1 ? '' : 's'}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => putExistingOnRoster.mutate(existing.id)}
                        disabled={putExistingOnRoster.isPending}
                      >
                        {putExistingOnRoster.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Add this one to {season}
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addAthlete.mutate({ allowDuplicate: true })}
                    disabled={addAthlete.isPending}
                  >
                    No — this is a different athlete with the same name
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNameConflict(null);
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => addAthlete.mutate(undefined)}
              disabled={!newName.trim() || addAthlete.isPending || !!nameConflict}
            >
              {addAthlete.isPending ? 'Adding…' : 'Add athlete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
};
