import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Bus, CalendarDays, MessageCircleHeart, Trophy, Users, Flag } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { athleteService } from '@/api/athleteService';
import { TrainingPacesCard } from '@/components/TrainingPacesCard';
import { AthleteGroupsCard } from '@/components/AthleteGroupsCard';
import { RacePredictionCard } from '@/components/predictions/RacePredictionCard';
import { TrainingLogCard } from '@/components/training/TrainingLogCard';
import { WhoCanSeeMyStuff } from '@/components/privacy/WhoCanSeeMyStuff';
import { AthleteExportButton } from '@/components/AthleteExportButton';
import { Download, Target } from 'lucide-react';
import { formatDateShort } from '@/lib/formatUtils';
import { useTodayIso } from '@/hooks/useTodayIso';
import { useAthleteSplits, useAthleteSplitsAggregate } from '@/hooks/useSplits';
import { SPLIT_PATTERN_LABEL, SPLIT_PATTERN_BADGE_CLASS, formatSplitMMSS } from '@/lib/splitPatternDisplay';
import { SplitsAggregateSummary } from '@/components/splits/SplitsAggregateSummary';
import { PracticePlanPreview } from '@/components/practicePlans/PracticePlanPreview';
import { useMyPracticePlan } from '@/hooks/usePracticePlans';
import { useMyMeetCard } from '@/hooks/useMeetOps';
import { RaceReflectionDialogBody } from '@/components/reflections/RaceReflectionDialogBody';
import { useFeatureEnabled } from '@/hooks/useTeamFeatures';


// Athletes usually don't know what pace an "easy day" or a "tempo run"
// should actually be — this screen answers that from their own results,
// lets them log runs the coach never sees a form for, and links out to the
// same team/meet views a coach has for whenever they want the bigger picture.
const MyProgressPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const linkedAthlete = currentUser?.linkedAthlete;

  const { data: recentRaces = [] } = useQuery({
    queryKey: ['myRecentRaces', linkedAthlete?.id],
    queryFn: () => athleteService.getRecentRaces(linkedAthlete!.id, 10),
    enabled: !!linkedAthlete,
  });

  // C9 (LeadPack Master Build Handoff): athlete-facing splits — the same
  // segment/pace/pattern derived server-side for the coach's entry grid
  // (routes/splits.js's GET /athlete/:athleteId), never recomputed here.
  const { data: athleteSplits = [] } = useAthleteSplits(linkedAthlete?.id ?? null);
  const racesWithSplits = athleteSplits.filter((r) => r.segments.length > 0);
  // C10: "how do you typically pace yourself" — averaged per distance
  // bucket, shared with the coach-facing view on TeamAthleteProfilePage.
  const { data: splitsAggregate } = useAthleteSplitsAggregate(linkedAthlete?.id ?? null);

  const todayIso = useTodayIso();
  const { data: todaysPlan } = useMyPracticePlan(todayIso, !!linkedAthlete);
  const { data: meetCard } = useMyMeetCard(!!linkedAthlete);


  const [reflectionRaceId, setReflectionRaceId] = useState<string | null>(null);
  const reflectionsEnabled = useFeatureEnabled('reflections');
  const reflectionRace = recentRaces.find((r) => r.raceId === reflectionRaceId);

  if (!linkedAthlete) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your profile isn't linked yet</CardTitle>
          <CardDescription>
            Your account isn't connected to a roster entry, so there's no personal data to show
            here yet. Ask your coach for an invite, or join with your team's code and claim your
            profile from the roster.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate('/join-team')}>Join a team</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">My Progress</h1>
          <p className="text-muted-foreground">
            {linkedAthlete.preferredName || linkedAthlete.name}
            {linkedAthlete.graduationYear ? ` • Class of ${linkedAthlete.graduationYear}` : ''}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to={teamPath(`/athlete/${linkedAthlete.id}/journey`)}>My Journey</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5" />
            Today's practice
          </CardTitle>
          <CardDescription>Only what your group's on tap for — the coach hasn't published anything more than this.</CardDescription>
        </CardHeader>
        <CardContent>
          {!todaysPlan?.plan ? (
            <p className="text-sm text-muted-foreground">Nothing published for today yet.</p>
          ) : (
            <PracticePlanPreview plan={todaysPlan.plan} />
          )}
        </CardContent>
      </Card>

      {meetCard?.meet && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bus className="h-5 w-5" />
              Next meet: {meetCard.meet.name}
            </CardTitle>
            <CardDescription>
              {formatDateShort(meetCard.meet.date)}
              {meetCard.meet.location ? ` · ${meetCard.meet.location}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* No entry status (F1, docs/leadpack-new-ui-trial.md §2):
                entries are managed on Athletic.net, so "You're not
                entered" was often simply wrong. */}
            {meetCard.meet.isHome != null && (
              <Badge variant="outline" className="font-normal">{meetCard.meet.isHome ? 'Home' : 'Away'}</Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Same card the coach sees on this athlete's profile — their own
          predicted time for the next meet above. The prediction is keyed on
          the meet, not on an entry (backend routes/racePredictions.js). */}
      {linkedAthlete && <RacePredictionCard athleteId={linkedAthlete.id} />}

      {/* Same card the coach sees on this athlete's profile — the athlete
          always knows which training group, captain's group and cross
          training they're currently in, without asking. The endpoint already
          allows an athlete to read their own memberships and nobody else's. */}
      {linkedAthlete && <AthleteGroupsCard athleteId={linkedAthlete.id} />}

      <TrainingPacesCard recentRaces={recentRaces} />

      {/* The question an athlete actually asks: where do the next twenty
          seconds come from. Answered from their own races — see
          backend/lib/raceStrategy.js. */}
      {linkedAthlete && recentRaces.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5" />
              Take 20 seconds off your next race
            </CardTitle>
            <CardDescription>
              Where the time actually is, worked out from the races you have already run — your best race against
              your typical one, and what your splits say about how you finish.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to={teamPath(`/athlete/${linkedAthlete.id}/strategy`)}>Open strategy session</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* An athlete's own copy of their own data. The same promise the team
          gets in Settings, at the scope that is theirs — results, splits,
          training logs, reflections, attendance. */}
      {linkedAthlete && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Download className="h-5 w-5" />
              Your data
            </CardTitle>
            <CardDescription>
              Everything this app holds about you — results, splits, training logs, reflections and
              attendance — as a ZIP you can keep. Yours, any time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AthleteExportButton athleteId={linkedAthlete.id} ownData />
          </CardContent>
        </Card>
      )}

      <TrainingLogCard />

      {racesWithSplits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Flag className="h-5 w-5" />
              My splits
            </CardTitle>
            <CardDescription>How you paced yourself, race by race.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {splitsAggregate && splitsAggregate.aggregates.length > 0 && (
              <SplitsAggregateSummary aggregates={splitsAggregate.aggregates} />
            )}
            <div className="divide-y">
              {racesWithSplits.map((r) => (
                <div key={r.resultId} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.raceName}</p>
                      <p className="text-xs text-muted-foreground">{formatDateShort(r.date)}</p>
                    </div>
                    {r.analysis && (
                      <Badge variant="outline" className={SPLIT_PATTERN_BADGE_CLASS[r.analysis.pattern]}>
                        {SPLIT_PATTERN_LABEL[r.analysis.pattern]}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                    {r.segments.map((seg) => (
                      <span key={seg.sequence}>
                        {seg.isClosing ? 'Final' : `Seg ${seg.sequence}`}: {formatSplitMMSS(seg.segmentSec)}
                        {seg.paceSecPerMile != null ? ` (${formatSplitMMSS(seg.paceSecPerMile)}/mi)` : ''}
                      </span>
                    ))}
                    {r.overallPaceSecPerMile != null && (
                      <span className="font-medium text-foreground">
                        Pace: {formatSplitMMSS(r.overallPaceSecPerMile)}/mi
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Some programs opt out of athlete-written reflections entirely —
          Settings → Features. Existing entries are untouched and still in
          the athlete's own export; they just stop being written to. */}
      {reflectionsEnabled && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageCircleHeart className="h-5 w-5" />
            Race goals & reflections
          </CardTitle>
          <CardDescription>
            Write goals before you race, lock them in, and reflect afterward. You choose whether your coach can read it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentRaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No races yet.</p>
          ) : (
            <div className="divide-y">
              {recentRaces.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setReflectionRaceId(r.raceId)}
                  className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-slate-50 rounded-md px-2 -mx-2"
                >
                  <div>
                    <p className="text-sm font-medium">{r.raceName}</p>
                    <p className="text-xs text-muted-foreground">{formatDateShort(r.date)}</p>
                  </div>
                  <span className="text-xs text-primary">Goals & reflection →</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      <Dialog open={!!reflectionRaceId} onOpenChange={(open) => !open && setReflectionRaceId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{reflectionRace?.raceName ?? 'Race'}</DialogTitle>
            <DialogDescription>{reflectionRace ? formatDateShort(reflectionRace.date) : ''}</DialogDescription>
          </DialogHeader>
          {reflectionRaceId && <RaceReflectionDialogBody raceId={reflectionRaceId} />}
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => navigate(teamPath(`/team/athlete/${linkedAthlete.id}`))}>
          <Trophy className="mr-2 h-4 w-4" />
          My full race history
        </Button>
        <Button variant="outline" onClick={() => navigate(teamPath('/analytics'))}>
          <Users className="mr-2 h-4 w-4" />
          Team & meet results
        </Button>
      </div>

      <WhoCanSeeMyStuff />

      <p className="text-center text-xs text-muted-foreground">
        <Link to="/policies" className="underline underline-offset-4 hover:text-foreground">
          What LeadPack does with your data
        </Link>
      </p>

    </div>
  );
};

export default MyProgressPage;
