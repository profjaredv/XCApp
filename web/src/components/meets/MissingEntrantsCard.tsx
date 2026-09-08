import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, UserX } from 'lucide-react';
import { useMeetEntrants, useAddEntrantToRace } from '@/hooks/useMeetOps';
import { useRosterWithRaces } from '@/hooks/useGroups';

// "I need to see who is not rostered in the set of races" — meet-wide, not
// per-race: a coach checking a whole roster against every race at one meet
// before the bus leaves, not just the race currently selected above. Someone
// entered in Varsity Boys but never added to JV Boys still needs to show up
// here, so this reads useMeetEntrants (every race's entrants at once), not
// the single-race useRaceEntrants ManageEntrantsDialog uses.
export const MissingEntrantsCard: React.FC<{ meetId: string; seasonYear: number | null }> = ({ meetId, seasonYear }) => {
  const { data: meetEntrants, isLoading: entrantsLoading } = useMeetEntrants(meetId);
  const { data: roster = [], isLoading: rosterLoading } = useRosterWithRaces(seasonYear ?? undefined);
  const addToRace = useAddEntrantToRace();

  // Which race is picked for each not-yet-entered athlete's row, before
  // they hit Add — starts unset so a coach always makes an explicit
  // choice rather than silently defaulting to whichever race sorts first.
  const [raceChoice, setRaceChoice] = useState<Record<string, string>>({});
  // addToRace.isPending is one flag shared by every row (one mutation
  // instance for the whole card) — tracking which specific athlete is
  // in flight keeps the spinner/disabled state on just that row instead
  // of freezing the whole list while one add is in progress.
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const enteredAnywhere = useMemo(() => {
    const set = new Set<string>();
    meetEntrants?.races.forEach((race) => race.entrants.forEach((e) => set.add(e.athleteId)));
    return set;
  }, [meetEntrants]);

  const notEntered = useMemo(
    () =>
      roster
        .filter((a) => !enteredAnywhere.has(a.id))
        .map((a) => ({ id: a.id, name: a.preferredName || a.name, grade: a.grade }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [roster, enteredAnywhere]
  );

  const races = meetEntrants?.races ?? [];
  const loading = entrantsLoading || rosterLoading;

  const handleAdd = async (athleteId: string) => {
    const raceId = raceChoice[athleteId];
    if (!raceId) return;
    setSubmittingId(athleteId);
    try {
      await addToRace.mutateAsync({ raceId, athleteId });
      setRaceChoice((prev) => {
        const next = { ...prev };
        delete next[athleteId];
        return next;
      });
    } catch {
      toast.error('Could not add that athlete.');
    } finally {
      setSubmittingId(null);
    }
  };

  if (races.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who's not entered yet</CardTitle>
        <CardDescription>Checked against every race at this meet, not just the one selected below.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : notEntered.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Everyone on the roster is entered in at least one race.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserX className="h-4 w-4" />
              {notEntered.length} on the roster {notEntered.length === 1 ? "isn't" : "aren't"} entered anywhere at this meet.
            </p>
            <div className="max-h-[40vh] space-y-2 overflow-y-auto">
              {notEntered.map((athlete) => (
                <div key={athlete.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {athlete.name}
                    {athlete.grade != null && <span className="ml-1.5 text-xs text-muted-foreground">Gr {athlete.grade}</span>}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Select value={raceChoice[athlete.id] ?? ''} onValueChange={(v) => setRaceChoice((prev) => ({ ...prev, [athlete.id]: v }))}>
                      <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Add to…" /></SelectTrigger>
                      <SelectContent>
                        {races.map((race) => (
                          <SelectItem key={race.id} value={race.id}>{race.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={() => handleAdd(athlete.id)}
                      disabled={!raceChoice[athlete.id] || submittingId === athlete.id}
                    >
                      {submittingId === athlete.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MissingEntrantsCard;
