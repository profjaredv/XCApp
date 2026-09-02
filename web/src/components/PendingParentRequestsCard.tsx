import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Check, Loader2, UserPlus, X } from 'lucide-react';
import { teamService } from '@/api/teamService';
import { AthletePicker } from '@/components/groups/AthletePicker';
import { getApiErrorMessage } from '@/lib/apiError';
import { accentFor } from '@/lib/sectionAccent';
import { cn } from '@/lib/utils';
import type { RosterAthlete } from '@/api/rosterService';

// Parents who asked for this team but had no join code.
//
// The guardian flow keys on the join code, which is right when a parent
// has one. A parent who does not — who found the team by searching for
// their school at sign-up — filed a platform request instead, where a
// super admin could only decline it and the coach who should decide never
// learned it existed. This is that request, brought to the person who can
// actually answer it.
//
// The parent already named their child in free text. Matching that to a
// roster row is a judgement only a coach can make, so it is a deliberate
// pick rather than an automatic name match — "Woods" could be two
// siblings, and guessing wrong hands a stranger a student's information.

export const PendingParentRequestsCard: React.FC<{ roster: RosterAthlete[] }> = ({ roster }) => {
  const queryClient = useQueryClient();
  const accent = accentFor('groups');
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string[]>>({});

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['parentRequests'],
    queryFn: () => teamService.parentRequests(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['parentRequests'] });
    queryClient.invalidateQueries({ queryKey: ['pendingGuardianLinks'] });
  };

  const link = useMutation({
    mutationFn: ({ id, athleteIds }: { id: string; athleteIds: string[] }) =>
      teamService.linkParentRequest(id, athleteIds),
    onSuccess: (result, variables) => {
      invalidate();
      setOpenFor(null);
      setPicked((prev) => ({ ...prev, [variables.id]: [] }));
      toast.success(`Linked to ${result.linked.join(' and ')}.`);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not link that parent.')),
  });

  const decline = useMutation({
    mutationFn: (id: string) => teamService.declineParentRequest(id),
    onSuccess: () => {
      invalidate();
      toast.success('Request declined.');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not decline that.')),
  });

  // Nothing pending is the normal state; an empty card every day is noise
  // on a page a coach opens constantly.
  if (!isLoading && requests.length === 0) return null;

  const nameOf = (a: RosterAthlete) => a.preferredName || a.name;

  return (
    <Card className="relative overflow-hidden">
      <div className={cn('absolute inset-x-0 top-0 h-1', accent.rail)} aria-hidden />
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserPlus className={cn('h-5 w-5', accent.text)} />
          Parents waiting to be linked
          {requests.length > 0 && <Badge variant="secondary">{requests.length}</Badge>}
        </CardTitle>
        <CardDescription>
          These parents asked for your team without a join code, so they told us their athlete's
          name instead. Pick who they belong to — approving gives read-only access to that athlete
          only.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading && <Skeleton className="h-20 w-full" />}

        {requests.map((request) => {
          const selected = picked[request.id] ?? [];
          const isOpen = openFor === request.id;
          return (
            <div key={request.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{request.name || request.email}</p>
                  <p className="text-xs text-muted-foreground">{request.email}</p>
                  {/* Free text the parent typed. Shown as a quote rather
                      than a field, because it is their words and may not
                      be a name at all. */}
                  <p className="mt-2 text-sm">
                    <span className="text-muted-foreground">Says their athlete is </span>
                    <span className="font-medium">“{request.message}”</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => setOpenFor(isOpen ? null : request.id)}>
                    {isOpen ? 'Cancel' : 'Match to athlete'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decline.isPending}
                    onClick={() => decline.mutate(request.id)}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Decline
                  </Button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  {selected.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selected.map((id) => {
                        const athlete = roster.find((a) => a.id === id);
                        return (
                          <Badge key={id} variant="secondary" className="gap-1">
                            {athlete ? nameOf(athlete) : id}
                            <button
                              type="button"
                              onClick={() =>
                                setPicked((prev) => ({
                                  ...prev,
                                  [request.id]: (prev[request.id] ?? []).filter((x) => x !== id),
                                }))
                              }
                              aria-label="Remove"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {/* Multi-select: a parent with two runners on the team is
                      ordinary, and this is the moment to say so. */}
                  <AthletePicker
                    athletes={roster
                      .filter((a) => !selected.includes(a.id))
                      .map((a) => ({ id: a.id, name: nameOf(a), grade: a.grade }))}
                    onPick={(id) =>
                      setPicked((prev) => ({
                        ...prev,
                        [request.id]: [...(prev[request.id] ?? []), id],
                      }))
                    }
                    placeholder="Search your roster…"
                    emptyLabel="No athletes on this season's roster."
                  />

                  <Button
                    size="sm"
                    disabled={selected.length === 0 || link.isPending}
                    onClick={() => link.mutate({ id: request.id, athleteIds: selected })}
                  >
                    {link.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Link parent to {selected.length || 'an'} athlete{selected.length === 1 ? '' : 's'}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default PendingParentRequestsCard;
