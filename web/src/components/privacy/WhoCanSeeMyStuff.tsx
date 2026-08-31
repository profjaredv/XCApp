import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Eye, Lock, ShieldCheck, Users, UserCheck } from 'lucide-react';
import { trainingLogService } from '@/api/trainingLogService';
import { getApiErrorMessage } from '@/lib/apiError';

// "Who can see my stuff" — one honest answer, in one place.
//
// The app already enforced sharing correctly at the query layer. What it
// did not have was anywhere an athlete could SEE the shape of what she had
// agreed to: decisions were made one log at a time, months apart, with no
// way to survey them. A control nobody can survey is not really a control,
// and "it's all gated" is only reassuring if the person it protects can
// check.
//
// Deliberately built on live counts rather than a restatement of settings.
// "9 of 41 runs are shared with your coach" is checkable; "sharing is
// enabled" is a claim.

const Row: React.FC<{
  icon: React.ReactNode;
  label: string;
  detail: string;
  status: 'private' | 'partial' | 'shared';
}> = ({ icon, label, detail, status }) => (
  <div className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0">
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
    <Badge
      variant={status === 'private' ? 'secondary' : status === 'partial' ? 'outline' : 'default'}
      className="shrink-0"
    >
      {status === 'private' ? 'Private' : status === 'partial' ? 'Some shared' : 'Shared'}
    </Badge>
  </div>
);

export const WhoCanSeeMyStuff: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['myVisibility'],
    queryFn: () => trainingLogService.getVisibility(),
  });

  const setAll = useMutation({
    mutationFn: ({ coach, team }: { coach: boolean; team: boolean }) =>
      trainingLogService.setAllLogVisibility(coach, team),
    onSuccess: ({ updated }) => {
      queryClient.invalidateQueries({ queryKey: ['myVisibility'] });
      queryClient.invalidateQueries({ queryKey: ['myTrainingLogs'] });
      toast.success(`Updated ${updated} run${updated === 1 ? '' : 's'}.`);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not change that.')),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Who can see my stuff</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Who can see my stuff</CardTitle>
          <CardDescription>Could not load your sharing settings right now.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { trainingLogs, reflections, guardians } = data;

  const logStatus =
    trainingLogs.sharedWithCoach === 0 && trainingLogs.sharedWithTeam === 0
      ? 'private'
      : trainingLogs.sharedWithCoach >= trainingLogs.total && trainingLogs.total > 0
        ? 'shared'
        : 'partial';

  const reflectionStatus =
    reflections.sharedWithCoach === 0
      ? 'private'
      : reflections.sharedWithCoach >= reflections.total
        ? 'shared'
        : 'partial';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Eye className="h-5 w-5" />
          Who can see my stuff
        </CardTitle>
        <CardDescription>
          Nothing here is public. This is everyone who can see anything of yours, and what they see.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div>
          <Row
            icon={<Lock className="h-4 w-4" />}
            label="Your training runs"
            detail={
              trainingLogs.total === 0
                ? 'You have not logged any runs yet.'
                : `${trainingLogs.sharedWithCoach} of ${trainingLogs.total} shared with your coaches` +
                  (trainingLogs.sharedWithTeam > 0
                    ? `, ${trainingLogs.sharedWithTeam} with teammates.`
                    : '. None shared with teammates.')
            }
            status={logStatus}
          />
          <Row
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Your race reflections"
            detail={
              reflections.total === 0
                ? 'You have not written any yet.'
                : `${reflections.sharedWithCoach} of ${reflections.total} shared with your coaches. Never shown to teammates.`
            }
            status={reflectionStatus}
          />
          <Row
            icon={<Users className="h-4 w-4" />}
            label="Your race results and roster info"
            detail="Your coaches and teammates can see these. Meet results are published by the meet, not by LeadPack."
            status="shared"
          />
          <Row
            icon={<UserCheck className="h-4 w-4" />}
            label="Parents and guardians"
            detail={
              guardians.length === 0
                ? 'No parent account is linked to you.'
                : `${guardians.map((g) => g.name || g.email || 'A linked account').join(', ')} — read-only, meet and roster info only.`
            }
            status={guardians.length === 0 ? 'private' : 'shared'}
          />
        </div>

        {trainingLogs.total > 0 && (
          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">Change all my runs at once</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This changes every run you have logged, including past ones. You can still set
              individual runs afterwards.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={setAll.isPending}
                onClick={() => setAll.mutate({ coach: false, team: false })}
              >
                <Lock className="mr-2 h-4 w-4" />
                Make all private
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={setAll.isPending}
                onClick={() => setAll.mutate({ coach: true, team: false })}
              >
                Share all with coaches
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WhoCanSeeMyStuff;
