import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { formatPace } from '@/lib/formatUtils';
import enhancedAnalyticsService from '@/api/enhancedAnalyticsService';
import { pickPeerGroup, paceGap } from '@/lib/teamComparison';

// Where this athlete sits against the rest of the team.
//
// Every number on an athlete's profile was absolute — 7:42/mi, 6 races —
// with nothing to read it against, even though the season calculation has
// been computing the group averages all along. This puts the athlete's
// figure and their group's side by side, and says the gap out loud so
// nobody has to subtract two paces in their head.
//
// Renders nothing at all when there is no honest comparison to make: the
// season's metrics were never calculated, or the peer group is too small
// to have an average (see lib/teamComparison.ts).

interface TeamComparisonCardProps {
  teamId: string;
  season: number;
  gender?: 'M' | 'F' | null;
  grade?: number | null;
  /** Seconds per mile across the athlete's season. */
  avgPace: number;
  totalRaces: number;
}

const Row: React.FC<{
  label: string;
  athlete: string;
  peer: string;
  gap?: React.ReactNode;
}> = ({ label, athlete, peer, gap }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      {gap && <p className="text-xs">{gap}</p>}
    </div>
    <div className="flex items-baseline gap-4 tabular-nums">
      <span className="text-xl font-semibold">{athlete}</span>
      <span className="text-sm text-muted-foreground">{peer}</span>
    </div>
  </div>
);

export const TeamComparisonCard: React.FC<TeamComparisonCardProps> = ({
  teamId,
  season,
  gender,
  grade,
  avgPace,
  totalRaces,
}) => {
  const { data: team } = useQuery({
    queryKey: ['enhancedTeamMetrics', teamId, season],
    queryFn: () => enhancedAnalyticsService.getEnhancedTeamMetrics(teamId, String(season)),
    // 404s until someone runs the season calculation — a normal state on a
    // fresh season, not an error worth retrying or reporting.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const peer = pickPeerGroup(team, gender, grade);
  if (!peer) return null;

  const gap = paceGap(avgPace, peer.avgPace);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          Against the team
        </CardTitle>
        <CardDescription>
          {season} season, next to {peer.label} ({peer.count} athletes). Group averages include this
          athlete.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <Row
          label="Average pace"
          athlete={formatPace(avgPace)}
          peer={formatPace(peer.avgPace)}
          gap={
            gap && gap.seconds >= 1 ? (
              <span className={gap.faster ? 'text-primary' : 'text-muted-foreground'}>
                {formatGap(gap.seconds)} {gap.faster ? 'faster' : 'slower'} than {peer.label}
              </span>
            ) : gap ? (
              <span className="text-muted-foreground">Even with {peer.label}</span>
            ) : null
          }
        />
        {peer.avgRaces !== null && (
          <Row
            label="Races run"
            athlete={String(totalRaces)}
            peer={`${peer.avgRaces.toFixed(1)} avg`}
          />
        )}
      </CardContent>
    </Card>
  );
};

/** A pace gap the way it gets said out loud: "12 seconds", "1:05". */
function formatGap(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole} sec/mi`;
  const mins = Math.floor(whole / 60);
  return `${mins}:${String(whole % 60).padStart(2, '0')}/mi`;
}

export default TeamComparisonCard;
