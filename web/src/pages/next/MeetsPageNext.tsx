import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Download, Link2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { DateTile, Hero, SectionHeading, Stat } from '@/components/next/Visual';
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
          {upcoming[0] ? (
            <Hero>
              <p className="text-xs font-medium uppercase tracking-wider text-primary-foreground/70">Next meet</p>
              <button type="button" onClick={() => openMeet(upcoming[0].id)} className="mt-2 flex w-full items-center gap-3 text-left">
                <DateTile date={upcoming[0].date} className="bg-white/15 text-primary-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xl font-bold">{upcoming[0].name}</span>
                  <span className="block truncate text-sm text-primary-foreground/80">
                    {[upcoming[0].location, seriesForRaces(series, upcoming[0].races.map((r) => r.id))?.groupName].filter(Boolean).join(' · ') ||
                      (upcoming[0].isHome ? 'Home' : 'Away')}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-4xl font-bold tabular-nums leading-none">{daysUntil(upcoming[0].date, today)}</span>
                  <span className="block text-[11px] text-primary-foreground/70">{daysUntil(upcoming[0].date, today) === 1 ? 'day' : 'days'}</span>
                </span>
              </button>
            </Hero>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Meets run" value={past.length} sub="this season" />
            <Stat label="Coming up" value={upcoming.length} />
            <Stat label="Races" value={meets.reduce((n, m) => n + m.races.length, 0)} />
          </div>
          {upcoming.length > 1 && (
            <Section title="Later this season">
              {upcoming.slice(1).map((m) => (
                <MeetRow key={m.id} meet={m} seriesName={seriesForRaces(series, m.races.map((r) => r.id))?.groupName ?? null} onOpen={() => openMeet(m.id)} showStatus={false} />
              ))}
            </Section>
          )}
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Nothing else on the schedule this season.</p>}
          <Section title="This season, past">
            {past.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No meets run yet this season.</p>
            ) : (
              past.map((m) => (
                <MeetRow key={m.id} meet={m} seriesName={seriesForRaces(series, m.races.map((r) => r.id))?.groupName ?? null} onOpen={() => openMeet(m.id)} showStatus />
              ))
            )}
          </Section>
        </div>
      )}

      <ImportMeetsDialog open={importOpen} onClose={() => setImportOpen(false)} seasonId={seasonId} onImported={(id) => id && openMeet(id)} />
      <ImportCalendarDialog open={calendarOpen} onClose={() => setCalendarOpen(false)} seasonId={seasonId} onImported={(id) => id && openMeet(id)} />
      <NewMeetDialog open={newOpen} onOpenChange={setNewOpen} seasonId={seasonId} onCreated={openMeet} />
    </div>
  );
};

function daysUntil(date: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(date.slice(0, 10)) - Date.parse(today)) / 86400000));
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <SectionHeading title={title} />
    <div className="rounded-3xl bg-card p-1.5 shadow-sm ring-1 ring-border/60">{children}</div>
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
    <button type="button" onClick={onOpen} className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left hover:bg-accent/60">
      <DateTile date={meet.date} className={showStatus ? 'bg-muted text-muted-foreground' : undefined} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{meet.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {[meet.location, seriesName].filter(Boolean).join(' · ') || formatDateShort(meet.date)}
        </span>
        {showStatus && loaded && (
          finishers > 0 ? (
            <span className="mt-1.5 flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Results in</span>
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((withSplits / finishers) * 100)}%` }} />
              </span>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                Splits {withSplits}/{finishers}
              </span>
            </span>
          ) : (
            <span className="mt-1.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">No results yet</span>
          )
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
};

export default MeetsPageNext;
