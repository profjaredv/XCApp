import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { CalendarPlus, Info, Loader2 } from 'lucide-react';
import { rosterService } from '@/api/rosterService';
import { useTeamContext } from '@/hooks/useTeamContext';
import { getApiErrorMessage } from '@/lib/apiError';

// Rolling the team over to next season.
//
// This lived on the Roster page, next to the season picker, which put a
// once-a-year irreversible action in the middle of a screen a coach opens
// every day. Picking which season to look at is navigation; creating one
// is configuration, and they only looked alike because both mention a
// year.

export const SeasonRolloverCard: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: context } = useTeamContext();
  const [open, setOpen] = useState(false);

  const activeSeason = context?.activeSeason ?? new Date().getFullYear();
  const nextSeason = activeSeason + 1;
  // Rolling over mid-preseason would carry an empty roster forward and
  // leave the current season looking finished when it never started.
  const canStart = !context?.activeSeasonSummary?.isPreseason;

  const startSeason = useMutation({
    mutationFn: () => rosterService.startSeason(nextSeason),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['teamContext'] });
      queryClient.invalidateQueries({ queryKey: ['roster'] });
      queryClient.invalidateQueries({ queryKey: ['availableSeasons'] });
      setOpen(false);
      toast.success(
        `${nextSeason} started — ${result.carriedCount} athletes carried over, ${result.graduatedCount} graduated.`
      );
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not start that season.')),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Your team is on the <strong>{activeSeason}</strong> season. Starting {nextSeason} moves
        returning athletes up a grade and retires the seniors — their races, PRs and trends stay in
        the app permanently.
      </p>

      {!canStart && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {activeSeason} has no race results yet, so it is still preseason. Starting {nextSeason}{' '}
            now would carry an empty roster forward.
          </AlertDescription>
        </Alert>
      )}

      <Button onClick={() => setOpen(true)} disabled={!canStart}>
        <CalendarPlus className="mr-2 h-4 w-4" />
        Start the {nextSeason} season
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start the {nextSeason} season</DialogTitle>
            <DialogDescription>
              Returning athletes move up a grade and carry over to {nextSeason}. Seniors graduate
              off the active roster — their races, PRs and trends stay in the app permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => startSeason.mutate()} disabled={startSeason.isPending}>
              {startSeason.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start {nextSeason}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SeasonRolloverCard;
