import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Flag, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { trackService, type TrackGender, type TrackMeetDetail, type TrackMeetRow } from '@/api/trackService';
import { RelayBuilder } from '@/components/track/RelayBuilder';
import { formatMeetDate, formatResult } from '@/lib/trackFormat';
import { getApiErrorMessage } from '@/lib/apiError';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamPath } from '@/hooks/useTeamRoute';

// One track meet. Before it: enter athletes by event, build relay squads,
// write the plan for the day. After it: the results by event, with PRs.

const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm';
const GENDER_LABEL: Record<string, string> = { M: 'Boys', F: 'Girls' };

const Entries: React.FC<{ detail: TrackMeetDetail; onSaved: () => void }> = ({ detail, onSaved }) => {
  const { data: events = [] } = useQuery({ queryKey: ['track', 'events'], queryFn: () => trackService.getEvents() });
  const { data: roster = [] } = useQuery({ queryKey: ['track', 'roster', detail.meet.season], queryFn: () => trackService.getRoster(detail.meet.season) });
  const individual = events.filter((e) => !e.isRelay);
  const [eventId, setEventId] = useState('');
  const [gender, setGender] = useState<TrackGender>('M');
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = detail.events.find((e) => e.event.id === eventId)?.rows ?? [];
  const existing = new Map(rows.filter((r) => r.athleteId).map((r) => [r.athleteId as string, r]));
  const pool = roster.filter((a) => a.gender === gender);
  const selected = picked ?? new Set(pool.filter((a) => existing.has(a.id)).map((a) => a.id));
  const reset = () => setPicked(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      // The list sent is the whole event: keep everyone outside this
      // gender's list exactly as they are.
      const poolIds = new Set(pool.map((a) => a.id));
      const others = [...existing.keys()].filter((id) => !poolIds.has(id));
      await trackService.setEntries(detail.meet.id, eventId, [...others, ...selected]);
      reset();
      onSaved();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not save those entries.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Enter athletes</CardTitle>
        <CardDescription>Pick an event, tick who is in it. Results you import later fill in the marks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <select aria-label="Event to enter" value={eventId} onChange={(e) => (setEventId(e.target.value), reset())} className={selectClass}>
            <option value="">Choose an event…</option>
            {individual.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <select aria-label="Boys or girls" value={gender} onChange={(e) => (setGender(e.target.value as TrackGender), reset())} className={selectClass}>
            <option value="M">Boys</option>
            <option value="F">Girls</option>
          </select>
        </div>
        {eventId && (
          <>
            {pool.length === 0 ? (
              <p className="text-muted-foreground">Nobody on this season's roster for that group yet.</p>
            ) : (
              <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2 md:grid-cols-3">
                {pool.map((a) => {
                  const row = existing.get(a.id);
                  const locked = Boolean(row && row.status !== 'ENTERED');
                  return (
                    <li key={a.id}>
                      <label className="flex min-h-9 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={locked || selected.has(a.id)}
                          disabled={locked}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(a.id);
                            else next.delete(a.id);
                            setPicked(next);
                          }}
                        />
                        <span className="truncate">
                          {a.name}
                          {a.grade ? <span className="text-muted-foreground"> · {a.grade}</span> : null}
                          {locked ? <span className="text-muted-foreground"> · has a result</span> : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button type="button" size="sm" onClick={save} disabled={busy || picked == null}>
              Save entries
            </Button>
            {error && <p className="text-destructive">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
};

const TrackMeetPage: React.FC = () => {
  const { meetId = '' } = useParams();
  const teamPath = useTeamPath();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const canEdit = currentUser?.teamRole === 'HEAD_COACH' || currentUser?.teamRole === 'COACH';
  const { data, isLoading, isError } = useQuery({ queryKey: ['track', 'meet', meetId], queryFn: () => trackService.getMeet(meetId), enabled: Boolean(meetId) });
  const { data: events = [] } = useQuery({ queryKey: ['track', 'events'], queryFn: () => trackService.getEvents() });
  const { data: roster = [] } = useQuery({
    queryKey: ['track', 'roster', data?.meet.season],
    queryFn: () => trackService.getRoster(data!.meet.season),
    enabled: Boolean(data),
  });
  const [notes, setNotes] = useState<string | null>(null);
  const [relayEdit, setRelayEdit] = useState<TrackMeetRow | 'new' | null>(null);
  const [show, setShow] = useState<'ALL' | TrackGender>('ALL');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['track'] });
  const act = async (work: () => Promise<void>, fallback: string) => {
    setError(null);
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(getApiErrorMessage(e, fallback));
    }
  };

  if (isLoading) return <Skeleton className="m-8 h-40" />;
  if (isError || !data) return <p className="p-8 text-sm text-muted-foreground">Could not load this meet.</p>;

  const { meet } = data;
  const visible = (r: TrackMeetRow) => show === 'ALL' || r.gender === show;
  const individual = data.events.filter((e) => !e.event.isRelay).map((e) => ({ ...e, rows: e.rows.filter(visible) })).filter((e) => e.rows.length);
  const relays = data.events.filter((e) => e.event.isRelay).flatMap((e) => e.rows.filter(visible).map((r) => ({ event: e.event, row: r })));
  const relayEvents = events.filter((e) => e.isRelay);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <Link to={teamPath('/track/meets')} className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ChevronLeft className="h-4 w-4" /> Meets
      </Link>
      <PageHeader
        section="neutral"
        icon={Flag}
        title={meet.name}
        description={`${formatMeetDate(meet.date)}${meet.location ? ` · ${meet.location}` : ''}${data.hasResults ? '' : ' · not run yet'}`}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Plan for the day</CardTitle>
          <CardDescription>Bus time, uniform, what to bring. Athletes see this on their own Track & Field page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea aria-label="Meet notes" value={notes ?? meet.notes ?? ''} onChange={(e) => setNotes(e.target.value)} readOnly={!canEdit} className="min-h-20" />
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={notes == null} onClick={() => act(async () => (await trackService.updateMeet(meet.id, { notes: notes ?? '' }), setNotes(null)), 'Could not save the notes.')}>
                Save notes
              </Button>
              {!data.hasResults && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(`Remove ${meet.name} from the schedule? Its entries and relay squads go with it.`)) {
                      act(async () => (await trackService.deleteMeet(meet.id), navigate(teamPath('/track/meets'))), 'Could not remove that meet.');
                    }
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Remove meet
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && <Entries detail={data} onSaved={refresh} />}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        {(['ALL', 'M', 'F'] as const).map((g) => (
          <Button key={g} type="button" size="sm" variant={show === g ? 'secondary' : 'ghost'} onClick={() => setShow(g)}>
            {g === 'ALL' ? 'Everyone' : GENDER_LABEL[g]}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
          <div>
            <CardTitle className="text-base">Relays</CardTitle>
            <CardDescription>Squads in leg order. Add the time once it has been run.</CardDescription>
          </div>
          {canEdit && relayEdit == null && (
            <Button type="button" size="sm" variant="outline" onClick={() => setRelayEdit('new')}>
              <Plus className="mr-1 h-4 w-4" /> Add relay
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {relayEdit != null && (
            <RelayBuilder
              key={relayEdit === 'new' ? 'new' : relayEdit.id}
              meetId={meet.id}
              season={meet.season}
              relayEvents={relayEvents}
              roster={roster}
              editing={relayEdit === 'new' ? null : relayEdit}
              onDone={() => (setRelayEdit(null), refresh())}
            />
          )}
          {relays.length === 0 && relayEdit == null && <p className="text-muted-foreground">No relays for this meet yet.</p>}
          <ul className="divide-y">
            {relays.map(({ event, row }) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                <span className="font-medium">
                  {GENDER_LABEL[row.gender ?? ''] ?? ''} {event.name} {row.relayTeam ?? ''}
                </span>
                <span className="min-w-0 flex-1 text-muted-foreground">{row.legs.length ? row.legs.map((l) => l.name).join(' → ') : 'Legs not set'}</span>
                {row.place ? <span className="text-muted-foreground">#{row.place}</span> : null}
                <span className="font-semibold tabular-nums">{formatResult(row, event.unit)}</span>
                {canEdit && (
                  <span className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" aria-label={`Edit ${event.name} ${row.relayTeam ?? ''}`} onClick={() => setRelayEdit(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${event.name} ${row.relayTeam ?? ''}`}
                      onClick={() => window.confirm('Remove this relay?') && act(() => trackService.deleteRelay(row.id), 'Could not remove that relay.')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {individual.length === 0 ? (
        <p className="text-sm text-muted-foreground">No entries or results in individual events yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {individual.map(({ event, rows }) => (
            <Card key={event.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{event.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {rows.map((r) => (
                    <li key={r.id} className="flex items-baseline gap-2">
                      <span className="w-6 shrink-0 text-right text-muted-foreground">{r.place ?? ''}</span>
                      <Link to={teamPath(`/track/athlete/${r.athleteId}`)} className="min-w-0 flex-1 truncate hover:underline">
                        {r.athleteName}
                      </Link>
                      {r.isPr && <span className="shrink-0 rounded bg-primary/10 px-1.5 text-xs font-semibold text-primary">PR</span>}
                      <span className={r.status === 'ENTERED' ? 'shrink-0 text-muted-foreground' : 'shrink-0 font-semibold tabular-nums'}>{formatResult(r, event.unit)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrackMeetPage;
