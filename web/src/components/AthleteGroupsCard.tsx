import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Dumbbell, Star } from 'lucide-react';
import { useAthleteMemberships } from '@/hooks/useGroups';
import type { AthleteGroupMembership } from '@/api/groupService';
import { formatDateShort } from '@/lib/formatUtils';

// "Which groups is this athlete actually in right now?" — training group,
// captain's group, any custom group, and whether they're currently in cross
// training. Pure cross-reference of tables that already exist; it introduces
// no new concept and writes nothing.
//
// Cross training is called out rather than listed as just another group
// because it's the one that's temporary and time-boxed: the coach needs the
// return date and the reason, not merely the fact of it.

const TYPE_LABEL: Record<string, string> = {
  TRAINING: 'Training group',
  CAPTAIN: "Captain's group",
  CUSTOM: 'Group',
  X_TRAINING: 'Cross training',
};

// Training first, then captain, then custom — the order a coach thinks in.
const TYPE_ORDER = ['TRAINING', 'CAPTAIN', 'CUSTOM'];

const GroupRow: React.FC<{ group: AthleteGroupMembership }> = ({ group }) => (
  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border py-2 last:border-b-0">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">{TYPE_LABEL[group.type] ?? group.type}</span>
    <span className="font-medium">{group.name}</span>
    {group.archived && <Badge variant="outline">archived</Badge>}
    {group.leaders.length > 0 && (
      <span className="text-xs text-muted-foreground">
        led by {group.leaders.map((l) => l.name || l.email).join(', ')}
      </span>
    )}
  </div>
);

export const AthleteGroupsCard: React.FC<{ athleteId: string }> = ({ athleteId }) => {
  const { data, isLoading } = useAthleteMemberships(athleteId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-4 w-4 text-muted-foreground" />
            Groups
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  const groups = data?.groups ?? [];
  const xTraining = groups.filter((g) => g.type === 'X_TRAINING');
  const regular = groups
    .filter((g) => g.type !== 'X_TRAINING')
    .sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type);
      const bi = TYPE_ORDER.indexOf(b.type);
      return (ai === -1 ? TYPE_ORDER.length : ai) - (bi === -1 ? TYPE_ORDER.length : bi) || a.name.localeCompare(b.name);
    });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-4 w-4 text-muted-foreground" />
          Groups
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {xTraining.map((g) => (
          <div key={g.membershipId} className="rounded-md border border-orange-500/40 bg-orange-500/10 p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Dumbbell className="h-4 w-4" />
              In cross training
              {g.until && <span className="font-normal text-muted-foreground">· back {formatDateShort(g.until)}</span>}
            </p>
            {g.reason && <p className="mt-1 text-xs italic text-muted-foreground">"{g.reason}"</p>}
          </div>
        ))}

        {regular.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not in any group right now. Assign one from the Groups page.
          </p>
        ) : (
          <div>
            {regular.map((g) => (
              <GroupRow key={g.membershipId} group={g} />
            ))}
          </div>
        )}

        {/* A captain leads a group but that's a separate fact from being IN
            one, so it's worth showing explicitly rather than leaving the
            coach to infer it from the group's name. */}
        {regular.some((g) => g.type === 'CAPTAIN') && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Star className="h-3 w-3" />
            Captain groups run alongside a training group — being in one doesn't replace it.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default AthleteGroupsCard;
