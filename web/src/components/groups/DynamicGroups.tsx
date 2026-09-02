import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { ChevronDown, Sparkles } from 'lucide-react';
import api from '@/api/api';
import { formatPace } from '@/lib/formatUtils';
import { gradeLabelShort } from '@/lib/seasonUtils';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useExpandedSections } from '@/hooks/useExpandedSections';

// Groups the data draws: the fastest twenty, who gained the most since
// last meet, who is sitting just outside the scoring seven.
//
// These are not groups anybody joins. Nothing here writes a membership —
// GroupMembership is effective-dated history that analytics reads to
// answer "which group was this athlete in when they ran that race", and a
// list that reshuffles itself every Saturday would bury that in churn. The
// backend recomputes them from race results on every request
// (lib/dynamicGroups.js), which is also why they are always current and
// never need a "recalculate" button.

interface DynamicMember {
  athleteId: string;
  name: string;
  grade: number | null;
  gender: 'M' | 'F' | null;
  raceCount: number;
  rank: number;
  value: number;
  unit: 'pace' | 'gain' | 'gap';
  /** Best pace, carried alongside the gap on the "next seven" list. */
  pace?: number;
}

interface DynamicList {
  gender: 'M' | 'F' | null;
  label: string;
  members: DynamicMember[];
}

interface DynamicGroup {
  key: string;
  label: string;
  description: string;
  metric: string;
  limit: number;
  lists: DynamicList[];
}

/** Seconds, said the way a coach says them: "12s", "1:05". */
function formatSeconds(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function formatValue(member: DynamicMember): string {
  if (member.unit === 'pace') return formatPace(member.value);
  return formatSeconds(member.value);
}

const GroupList: React.FC<{
  group: DynamicGroup;
  open: boolean;
  onToggle: () => void;
}> = ({ group, open, onToggle }) => {
  const teamPath = useTeamPath();
  const [listIndex, setListIndex] = useState(0);
  const list = group.lists[listIndex] ?? group.lists[0];
  // Who is at the top, on the closed card. Four collapsed headings that
  // say nothing would just be four more things to open.
  const leader = list.members[0];

  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`dynamic-group-${group.key}`}
        className="flex w-full items-start gap-3 p-6 text-left transition-colors hover:bg-accent/50"
      >
        <span className="min-w-0 flex-1">
          <CardTitle className="text-lg">{group.label}</CardTitle>
          <CardDescription className="mt-1">{group.description}</CardDescription>
          {!open && leader && (
            <span className="mt-2 block text-xs font-medium text-foreground/80">
              {leader.name} · {formatValue(leader)}
              {list.members.length > 1 ? ` · ${list.members.length} listed` : ''}
            </span>
          )}
        </span>
        <ChevronDown
          className={`mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
      <CardContent id={`dynamic-group-${group.key}`}>
        {group.lists.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {group.lists.map((l, index) => (
              <Button
                key={l.label}
                size="sm"
                variant={index === listIndex ? 'secondary' : 'outline'}
                onClick={() => setListIndex(index)}
              >
                {l.label}
              </Button>
            ))}
          </div>
        )}
        <div className="divide-y">
          {list.members.map((member) => (
            <div key={member.athleteId} className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 shrink-0 text-sm tabular-nums text-muted-foreground">
                  {member.rank}
                </span>
                <Link
                  to={teamPath(`/team/athlete/${member.athleteId}`)}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {member.name}
                </Link>
                {member.grade != null && (
                  <Badge variant="outline" className="font-normal">
                    {gradeLabelShort(member.grade)}
                  </Badge>
                )}
              </div>
              <div className="shrink-0 text-right">
                <span className="text-sm font-semibold tabular-nums">{formatValue(member)}</span>
                {member.pace != null && (
                  <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                    {formatPace(member.pace)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{group.metric}</p>
      </CardContent>
      )}
    </Card>
  );
};

export const DynamicGroups: React.FC<{ season: number | null }> = ({ season }) => {
  // Closed until a coach opens one, and which ones they opened is
  // remembered per device — four twenty-name lists is most of a phone
  // screen before the coach has reached the groups they actually manage.
  const { isOpen, toggle } = useExpandedSections('xc_dynamic_groups_open');
  const { data, isLoading } = useQuery<{ groups: DynamicGroup[] }>({
    queryKey: ['dynamicGroups', season],
    queryFn: async () => {
      const response = await api.get<{ groups: DynamicGroup[] }>('/groups/dynamic', {
        params: { season },
      });
      return response.data;
    },
    enabled: season != null,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // Every one of these is computed from race results, so before the first
  // meet there is nothing to draw. Saying nothing beats four empty cards
  // explaining that they are empty.
  const groups = (data?.groups ?? []).filter((g) => g.lists.length > 0);
  if (groups.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          Drawn from your results
        </h2>
        <p className="text-sm text-muted-foreground">
          Recomputed from every race this season — nobody is assigned to these, and they change on
          their own as results come in.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <GroupList
            key={group.key}
            group={group}
            open={isOpen(group.key)}
            onToggle={() => toggle(group.key)}
          />
        ))}
      </div>
    </div>
  );
};

export default DynamicGroups;
