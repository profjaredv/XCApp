import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { trackService } from '@/api/trackService';
import { TrackRecord } from '@/components/track/TrackRecord';
import { PracticePlanPreview } from '@/components/practicePlans/PracticePlanPreview';
import { practicePlanService } from '@/api/practicePlanService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMeetDate } from '@/lib/trackFormat';

// An athlete's own track and field record: their marks, their PRs, the
// relays they ran. Nothing about anyone else on the team.
// What is coming: each meet still to run, the coach's plan for the day, and
// what this athlete is entered in.
const Upcoming: React.FC = () => {
  const { data } = useQuery({ queryKey: ['track', 'mine', 'upcoming'], queryFn: () => trackService.getMyUpcoming() });
  if (!data?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Coming up</CardTitle>
        <CardDescription>Your meets, the plan for the day, and what you are entered in.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {data.map((m) => (
            <li key={m.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
              <p className="font-medium">
                {m.name} <span className="font-normal text-muted-foreground">· {formatMeetDate(m.date)}{m.location ? ` · ${m.location}` : ''}</span>
              </p>
              {m.notes && <p className="whitespace-pre-wrap text-muted-foreground">{m.notes}</p>}
              {m.entries.length === 0 ? (
                <p className="text-muted-foreground">You are not entered in anything yet.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {m.entries.map((e, i) => (
                    <li key={i} className="rounded-full bg-muted px-3 py-1" title={e.squad.length ? e.squad.join(' → ') : undefined}>
                      {e.event}
                      {e.relayTeam ? ` ${e.relayTeam}` : ''}
                      {e.leg ? ` · leg ${e.leg}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

// Today's track practice: the team plan plus the parts written for the
// groups this athlete is in. Only shown once a coach has published one.
const TodaysPractice: React.FC = () => {
  const today = new Date().toLocaleDateString('en-CA');
  const { data } = useQuery({ queryKey: ['track', 'mine', 'practice', today], queryFn: () => practicePlanService.myPlan(today, 'TRACK') });
  if (!data?.plan) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Today's practice</CardTitle>
      </CardHeader>
      <CardContent>
        <PracticePlanPreview plan={data.plan} sport="TRACK" />
      </CardContent>
    </Card>
  );
};

const MyTrackPage: React.FC = () => {
  const { data, isLoading, isError } = useQuery({ queryKey: ['track', 'mine'], queryFn: () => trackService.getMine() });
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <PageHeader section="neutral" icon={Activity} title="My Track & Field" description="Your meets, your marks, your PRs and your relays." />
      <TodaysPractice />
      <Upcoming />
      {isLoading ? <Skeleton className="h-40 w-full" /> : isError || !data ? <p className="text-sm text-muted-foreground">Could not load your results.</p> : <TrackRecord data={data} />}
    </div>
  );
};

export default MyTrackPage;
