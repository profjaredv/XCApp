import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { UserPlus, CalendarPlus, GraduationCap, Users } from 'lucide-react';
import { rosterService, type RosterAthlete } from '@/api/rosterService';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { gradeLabel } from '@/lib/seasonUtils';
import { useQueryParamNumber } from '@/hooks/useQueryState';

// The roster is the thing a coach actually manages day to day: who is on the
// team this season, what grade they're in, who just graduated. Before this
// page the only way an athlete could exist was to be scraped out of a results
// page, so a team couldn't be set up before its first race.

const RosterPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: context } = useTeamContext();
  const { data: seasons = [] } = useAvailableSeasons(context?.team?.id);

  const [seasonOverride, setSeasonOverride] = useQueryParamNumber('season');
  const season = seasonOverride ?? context?.activeSeason;

  const [showGraduated, setShowGraduated] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [startSeasonOpen, setStartSeasonOpen] = useState(false);

  const [newName, setNewName] = useState('');
  const [newGrade, setNewGrade] = useState<string>('9');
  const [newGender, setNewGender] = useState<string>('M');

  const {
    data: roster = [],
    isLoading,
  } = useQuery({
    queryKey: ['roster', season, showGraduated],
    queryFn: () => rosterService.getRoster(season, { activeOnly: !showGraduated }),
    enabled: season !== undefined,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['roster'] });
    queryClient.invalidateQueries({ queryKey: ['teamContext'] });
    queryClient.invalidateQueries({ queryKey: ['availableSeasons'] });
  };

  const addAthlete = useMutation({
    mutationFn: () =>
      rosterService.addAthlete({
        name: newName.trim(),
        grade: parseInt(newGrade, 10),
        gender: newGender,
        season,
      }),
    onSuccess: () => {
      toast.success(`${newName.trim()} added to the ${season} roster`);
      setNewName('');
      setAddOpen(false);
      invalidate();
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ??
        'Could not add athlete';
      toast.error(message);
    },
  });

  const nextSeason = (context?.activeSeason ?? new Date().getFullYear()) + 1;
  const startSeason = useMutation({
    mutationFn: () => rosterService.startSeason(nextSeason),
    onSuccess: (result) => {
      toast.success(result.message);
      setStartSeasonOpen(false);
      setSeasonOverride(result.season);
      invalidate();
    },
    onError: () => toast.error('Could not start the new season'),
  });

  const removeFromRoster = useMutation({
    mutationFn: (athleteId: string) => rosterService.removeFromRoster(season!, athleteId),
    onSuccess: () => {
      toast.success('Removed from roster (results kept)');
      invalidate();
    },
    onError: () => toast.error('Could not update roster'),
  });

  const byGrade = useMemo(() => {
    const groups = new Map<number | null, RosterAthlete[]>();
    for (const athlete of roster) {
      const key = athlete.grade ?? null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(athlete);
    }
    return [...groups.entries()].sort((a, b) => (b[0] ?? -1) - (a[0] ?? -1));
  }, [roster]);

  const summary = context?.activeSeasonSummary;
  const isPreseason = season === context?.activeSeason && summary?.isPreseason;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Roster</h1>
          <p className="text-muted-foreground">
            Manage who is on the team, season by season.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={season?.toString() ?? ''}
            onValueChange={(v) => setSeasonOverride(parseInt(v, 10))}
          >
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Season" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.year} value={s.year.toString()}>
                  {s.year}
                  {s.isActive ? ' (Active)' : ''}
                  {!s.hasData && s.rosterCount > 0 ? ' — preseason' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setStartSeasonOpen(true)}>
            <CalendarPlus className="mr-2 h-4 w-4" />
            Start {nextSeason}
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add athlete
          </Button>
        </div>
      </div>

      {isPreseason && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              {season} preseason
            </CardTitle>
            <CardDescription>
              You have {summary?.rosterCount} athletes on the roster and no races yet. Analytics
              will fill in once results are imported — the roster below is ready to go.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant={showGraduated ? 'outline' : 'secondary'}
          size="sm"
          onClick={() => setShowGraduated(false)}
        >
          Current roster
        </Button>
        <Button
          variant={showGraduated ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowGraduated(true)}
        >
          <GraduationCap className="mr-2 h-4 w-4" />
          Include past athletes
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : roster.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-semibold">No athletes on the {season} roster yet</p>
              <p className="text-sm text-muted-foreground">
                Add them by hand, or import a season from Athletic.net to build the roster
                automatically.
              </p>
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add your first athlete
            </Button>
          </CardContent>
        </Card>
      ) : (
        byGrade.map(([grade, athletes]) => (
          <Card key={grade ?? 'unknown'}>
            <CardHeader>
              <CardTitle className="text-lg">
                {gradeLabel(grade)}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  ({athletes.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {athletes.map((athlete) => (
                <div
                  key={athlete.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{athlete.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {athlete.graduationYear ? `Class of ${athlete.graduationYear}` : 'No class year'}
                      {athlete.raceCount > 0 ? ` • ${athlete.raceCount} races in ${season}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {athlete.graduated && <Badge variant="secondary">Graduated</Badge>}
                    {!athlete.graduationYear && <Badge variant="outline">Needs class year</Badge>}
                    {athlete.onRoster && !athlete.graduated && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFromRoster.mutate(athlete.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addAthlete.mutate()}
              disabled={!newName.trim() || addAthlete.isPending}
            >
              {addAthlete.isPending ? 'Adding…' : 'Add athlete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={startSeasonOpen} onOpenChange={setStartSeasonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start the {nextSeason} season</DialogTitle>
            <DialogDescription>
              Returning athletes move up a grade and carry over to {nextSeason}. Seniors graduate
              off the active roster — their races, PRs and trends stay in the app permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartSeasonOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => startSeason.mutate()} disabled={startSeason.isPending}>
              {startSeason.isPending ? 'Starting…' : `Start ${nextSeason}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RosterPage;
