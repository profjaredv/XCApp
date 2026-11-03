import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { useGroupScope } from '@/contexts/GroupScopeContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { meetOpsService } from '@/api/meetOpsService';
import { intervalSessionService } from '@/api/intervalSessionService';
import { todayIso } from '@/lib/formatUtils';
import { timerTarget, type TimerRace, type TimerSession } from '@/lib/timerTarget';
import { Sheet, SheetContent, SheetRow } from './Sheet';

// One Timer button for coaches (§3.5). It looks things up when tapped —
// not on every page load — because it's used a few times a week, and the
// answer ("is there a meet today, does that race have results yet")
// changes during the day.
export const TimerButton: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const scope = useGroupScope();
  const [busy, setBusy] = useState(false);
  const [races, setRaces] = useState<TimerRace[] | null>(null);
  const [sessions, setSessions] = useState<TimerSession[] | null>(null);

  if (!scope.enabled) return null;

  const open = async () => {
    if (!scope.seasonId || busy) return;
    setBusy(true);
    try {
      const today = todayIso();
      const meets = await meetOpsService.listMeets(scope.seasonId);
      const todays = meets.filter((m) => m.date.slice(0, 10) === today);
      const raceList = todays.flatMap((m) => m.races.map((r) => ({ id: r.id, name: todays.length > 1 ? `${m.name} · ${r.name}` : r.name })));
      const withResults: TimerRace[] = await Promise.all(
        raceList.map(async (r) => {
          const detail = await meetOpsService.getRaceResults(r.id).catch(() => null);
          return { ...r, hasResults: (detail?.results.length ?? 0) > 0 };
        })
      );
      const scopedIds = new Set(scope.scopedGroups.map((g) => g.id));
      const allSessions = await intervalSessionService.list(scope.seasonId, today, today);
      const scoped = allSessions
        .filter((s) => s.date.slice(0, 10) === today)
        .filter((s) => scope.scope === 'all' || (s.groupId != null && scopedIds.has(s.groupId)))
        .map((s) => ({ id: s.id, title: s.groupName ? `${s.groupName} · ${s.title}` : s.title }));

      const target = timerTarget(withResults, scoped);
      if (target.kind === 'race') navigate(teamPath(`/race/${target.raceId}/timer`));
      else if (target.kind === 'pick-race') setRaces(target.races);
      else if (target.kind === 'session') navigate(teamPath(`/interval-sessions/${target.sessionId}`));
      else if (target.kind === 'pick-session') setSessions(target.sessions);
      else navigate(teamPath('/interval-sessions'));
    } catch {
      toast.error("Couldn't check today's meets and sessions. Opening interval sessions.");
      navigate(teamPath('/interval-sessions'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Timer"
        title="Timer"
        className="flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium hover:bg-accent"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Timer className="h-5 w-5" />}
        <span className="hidden xl:inline">Timer</span>
      </button>
      <Sheet open={!!races} onOpenChange={(o) => !o && setRaces(null)}>
        <SheetContent title="Which race?">
          {races?.map((r) => (
            <SheetRow key={r.id} onClick={() => navigate(teamPath(`/race/${r.id}/timer`))}>
              {r.name}
            </SheetRow>
          ))}
        </SheetContent>
      </Sheet>
      <Sheet open={!!sessions} onOpenChange={(o) => !o && setSessions(null)}>
        <SheetContent title="Which session?">
          {sessions?.map((s) => (
            <SheetRow key={s.id} onClick={() => navigate(teamPath(`/interval-sessions/${s.id}`))}>
              {s.title}
            </SheetRow>
          ))}
        </SheetContent>
      </Sheet>
    </>
  );
};
