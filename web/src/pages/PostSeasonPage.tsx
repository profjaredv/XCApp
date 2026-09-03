import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTabsList } from '@/components/ui/responsive-tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Loader2, Save, Trophy } from 'lucide-react';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { usePostseason, useSavePostseasonTags } from '@/hooks/usePostseason';
import {
  POSTSEASON_LABELS,
  POSTSEASON_LEVELS,
  POSTSEASON_PICKER_LABELS,
  type PostseasonLevel,
  type PostseasonMeetTag,
} from '@/api/postseasonService';
import { useQueryParam } from '@/hooks/useQueryState';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { formatTime, formatPace, formatDateShort } from '@/lib/formatUtils';
import { gradeLabelShort } from '@/lib/seasonUtils';

// Post Season — the Season screens, asked only of the races at the end of
// the year.
//
// The season views answer "how did the year go". This answers the question
// a program is actually judged on: who got out of districts, who ran at
// state, and did they run their best race when it counted. Same shape as
// Season (tabbed, season-scoped) so it reads as a peer of it rather than
// a new kind of screen.
//
// Nothing here infers which races were postseason — a coach tags the
// meets, on the Tag Meets tab or from a meet's own page, and everything
// recomputes from the tags. See backend/lib/postseason.js for why tagging
// is a person's job and not a keyword rule's.

const REGULAR_SEASON = '__regular__';

const LEVEL_TONE: Record<PostseasonLevel, string> = {
  LEAGUE: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
  DISTRICT: 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-50',
  REGIONAL: 'bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-50',
  STATE: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-50',
  NATIONAL: 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-50',
};

const LevelBadge: React.FC<{ level: PostseasonLevel }> = ({ level }) => (
  <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${LEVEL_TONE[level]}`}>
    {POSTSEASON_LABELS[level]}
  </span>
);

const PostSeasonPage: React.FC = () => {
  const { activeYear } = useSeasonSelection();
  const teamPath = useTeamPath();
  const [tabParam, setTabParam] = useQueryParam('tab');
  const activeTab = tabParam ?? 'overview';

  const { data, isLoading } = usePostseason(activeYear ?? undefined);
  const saveTags = useSavePostseasonTags();

  // Staged tag edits, so a coach working down a season's meets saves once
  // rather than firing a request per dropdown.
  const [pending, setPending] = useState<Record<string, PostseasonLevel | null>>({});
  useEffect(() => setPending({}), [activeYear]);

  const levelFor = (meet: PostseasonMeetTag) =>
    Object.prototype.hasOwnProperty.call(pending, meet.id) ? pending[meet.id] : meet.level;

  const changedCount = useMemo(
    () => (data?.meets ?? []).filter((m) => Object.prototype.hasOwnProperty.call(pending, m.id) && pending[m.id] !== m.level).length,
    [data?.meets, pending]
  );

  const handleSave = async () => {
    const tags = (data?.meets ?? [])
      .filter((m) => Object.prototype.hasOwnProperty.call(pending, m.id) && pending[m.id] !== m.level)
      .map((m) => ({ meetId: m.id, level: pending[m.id] }));
    if (tags.length === 0) return;
    try {
      const result = await saveTags.mutateAsync(tags);
      setPending({});
      toast.success(
        `${result.racesUpdated} race${result.racesUpdated === 1 ? '' : 's'} tagged. ${
          result.seasonsRecalculated.length > 0 ? `Recalculated ${result.seasonsRecalculated.join(', ')}.` : ''
        }`.trim()
      );
    } catch {
      toast.error('Could not save those tags.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const untagged = (data?.meets ?? []).filter((m) => !m.level);
  const suggestedUntagged = untagged.filter((m) => m.suggestedLevel);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Trophy className="h-6 w-6" />
          Post Season {data?.season ?? ''}
        </h1>
        <CardDescription>
          The races at the end of the year, and the athletes who ran them. Built from the meets you've tagged —
          nothing is guessed from a meet's name.
        </CardDescription>
      </div>

      {data && data.taggedRaceCount === 0 && (
        <Alert>
          <AlertDescription>
            No races tagged as postseason for {data.season} yet.{' '}
            {suggestedUntagged.length > 0
              ? `${suggestedUntagged.length} meet${suggestedUntagged.length === 1 ? ' looks' : 's look'} like a championship from the name — check them on Tag Meets.`
              : 'Tag your championship meets and this screen fills in.'}
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setTabParam(v === 'overview' ? undefined : v)}>
        <ResponsiveTabsList value={activeTab} onValueChange={(v) => setTabParam(v === 'overview' ? undefined : v)}>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="athletes">Athletes</TabsTrigger>
          <TabsTrigger value="races">Races</TabsTrigger>
          <TabsTrigger value="tag">Tag Meets</TabsTrigger>
        </ResponsiveTabsList>

        <TabsContent value="overview" className="pt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {POSTSEASON_LEVELS.filter((level) => (data?.counts?.[level]?.total ?? 0) > 0).map((level) => {
              const count = data!.counts[level];
              return (
                <Card key={level}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{POSTSEASON_LABELS[level]}</CardTitle>
                    <CardDescription>
                      {count.raceCount} race{count.raceCount === 1 ? '' : 's'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold tabular-nums">{count.total}</p>
                    <p className="text-sm text-muted-foreground">
                      {count.men} boy{count.men === 1 ? '' : 's'} · {count.women} girl{count.women === 1 ? '' : 's'}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {data && data.taggedRaceCount > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              {data.taggedRaceCount} of {data.totalRaceCount} races this season are tagged as postseason.
              {untagged.length > 0 ? ` ${untagged.length} meet${untagged.length === 1 ? '' : 's'} still untagged.` : ''}
            </p>
          )}
        </TabsContent>

        <TabsContent value="athletes" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Who ran</CardTitle>
              <CardDescription>
                Sorted by how far they got, then by their fastest postseason pace. "Peaked" compares their best
                postseason pace against their best pace anywhere else that season — the question a November
                conversation actually turns on.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!data || data.athletes.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nobody yet — tag a postseason meet and its runners appear here.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Athlete</TableHead>
                        <TableHead>Furthest</TableHead>
                        <TableHead>Best postseason</TableHead>
                        <TableHead>Season best</TableHead>
                        <TableHead>Peaked</TableHead>
                        <TableHead>Races</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.athletes.map((athlete) => (
                        <TableRow key={athlete.athleteId}>
                          <TableCell className="whitespace-nowrap font-medium">
                            <Link to={teamPath(`/team/athlete/${athlete.athleteId}`)} className="hover:underline">
                              {athlete.name}
                            </Link>
                            {athlete.grade != null && (
                              <span className="ml-2 text-xs text-muted-foreground">{gradeLabelShort(athlete.grade)}</span>
                            )}
                          </TableCell>
                          <TableCell>{athlete.furthestLevel && <LevelBadge level={athlete.furthestLevel} />}</TableCell>
                          <TableCell className="tabular-nums">
                            {athlete.bestPostseasonPaceSecPerMile != null
                              ? formatPace(athlete.bestPostseasonPaceSecPerMile)
                              : '—'}
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {athlete.seasonBestPaceSecPerMile != null ? formatPace(athlete.seasonBestPaceSecPerMile) : '—'}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {athlete.peakedSec == null ? (
                              '—'
                            ) : athlete.peakedSec > 0 ? (
                              <span className="text-primary">+{Math.round(athlete.peakedSec)}s/mi</span>
                            ) : athlete.peakedSec < 0 ? (
                              <span className="text-muted-foreground">{Math.round(athlete.peakedSec)}s/mi</span>
                            ) : (
                              'even'
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {athlete.races.map((race) => (
                              <div key={race.raceId} className="whitespace-nowrap">
                                {formatTime(race.timeSec)} · {POSTSEASON_LABELS[race.level]}
                                {race.overallPlace != null
                                  ? ` · ${race.overallPlace}${race.overallFieldSize ? ` of ${race.overallFieldSize}` : ''}`
                                  : ''}
                              </div>
                            ))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="races" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Postseason races</CardTitle>
              <CardDescription>
                How the team ran at each one. Pack spread needs five finishers to mean anything, so it is blank below
                that rather than computed from four.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!data || data.races.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No postseason races tagged yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Race</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Entrants</TableHead>
                        <TableHead>Best</TableHead>
                        <TableHead>1–5 spread</TableHead>
                        <TableHead>Avg pace</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.races.map((race) => (
                        <TableRow key={race.id}>
                          <TableCell className="whitespace-nowrap">
                            {race.meetId ? (
                              <Link to={teamPath(`/meet/${race.meetId}`)} className="font-medium hover:underline">
                                {race.name}
                              </Link>
                            ) : (
                              <span className="font-medium">{race.name}</span>
                            )}
                            <span className="ml-2 text-xs text-muted-foreground">{formatDateShort(race.date)}</span>
                          </TableCell>
                          <TableCell><LevelBadge level={race.level} /></TableCell>
                          <TableCell className="tabular-nums">{race.entrants}</TableCell>
                          <TableCell className="tabular-nums">
                            {race.bestTimeSec != null ? formatTime(race.bestTimeSec) : '—'}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {race.packSpreadSec != null ? `${Math.round(race.packSpreadSec)}s` : '—'}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {race.avgPaceSecPerMile != null ? formatPace(race.avgPaceSecPerMile) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tag" className="pt-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-lg">Tag meets</CardTitle>
                <CardDescription>
                  Every meet this season. Set a level and save — the app recalculates the seasons you touched. A meet's
                  level applies to all of its races.
                </CardDescription>
              </div>
              <Button onClick={handleSave} disabled={changedCount === 0 || saveTags.isPending}>
                {saveTags.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save{changedCount > 0 ? ` (${changedCount})` : ''}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {!data || data.meets.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No meets on file for this season yet.
                </p>
              ) : (
                <div className="divide-y border-t">
                  {data.meets.map((meet) => {
                    const current = levelFor(meet);
                    return (
                      <div key={meet.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{meet.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateShort(meet.date)} · {meet.raceCount} race{meet.raceCount === 1 ? '' : 's'}
                            {meet.mixed ? ' · races currently tagged differently' : ''}
                            {/* Offered, never applied. "Penn State
                                Invitational" contains the word state. */}
                            {!current && meet.suggestedLevel
                              ? ` · looks like ${POSTSEASON_LABELS[meet.suggestedLevel].toLowerCase()}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!current && meet.suggestedLevel && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => setPending((p) => ({ ...p, [meet.id]: meet.suggestedLevel }))}
                            >
                              Use suggestion
                            </Button>
                          )}
                          <Select
                            value={current ?? REGULAR_SEASON}
                            onValueChange={(value) =>
                              setPending((p) => ({
                                ...p,
                                [meet.id]: value === REGULAR_SEASON ? null : (value as PostseasonLevel),
                              }))
                            }
                            disabled={meet.raceCount === 0}
                          >
                            <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={REGULAR_SEASON}>Regular season</SelectItem>
                              {POSTSEASON_LEVELS.map((level) => (
                                <SelectItem key={level} value={level}>{POSTSEASON_PICKER_LABELS[level]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {current && <Badge variant="secondary">Tagged</Badge>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PostSeasonPage;
