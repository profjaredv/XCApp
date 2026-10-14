import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, CalendarDays, Download, Camera } from 'lucide-react';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureEnabled } from '@/hooks/useTeamFeatures';
import { formatDateShort } from '@/lib/formatUtils';
import { useMeets } from '@/hooks/useMeetOps';
import { ImportMeetsDialog, ImportCalendarDialog } from '@/components/meets/ImportMeetsDialogs';
import { NewMeetDialog } from '@/components/meets/NewMeetDialog';

// Meets, simplified per the Schedule rework: this list is now just
// name/date/location/home-or-away plus the two import flows that create
// Meet rows. Entries, meet-day logistics, and the printable roster all
// moved out — results sync (routes/meets.js) supplies what's needed once a
// race is scraped, and coaches no longer hand-manage entries here. Race
// plans (RaceReflection) live on the meet detail page a click opens
// (MeetDetailPage.tsx).

const MeetsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { seasons, activeYear } = useSeasonSelection();
  const navigate = useNavigate();
  const teamPath = useTeamPath();

  const selectedSeason = seasons.find((s) => s.year === activeYear) ?? null;
  const seasonId = selectedSeason?.id ?? null;

  const { data: meets = [], isLoading: meetsLoading } = useMeets(seasonId);
  const photosEnabled = useFeatureEnabled('photos');

  const [newMeetOpen, setNewMeetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [calendarImportOpen, setCalendarImportOpen] = useState(false);

  // B4 (LeadPack Master Build Handoff): athletes get "Meets, read-only" —
  // GET /api/meet-ops returns myEntryStatus per race for a caller with a
  // linkedAthlete, so this reuses the exact same list query the coach view
  // below uses; it just renders it differently. Volunteer coaches get the
  // full coach view, same as head/paid coaches — this branch is
  // athlete-only. Placed after every hook above so hook call order never
  // depends on role.
  const teamRole = currentUser?.teamRole;
  const isCoachViewer = teamRole === 'HEAD_COACH' || teamRole === 'COACH' || teamRole === 'VOLUNTEER_COACH';
  if (!isCoachViewer) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl md:text-4xl font-bold">Meets</h1>
          {photosEnabled && (
            <Button variant="outline" onClick={() => navigate(teamPath('/photos'))}>
              <Camera className="h-4 w-4 mr-2" />
              Photos
            </Button>
          )}
        </div>
        {meetsLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : meets.length === 0 ? (
          <p className="text-muted-foreground">No meets scheduled yet.</p>
        ) : (
          <div className="space-y-3">
            {meets.map((m) => (
              <Card key={m.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{m.name}</span>
                    <span className="text-sm font-normal text-muted-foreground">{formatDateShort(m.date)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    {m.location && <p className="text-sm text-muted-foreground">{m.location}</p>}
                    {m.isHome != null && (
                      <Badge variant="outline" className="font-normal">{m.isHome ? 'Home' : 'Away'}</Badge>
                    )}
                  </div>
                  {/* Race names only — no entry status (F1): entries live on
                      Athletic.net, so ours was often wrong. */}
                  {m.races.map((r) => (
                    <div key={r.id} className="text-sm">
                      <span>{r.name}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!activeYear || !seasonId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl md:text-4xl font-bold">Meets</h1>
        <p className="text-muted-foreground">No season set up yet — set one up from the Groups screen first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl md:text-4xl font-bold">Meets</h1>
        <div className="flex items-center gap-2">
          {photosEnabled && (
            <Button variant="outline" onClick={() => navigate(teamPath('/photos'))}>
              <Camera className="h-4 w-4 mr-2" />
              Photos
            </Button>
          )}
          <Button variant="outline" onClick={() => setCalendarImportOpen(true)}>
            <CalendarDays className="h-4 w-4 mr-2" />
            Import from Athletic.net
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Download className="h-4 w-4 mr-2" />
            Import from races
          </Button>
          <Button variant="outline" onClick={() => setNewMeetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Meet
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Meets this season</CardTitle>
        </CardHeader>
        <CardContent className="py-2 space-y-1">
          {meetsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!meetsLoading && meets.length === 0 && <p className="text-sm text-muted-foreground">No meets yet.</p>}
          {meets.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate(teamPath(`/meet/${m.id}`))}
              className="w-full text-left rounded-md px-2 py-2 text-sm hover:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{m.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {m.isHome != null && (
                    <Badge variant="outline" className="text-[10px] font-normal">{m.isHome ? 'Home' : 'Away'}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{m.date.slice(0, 10)}</span>
                </div>
              </div>
              {m.location && <div className="text-xs text-muted-foreground">{m.location}</div>}
            </button>
          ))}
        </CardContent>
      </Card>

      <NewMeetDialog
        open={newMeetOpen}
        onOpenChange={setNewMeetOpen}
        seasonId={seasonId}
        onCreated={(id) => navigate(teamPath(`/meet/${id}`))}
      />

      <ImportMeetsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        seasonId={seasonId}
        onImported={(firstMeetId) => {
          if (firstMeetId) navigate(teamPath(`/meet/${firstMeetId}`));
        }}
      />

      <ImportCalendarDialog
        open={calendarImportOpen}
        onClose={() => setCalendarImportOpen(false)}
        seasonId={seasonId}
        onImported={(firstMeetId) => {
          if (firstMeetId) navigate(teamPath(`/meet/${firstMeetId}`));
        }}
      />
    </div>
  );
};

export default MeetsPage;
