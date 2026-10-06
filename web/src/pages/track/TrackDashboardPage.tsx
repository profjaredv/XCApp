import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { trackService } from '@/api/trackService';

// LeadPack Track & Field handoff (docs/leadpack-track-field-handoff.md) —
// Section 6, step 6/work order step 4: the first real screen Jared can
// open at /tf/dashboard to confirm the super-admin demo gate works end to
// end. Every number here is a live count from GET /api/track/status — no
// placeholder/fake data. As each phase in the handoff's Section 6 lands
// (event catalog, scraper + import, points-contribution, PR progression,
// depth-by-event-group, cross-sport continuity), this page is where that
// work becomes visible, phase by phase, without a separate deployment —
// see routes/track.js's own header for the gate this all sits behind, and
// NOTES.md for why it's temporary.
const TrackDashboardPage: React.FC = () => {
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['trackStatus'],
    queryFn: () => trackService.getStatus(),
  });
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['trackEvents'],
    queryFn: () => trackService.getEvents(),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <PageHeader
        section="neutral"
        icon={Activity}
        title="Track & Field"
        description="In-progress build — visible only to platform admins while this ships. Not yet open to coaches."
      />

      <Card>
        <CardHeader>
          <CardTitle>Event catalog</CardTitle>
          <CardDescription>
            Seeded from scripts/seedTrackEvents.js — a provisional WIAA-typical list, not yet confirmed. See that
            script's own header before trusting it for a real meet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <Skeleton className="h-6 w-40" />
          ) : events && events.length > 0 ? (
            <p className="text-sm text-muted-foreground">{events.length} events in the catalog.</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No events seeded yet. Run <code>node scripts/seedTrackEvents.js</code> from backend/.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your team's track data</CardTitle>
          <CardDescription>Live counts from your own team, not a demo account.</CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <Skeleton className="h-6 w-64" />
          ) : !status?.hasTeam ? (
            <p className="text-sm text-muted-foreground">No team on this account yet.</p>
          ) : status.trackSeasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Track season exists yet for this team. Nothing has been imported.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Track seasons</dt>
                <dd className="text-2xl font-semibold">{status.trackSeasons.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Track meets imported</dt>
                <dd className="text-2xl font-semibold">{status.trackMeetCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Track results imported</dt>
                <dd className="text-2xl font-semibold">{status.trackResultCount}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TrackDashboardPage;
