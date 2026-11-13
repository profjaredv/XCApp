import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Sparkles, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { groupService, type Group, type GroupMember } from '@/api/groupService';
import { getApiErrorMessage } from '@/lib/apiError';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { EVENT_GROUPS } from '@/lib/trackEventGroups';

// Track & Field's event groups: Sprints, Hurdles, Jumps, Throws and so on.
// An athlete is in every group they compete in, so the same name can show
// under several. A program can have a lot of these, so each is one line
// until you open it.

interface RosterRow {
  id: string;
  name: string;
  grade: number | null;
}

export const EventGroupsSection: React.FC<{
  seasonId: string;
  groups: Group[];
  membersByGroup: Record<string, GroupMember[]>;
  roster: RosterRow[];
  canEdit: boolean;
}> = ({ seasonId, groups, membersByGroup, roster, canEdit }) => {
  const queryClient = useQueryClient();
  const teamPath = useTeamPath();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const order = new Map(EVENT_GROUPS.map((g, i) => [g.key, i]));
  const eventGroups = groups
    .filter((g) => g.type === 'EVENT' && !g.archived)
    .sort((a, b) => (order.get(a.eventGroup ?? '') ?? 99) - (order.get(b.eventGroup ?? '') ?? 99) || a.name.localeCompare(b.name));

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['groups', seasonId] }),
      queryClient.invalidateQueries({ queryKey: ['groupMembers', seasonId] }),
    ]);

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      const note = await work();
      await refresh();
      if (note) setMessage(note);
    } catch (e) {
      setMessage(getApiErrorMessage(e, 'That did not save. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const setUp = () =>
    run(async () => {
      const { groupsCreated, membersAdded } = await groupService.setUpEventGroups(seasonId);
      if (!groupsCreated && !membersAdded) return 'Already up to date with the results.';
      return `Added ${membersAdded} athlete${membersAdded === 1 ? '' : 's'}${groupsCreated ? ` across ${groupsCreated} new group${groupsCreated === 1 ? '' : 's'}` : ''}.`;
    });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-lg">Event groups</CardTitle>
          <CardDescription>Who trains and competes in what. An athlete can be in several.</CardDescription>
        </div>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={setUp} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {eventGroups.length ? 'Update from results' : 'Set up from results'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {eventGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No event groups yet. "Set up from results" makes one for each event group your athletes have competed in this season and fills
            it for you.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {eventGroups.map((g) => {
              const members = [...(membersByGroup[g.id] ?? [])].sort((a, b) => a.name.localeCompare(b.name));
              const open = openId === g.id;
              const memberIds = new Set(members.map((m) => m.athleteId));
              const addable = roster.filter((a) => !memberIds.has(a.id)).sort((a, b) => a.name.localeCompare(b.name));
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : g.id)}
                    aria-expanded={open}
                    className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm hover:bg-muted/60"
                  >
                    <span className="flex-1 font-medium">{g.name}</span>
                    <span className="tabular-nums text-muted-foreground">{members.length}</span>
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
                  </button>
                  {open && (
                    <div className="space-y-3 px-3 pb-3">
                      {members.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nobody in this group yet.</p>
                      ) : (
                        <ul className="flex flex-wrap gap-1.5">
                          {members.map((m) => (
                            <li key={m.athleteId} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-sm">
                              <Link to={teamPath(`/track/athlete/${m.athleteId}`)} className="hover:underline">
                                {m.name}
                                {m.grade ? <span className="text-muted-foreground"> · {m.grade}</span> : null}
                              </Link>
                              {canEdit ? (
                                <button
                                  type="button"
                                  aria-label={`Remove ${m.name} from ${g.name}`}
                                  disabled={busy}
                                  onClick={() => run(async () => (await groupService.removeMember(g.id, m.athleteId), null))}
                                  className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <span className="w-2" />
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {canEdit && addable.length > 0 && (
                        <select
                          aria-label={`Add an athlete to ${g.name}`}
                          value=""
                          disabled={busy}
                          onChange={(e) => {
                            const athleteId = e.target.value;
                            if (athleteId) run(async () => (await groupService.addMember(g.id, athleteId), null));
                          }}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">Add an athlete…</option>
                          {addable.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
