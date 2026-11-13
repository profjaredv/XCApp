import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { TrackAthleteProgression } from '@/api/trackService';
import { formatMark, formatMeetDate, formatResult } from '@/lib/trackFormat';

// One athlete's track record: each event with its PR and every mark, then
// the relays they ran a leg of. Shared by the coach's athlete page and the
// athlete's own.
export const TrackRecord: React.FC<{ data: TrackAthleteProgression }> = ({ data }) => (
  <div className="space-y-6">
    {data.events.length === 0 && data.relays.length === 0 && <p className="text-sm text-muted-foreground">No track and field results yet.</p>}
    <div className="grid gap-4 md:grid-cols-2">
      {data.events.map(({ event, pr, marks, seasonBests }) => (
        <Card key={event.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{event.name}</CardTitle>
            <CardDescription>
              {pr != null ? `PR ${formatMark(pr, event.unit)}` : 'No mark yet'}
              {seasonBests.length > 1 && ` · ${seasonBests.map((s) => `${s.season}: ${formatMark(s.best.markValue, event.unit)}`).join(', ')}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {[...marks].reverse().map((m) => (
                <li key={m.id} className="flex items-baseline gap-2">
                  <span className="w-24 shrink-0 text-muted-foreground">{formatMeetDate(m.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{m.meetName}</span>
                  {m.isPr && <span className="shrink-0 rounded bg-primary/10 px-1.5 text-xs font-semibold text-primary">PR</span>}
                  <span className="shrink-0 font-semibold tabular-nums">{formatResult(m, event.unit)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
    {data.relays.length > 0 && (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Relays</CardTitle>
          <CardDescription>Every relay this athlete ran a leg of.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {data.relays.map((r) => (
              <li key={r.id} className="space-y-0.5 py-2">
                <div className="flex items-baseline gap-2">
                  <span className="w-24 shrink-0 text-muted-foreground">{formatMeetDate(r.date)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.event?.name ?? 'Relay'}
                    {r.relayTeam ? ` ${r.relayTeam}` : ''} · leg {r.leg} · {r.meetName}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatResult(r, 'SECONDS')}</span>
                </div>
                <p className="pl-[6.5rem] text-xs text-muted-foreground">
                  {r.legs.map((l, i) => (
                    <span key={l.athleteId} className={l.athleteId === data.athlete.id ? 'font-semibold text-foreground' : undefined}>
                      {i > 0 ? ', ' : ''}
                      {l.name}
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    )}
  </div>
);
