import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Download, Link2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useTodayIso } from '@/hooks/useTodayIso';
import { useMeets } from '@/hooks/useMeetOps';
import { splitsService } from '@/api/splitsService';
import { meetSeriesService, seriesForRaces } from '@/api/meetSeriesService';
import type { MeetSummary } from '@/api/meetOpsService';
import { isFullCoach } from '@/lib/teamRole';
import { formatDateShort } from '@/lib/formatUtils';
import { NextPageHeader } from '@/components/next/PageHeader';
import { ImportMeetsDialog, ImportCalendarDialog } from '@/components/meets/ImportMeetsDialogs';
import { NewMeetDialog } from '@/components/meets/NewMeetDialog';

// Meets (docs/leadpack-new-ui-trial.md §4.6). Meet management — entries,
// heats — lives on Athletic.net; LeadPack ingests meets, sets distances,
// predicts, captures splits and analyzes. This list is Upcoming and This
// season, past, with the meet series and how complete each meet's data is.

const MeetsPageNext: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const today = useTodayIso();
  const { currentUser } = useAuth();
  const fullCoach = isFullCoach(currentUser);
  const { seasons, activeYear } = useSeasonSelection();
  const seasonId = seasons.find((s) => s.year === activeYear)?.id ?? null;
  const { data: meets = [], isLoading } = useMeets(seasonId);
  const { data: series = [] } = useQuery({ queryKey: ['meetSeries'], queryFn: () => meetSeriesService.list() });
  const [importOpen, setImportOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const upcoming = meets.filter((m) => m.date.slice(0, 10) >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = meets.filter((m) => m.date.slice(0, 10) < today).sort((a, b) => b.date.localeCompare(a.date));
  const openMeet = (id: string) => navigate(teamPath(`/meet/${id}`));

  return (
    <div className="mx-auto max-w-4xl">
      <NextPageHeader
        title="Meets"
        subtitle={activeYear ? `${activeYear} season` : undefined}
        primary={
          fullCoach && (
            <Button onClick={() => setImportOpen(true)} className="min-h-12 lg:min-h-10">
              <Download className="mr-1 h-4 w-4" />
              Import meet
            </Button>
          )
        }
        overflow={
          fullCoach
            ? [
                { label: 'Import the Athletic.net calendar', onClick: () => setCalendarOpen(true), icon: CalendarDays },
                { label: 'New meet', onClick: () => setNewOpen(true), icon: Plus },
                { label: 'Meet series', to: teamPath('/settings#meet-groups'), icon: Link2 },
              ]
            : []
        }
      />

      {!seasonId ? (
        <p className="text-sm text-muted-foreground">No season set up yet.</p>
      ) : isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : meets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No meets this season yet.{fullCoach ? ' Import them from your Athletic.net calendar or from races already imported.' : ''}</p>
      ) : (
        <div className="space-y-6">
          <Section title="Upcoming" empty="Nothing else on the schedule this season.">
            {upcoming.map((m) => (
              <MeetRow key={m.id} meet={m} seriesName={seriesForRaces(series, m.races.map((r) => r.id))?.groupName ?? null} onOpen={() => openMeet(m.id)} showStatus={false} />
            ))}
          </Section>
          <Section title="This season, past" empty="No meets run yet this season.">
            {past.map((m) => (
              <MeetRow key={m.id} meet={m} seriesName={seriesForRaces(series, m.races.map((r) => r.id))?.groupName ?? null} onOpen={() => openMeet(m.id)} showStatus />
            ))}
          </Section>
        </div>
      )}

      <ImportMeetsDialog open={importOpen} onClose={() => setImportOpen(false)} seasonId={seasonId} onImported={(id) => id && openMeet(id)} />
      <ImportCalendarDialog open={calendarOpen} onClose={() => setCalendarOpen(false)} seasonId={seasonId} onImported={(id) => id && openMeet(id)} />
      <NewMeetDialog open={newOpen} onOpenChange={setNewOpen} seasonId={seasonId} onCreated={openMeet} />
    </div>
  );
};

const Section: React.FC<{ title: string; empty: string; children: React.ReactNode[] }> = ({ title, empty, children }) => (
  <section>
    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
    {children.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <div className="divide-y rounded-xl border">{children}</div>}
  </section>
);

const MeetRow: React.FC<{ meet: MeetSummary; seriesName: string | null; onOpen: () => void; showStatus: boolean }> = ({
  meet,
  seriesName,
  onOpen,
  showStatus,
}) => {
  // The splits view (GET /splits/race/:id) lists every result with its
  // splits — one read per race answers both "results in?" and "splits n/m".
  const views = useQueries({
    queries: showStatus
      ? meet.races.map((r) => ({ queryKey: ['splits', 'race', r.id], queryFn: () => splitsService.getRaceSplits(r.id) }))
      : [],
  });
  const loaded = views.length > 0 && views.every((v) => v.data);
  const finishers = views.reduce((n, v) => n + (v.data?.results.filter((r) => r.finishSec != null).length ?? 0), 0);
  const withSplits = views.reduce((n, v) => n + (v.data?.results.filter((r) => r.splits.length > 0).length ?? 0), 0);

  return (
    <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/50">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{meet.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {formatDateShort(meet.date)}
          {meet.location ? ` · ${meet.location}` : ''}
          {seriesName ? ` · ${seriesName}` : ''}
        </span>
        {showStatus && loaded && (
          <span className="mt-1 flex flex-wrap gap-1">
            {finishers > 0 ? (
              <>
                <Badge variant="secondary" className="font-normal">Results in</Badge>
                <Badge variant={withSplits >= finishers ? 'secondary' : 'outline'} className="font-normal">
                  Splits {withSplits}/{finishers}
                </Badge>
              </>
            ) : (
              <Badge variant="outline" className="font-normal">No results yet</Badge>
            )}
          </span>
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
};

export default MeetsPageNext;
