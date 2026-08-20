import { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload, CheckCircle2, AlertCircle, Trash2, Users, Bookmark, Copy, ExternalLink } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { formatDateShort } from '@/lib/formatUtils';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { buildBookmarkletHref } from '@/lib/fieldResultsBookmarklet';
import { parseCsv, toCsv } from '@/lib/csvParse';
import {
  useFieldResultRaces,
  useUploadFieldResults,
  useCopyFieldResultsFromMeet,
  useClearFieldResults,
} from '@/hooks/useFieldResults';
import type { FieldResultRace, UploadFieldResultsResponse } from '@/hooks/useFieldResults';

// Manual field-results upload (Phase 2 step 3's fallback — the automated
// full-field scraper is blocked in this environment; see NOTES.md and
// backend/lib/fieldResultsCsv.js for why). A coach copies a meet's full
// results from Athletic.net into a CSV — every school, not just this
// team's own athletes — and uploads it here for one of the team's races.
// That's what lets band analytics' field-normalized ratio metric turn on
// (GET /api/analytics/bands' normalizationAvailable flag).
//
// FieldResult rows (other schools' athletes) are never returned by any
// endpoint — this page only ever shows this team's own races and the
// AGGREGATE field stats computed from an upload, never a list of names
// from another school.
//
// Upload is meet-scoped, not race-scoped: one results/all page usually
// covers several divisions (Varsity, JV Gold, Freshman, ...), and our own
// Race rows don't reliably line up with those divisions one-for-one — the
// season scraper that creates them only ever saw our own team's PRs per
// meet, never which heat/level each one raced in. So a coach pastes the
// whole meet's CSV once, and explicitly maps each division the bookmarklet
// found to one of this meet's races (or skips it) — no name-matching
// guesswork.

const CSV_TEMPLATE = `Athlete Name,Division,Gender,School,Grade,Time,Place,Status
Jane Doe,Girls Varsity,F,Northside,11,18:32.4,3,FINISHED
Sam Lee,Girls JV,F,Eastview,10,19:01,5,FINISHED
Pat Rivera,Girls Varsity,F,Northside,12,,,DNF`;

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
const BOOKMARKS_BAR_SHORTCUT = isMac ? 'Cmd+Shift+B' : 'Ctrl+Shift+B';

// Sentinel Select value for "don't upload this division anywhere" — Radix
// Select rejects an empty-string item value, and this also doubles as the
// default (unmapped) state so nothing uploads until a coach actively picks
// a race.
const SKIP_VALUE = '__skip__';
// Bucket key used when the pasted CSV has no Division column at all (a
// hand-typed CSV, or a results page with only one race/section) — every row
// falls into this one bucket, same as the old race-scoped upload behaved.
const NO_DIVISION_KEY = '__all_rows__';

interface MeetGroup {
  meetId: string;
  name: string;
  date: string;
  resultsAllUrl: string | null;
  races: FieldResultRace[];
}

interface DivisionUploadResult {
  division: string;
  raceName: string;
  response?: UploadFieldResultsResponse;
  error?: string;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function openInNewWindow(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

const FieldResultsPage = () => {
  const { toast } = useToast();
  const { activeYear } = useSeasonSelection();
  const season = activeYear ?? undefined;

  const { data: races = [], isLoading } = useFieldResultRaces(season);
  const uploadMutation = useUploadFieldResults();
  const copyMutation = useCopyFieldResultsFromMeet();
  const clearMutation = useClearFieldResults();

  const meetGroups = useMemo(() => {
    const map = new Map<string, MeetGroup>();
    races.forEach((r) => {
      const existing = map.get(r.meetId);
      if (existing) {
        existing.races.push(r);
        if (!existing.resultsAllUrl && r.resultsAllUrl) existing.resultsAllUrl = r.resultsAllUrl;
      } else {
        map.set(r.meetId, { meetId: r.meetId, name: r.name, date: r.date, resultsAllUrl: r.resultsAllUrl, races: [r] });
      }
    });
    return map;
  }, [races]);

  const [uploadMeetId, setUploadMeetId] = useState<string | null>(null);
  const [csvText, setCsvText] = useState('');
  const [divisionMapping, setDivisionMapping] = useState<Record<string, string>>({});
  const [divisionResults, setDivisionResults] = useState<DivisionUploadResult[] | null>(null);
  const [isUploadingAll, setIsUploadingAll] = useState(false);
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMeetGroup = uploadMeetId ? meetGroups.get(uploadMeetId) ?? null : null;

  const parsedCsv = useMemo(() => parseCsv(csvText), [csvText]);
  const divisionKey = useMemo(
    () => parsedCsv.headers.find((h) => h.trim().toLowerCase() === 'division') ?? null,
    [parsedCsv.headers]
  );
  // Distinct division labels, in first-seen order — or a single "all rows"
  // bucket when the CSV has no Division column.
  const divisions = useMemo(() => {
    if (!divisionKey) return parsedCsv.rows.length > 0 ? [NO_DIVISION_KEY] : [];
    const seen: string[] = [];
    parsedCsv.rows.forEach((row) => {
      const label = (row[divisionKey] || '').trim();
      const key = label || NO_DIVISION_KEY;
      if (!seen.includes(key)) seen.push(key);
    });
    return seen;
  }, [divisionKey, parsedCsv.rows]);

  const openUploadDialog = (race: FieldResultRace) => {
    setUploadMeetId(race.meetId);
    setCsvText('');
    setDivisionMapping({});
    setDivisionResults(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFileAsText(file);
    setCsvText(text);
    setDivisionResults(null);
  };

  const handleUploadAll = async () => {
    if (!uploadMeetGroup) return;
    const mapped = divisions
      .map((division) => ({ division, raceId: divisionMapping[division] }))
      .filter((d): d is { division: string; raceId: string } => Boolean(d.raceId) && d.raceId !== SKIP_VALUE);
    if (mapped.length === 0) return;

    setIsUploadingAll(true);
    const results: DivisionUploadResult[] = [];

    for (const { division, raceId } of mapped) {
      const race = uploadMeetGroup.races.find((r) => r.id === raceId);
      const rowsForDivision = divisionKey
        ? parsedCsv.rows.filter((row) => ((row[divisionKey] || '').trim() || NO_DIVISION_KEY) === division)
        : parsedCsv.rows;
      // Division (and Gender, when the bookmarklet supplied one) travel
      // through to the backend now — a race legitimately holds several
      // divisions' worth of field data at once, so the upload needs to say
      // which division each row belongs to instead of the dialog silently
      // discarding that context after using it to split the CSV client-side.
      const csvData = toCsv(parsedCsv.headers, rowsForDivision);

      try {
        const response = await uploadMutation.mutateAsync({ raceId, csvData });
        results.push({ division, raceName: race?.name || '', response });
      } catch (err) {
        results.push({
          division,
          raceName: race?.name || '',
          error: err instanceof Error ? err.message : 'Upload failed',
        });
      }
    }

    setIsUploadingAll(false);
    setDivisionResults(results);

    const allClean = results.every((r) => r.response && r.response.errors.length === 0 && !r.error);
    if (allClean) {
      toast({
        title: 'Field results uploaded',
        description: `${results.length} division(s) uploaded to ${uploadMeetGroup.name}.`,
      });
      setUploadMeetId(null);
    } else {
      toast({
        variant: 'destructive',
        title: 'Some divisions had problems',
        description: 'See details in the dialog below.',
      });
    }
  };

  const handleCopyFromMeet = (race: FieldResultRace) => {
    copyMutation.mutate(
      { raceId: race.id },
      {
        onSuccess: (data) =>
          toast({
            title: 'Field results copied',
            description: `${race.name}: adopted ${data.fieldFinisherCount} finisher(s) from another team's upload of this meet.`,
          }),
        onError: (err) => toast({ variant: 'destructive', title: 'Copy failed', description: err.message }),
      }
    );
  };

  const handleCopyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(buildBookmarkletHref());
      setBookmarkletCopied(true);
      toast({ title: 'Bookmarklet code copied', description: 'Paste it into the URL field when creating the bookmark (step 3 above).' });
      setTimeout(() => setBookmarkletCopied(false), 2000);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Copy failed',
        description: 'Your browser blocked clipboard access — select the code below and copy it manually instead.',
      });
    }
  };

  const handleClear = (race: FieldResultRace) => {
    clearMutation.mutate(
      { raceId: race.id },
      {
        onSuccess: () => toast({ title: 'Field results cleared', description: `${race.name} no longer has field data.` }),
        onError: (err) => toast({ variant: 'destructive', title: 'Failed to clear', description: err.message }),
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Field Results</h1>
          <CardDescription>
            Upload full-meet results (every school, not just your team) to unlock field-normalized comparisons in
            Band Analytics.
          </CardDescription>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Races — {season}</CardTitle>
          <CardDescription>
            A race needs 40+ full-field finishers before field-normalized ratios activate — below that, pace-per-mile
            still works fine on its own.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading races...</p>
          ) : races.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No races found for {season}.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Race</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Field Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {races.map((race) => (
                  <TableRow key={race.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {race.name}
                        {race.resultsAllUrl && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 shrink-0"
                            title="Open this meet's full results on athletic.net"
                            onClick={() => openInNewWindow(race.resultsAllUrl as string)}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatDateShort(race.date)}</TableCell>
                    <TableCell>
                      {!race.hasFieldData ? (
                        race.availableFromOtherTeam ? (
                          <Badge variant="outline" className="gap-1">
                            <Users className="h-3 w-3" /> Available from another team ({race.otherTeamFieldFinisherCount})
                          </Badge>
                        ) : (
                          <Badge variant="outline">No field data yet</Badge>
                        )
                      ) : race.normalizationMet ? (
                        <Badge className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {race.fieldFinisherCount} finishers
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <AlertCircle className="h-3 w-3" /> {race.fieldFinisherCount} finishers (below 40)
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {!race.hasFieldData && race.availableFromOtherTeam && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleCopyFromMeet(race)}
                          disabled={copyMutation.isPending}
                        >
                          <Users className="h-3.5 w-3.5 mr-1" /> Use shared results
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openUploadDialog(race)}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> {race.hasFieldData ? 'Re-upload' : 'Upload'}
                      </Button>
                      {race.hasFieldData && (
                        <Button size="sm" variant="ghost" onClick={() => handleClear(race)} disabled={clearMutation.isPending}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={uploadMeetId != null} onOpenChange={(open) => !open && setUploadMeetId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Upload field results — {uploadMeetGroup?.name}
              {uploadMeetGroup?.resultsAllUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openInNewWindow(uploadMeetGroup.resultsAllUrl as string)}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open results/all
                </Button>
              )}
            </DialogTitle>
            <DialogDescription>
              Paste or upload a CSV of every finisher at this meet (all schools, all divisions). Re-uploading a
              division replaces whatever was there before for that race.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <AlertTitle className="flex items-center gap-2">
              <Bookmark className="h-4 w-4" /> Set up the extraction bookmarklet (one-time)
            </AlertTitle>
            <AlertDescription className="space-y-2">
              <ol className="list-decimal list-inside space-y-2 mt-1">
                <li>
                  Make sure your bookmarks bar is showing — press <kbd className="px-1 py-0.5 rounded border bg-muted text-[11px]">{BOOKMARKS_BAR_SHORTCUT}</kbd> to
                  toggle it if you don't see one under the address bar.
                </li>
                <li>
                  Drag this onto the bookmarks bar:{' '}
                  <a
                    ref={(el) => {
                      // React 19 blocks javascript: URLs passed through the href
                      // prop (strips the attribute instead of setting it — the
                      // "blocked a javascript: URL" console warning), which left
                      // nothing for the browser to grab when dragging this to
                      // the bookmarks bar. Setting it imperatively on the DOM
                      // node sidesteps React's own attribute sanitization.
                      if (el) el.setAttribute('href', buildBookmarkletHref());
                    }}
                    onClick={(e) => e.preventDefault()}
                    className="inline-block px-2 py-1 rounded border text-xs font-medium bg-muted hover:bg-muted/80 cursor-grab"
                  >
                    📋 Extract Field Results
                  </a>
                </li>
                <li>
                  If the drag doesn't take (some browsers block dragging from inside a dialog): right-click the
                  bookmarks bar, choose "Add page" (or "Add bookmark"), give it any name, then paste this into the
                  URL field —
                  <div className="flex items-start gap-2 mt-1">
                    <code className="flex-1 text-[10px] leading-snug break-all bg-muted rounded px-2 py-1 max-h-20 overflow-y-auto">
                      {buildBookmarkletHref()}
                    </code>
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={handleCopyBookmarklet}>
                      {bookmarkletCopied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </li>
              </ol>
              <p>
                Then open the meet's full results page on athletic.net (use "Open results/all" above), click the
                bookmark, and it copies a ready-to-paste CSV of every finisher, tagged by division. Runs in your
                browser only — nothing is sent anywhere except your own clipboard.
              </p>
            </AlertDescription>
          </Alert>

          <Alert>
            <AlertTitle>CSV format</AlertTitle>
            <AlertDescription>
              <pre className="text-xs whitespace-pre-wrap mt-1">{CSV_TEMPLATE}</pre>
              Only <strong>Athlete Name</strong> is required. Time is required unless Status is DNF/DNS/DQ.{' '}
              <strong>Division</strong> is optional — include it (the bookmarklet always does) so results from
              different levels/heats can be mapped to different races below; without it, every row is treated as one
              division. <strong>Gender</strong> is also optional (M/F) — the bookmarklet fills it in automatically on
              a meet's results/all page, and it's what lets an athlete's overall place combine correctly across
              divisions of the same gender (Boys Gold/Silver/Bronze Varsity, etc.) without mixing genders together.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="text-sm" />
            <Textarea
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setDivisionResults(null);
              }}
              placeholder="Paste CSV here, or choose a file above"
              rows={10}
              className="font-mono text-xs"
            />
          </div>

          {divisions.length > 0 && uploadMeetGroup && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Map each division found in this CSV to one of this meet's races — this isn't guessed for you, since
                our races don't always line up one-to-one with Athletic.net's divisions.
              </p>
              <div className="space-y-2 rounded-md border p-3">
                {divisions.map((division) => (
                  <div key={division} className="flex items-center justify-between gap-3">
                    <span className="text-sm">
                      {division === NO_DIVISION_KEY ? 'All rows in this CSV' : division}
                    </span>
                    <Select
                      value={divisionMapping[division] ?? SKIP_VALUE}
                      onValueChange={(v) => setDivisionMapping((prev) => ({ ...prev, [division]: v }))}
                    >
                      <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SKIP_VALUE}>Skip this division</SelectItem>
                        {uploadMeetGroup.races.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                            {r.distance ? ` (${r.distance})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {divisionResults && (
            <div className="space-y-2">
              {divisionResults.map((r, i) => (
                <Alert key={i} variant={r.error || (r.response && r.response.errors.length > 0) ? 'destructive' : 'default'}>
                  <AlertTitle>
                    {r.division === NO_DIVISION_KEY ? 'All rows' : r.division} → {r.raceName}
                  </AlertTitle>
                  <AlertDescription>
                    {r.error ? (
                      r.error
                    ) : r.response ? (
                      <>
                        {r.response.rowsUploaded} row(s) saved
                        {r.response.skipped ? `, ${r.response.skipped} blank row(s) skipped` : ''}.{' '}
                        {r.response.fieldFinisherCount} finisher(s) recorded
                        {!r.response.normalizationMet ? ' — need 40+ to activate field-normalized comparisons.' : '.'}
                        {r.response.errors.length > 0 && (
                          <ul className="text-xs mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                            {r.response.errors.map((e, ei) => (
                              <li key={ei}>Row {e.row}: {e.message}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadMeetId(null)}>Cancel</Button>
            <Button
              onClick={handleUploadAll}
              disabled={
                !csvText.trim() ||
                isUploadingAll ||
                !Object.values(divisionMapping).some((v) => v && v !== SKIP_VALUE)
              }
            >
              {isUploadingAll ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FieldResultsPage;
