import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Check, Loader2, UserCheck, X } from 'lucide-react';
import { teamService } from '@/api/teamService';
import { getApiErrorMessage } from '@/lib/apiError';
import { accentFor } from '@/lib/sectionAccent';
import { cn } from '@/lib/utils';

// Parents waiting to be linked to their athlete.
//
// This card is the missing half of a feature that was otherwise complete:
// POST /team/approve-guardian-link has existed for a long time, but nothing
// ever listed the requests, so a parent's request sat in `pending` forever
// and no coach was told it existed. From the parent's side it looked like
// the app had swallowed it.
//
// One row per child on purpose. A parent with two runners files one
// request covering both, but a coach approves each separately — they might
// know one family relationship and not the other, and collapsing them into
// a single yes would make that impossible to express.

export const PendingGuardianLinksCard: React.FC = () => {
  const queryClient = useQueryClient();
  const accent = accentFor('groups');

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['pendingGuardianLinks'],
    queryFn: () => teamService.pendingGuardianLinks(),
  });

  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      teamService.resolveGuardianLink(id, action),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pendingGuardianLinks'] });
      toast.success(variables.action === 'approve' ? 'Parent linked.' : 'Request declined.');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not do that.')),
  });

  // Nothing pending is the normal state — an empty card every day would be
  // noise on a page a coach opens constantly.
  if (!isLoading && links.length === 0) return null;

  return (
    <Card className="relative overflow-hidden">
      <div className={cn('absolute inset-x-0 top-0 h-1', accent.rail)} aria-hidden />
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserCheck className={cn('h-5 w-5', accent.text)} />
          Parent access requests
          {links.length > 0 && <Badge variant="secondary">{links.length}</Badge>}
        </CardTitle>
        <CardDescription>
          Parents asking to follow an athlete. Approving gives them read-only access to that
          athlete's meets and roster info — nothing else, and nothing they can change.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading && <Skeleton className="h-16 w-full" />}

        {links.map((link) => (
          <div
            key={link.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <p className="text-sm">
                <span className="font-medium">{link.guardian.name || link.guardian.email}</span>
                <span className="text-muted-foreground"> wants to follow </span>
                <span className="font-medium">{link.athlete.name}</span>
              </p>
              {link.guardian.name && link.guardian.email && (
                <p className="text-xs text-muted-foreground">{link.guardian.email}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: link.id, action: 'approve' })}
              >
                {resolve.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: link.id, action: 'reject' })}
              >
                <X className="mr-2 h-4 w-4" />
                Decline
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default PendingGuardianLinksCard;
