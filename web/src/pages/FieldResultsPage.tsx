import { useRef, useState } from 'react';
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
import { Upload, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { formatDateShort } from '@/lib/formatUtils';
import { useCurrentSeason } from '@/hooks/useCurrentSeason';
import { useQueryParam } from '@/hooks/useQueryState';
import {
  useFieldResultRaces,
  useUploadFieldResults,
  useClearFieldResults,
} from '@/hooks/useFieldResults';
import type { FieldResultRace } from '@/hooks/useFieldResults';

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

const CSV_TEMPLATE = `Athlete Name,School,Gender,Grade,Time,Place,Status
Jane Doe,Northside,F,11,18:32.4,3,FINISHED
Sam Lee,Eastview,F,10,19:01,5,FINISHED
Pat Rivera,Northside,F,12,,,DNF`;

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const FieldResultsPage = () => {
  const { toast } = useToast();
  const defaultSeason = useCurrentSeason();
  const [seasonParam, setSeasonParam] = useQueryParam('season');
  const season = seasonParam ? parseInt(seasonParam, 10) : defaultSeason;

  const { data: races = [], isLoading } = useFieldResultRaces(season);
  const uploadMutation = useUploadFieldResults();
  const clearMutation = useClearFieldResults();

  const [uploadTarget, setUploadTarget] = useState<FieldResultRace | null>(null);
  const [csvText, setCsvText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableSeasons = Array.from({ length: 6 }, (_, i) => defaultSeason - i);

  const openUploadDialog = (race: FieldResultRace) => {
    setUploadTarget(race);
    setCsvText('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFileAsText(file);
    setCsvText(text);
  };

  const handleUpload = () => {
    if (!uploadTarget || !csvText.trim()) return;
    uploadMutation.mutate(
      { raceId: uploadTarget.id, csvData: csvText },
      {
        onSuccess: (data) => {
          toast({
            title: data.normalizationMet ? 'Field results uploaded' : 'Field results uploaded (below normalization threshold)',
            description: `${data.rowsUploaded} row(s) saved${data.skipped ? `, ${data.skipped} blank row(s) skipped` : ''}${
              data.errors.length ? `, ${data.errors.length} row(s) had errors` : ''
            }. ${data.fieldFinisherCount} finisher(s) recorded${
              !data.normalizationMet ? ' — need 40+ to activate field-normalized comparisons.' : '.'
            }`,
          });
          if (data.errors.length === 0) {
            setUploadTarget(null);
          }
        },
        onError: (err) => {
          toast({ variant: 'destructive', title: 'Upload failed', description: err.message });
        },
      }
    );
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
        <Select value={String(season)} onValueChange={(v) => setSeasonParam(v)}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {availableSeasons.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                    <TableCell className="font-medium">{race.name}</TableCell>
                    <TableCell>{formatDateShort(race.date)}</TableCell>
                    <TableCell>
                      {!race.hasFieldData ? (
                        <Badge variant="outline">No field data yet</Badge>
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

      <Dialog open={uploadTarget != null} onOpenChange={(open) => !open && setUploadTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload field results — {uploadTarget?.name}</DialogTitle>
            <DialogDescription>
              Paste or upload a CSV of every finisher at this meet (all schools). Re-uploading replaces whatever was
              here before for this race.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <AlertTitle>CSV format</AlertTitle>
            <AlertDescription>
              <pre className="text-xs whitespace-pre-wrap mt-1">{CSV_TEMPLATE}</pre>
              Only <strong>Athlete Name</strong> is required. Time is required unless Status is DNF/DNS/DQ.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="text-sm" />
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Paste CSV here, or choose a file above"
              rows={10}
              className="font-mono text-xs"
            />
          </div>

          {uploadMutation.data && uploadMutation.data.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>{uploadMutation.data.errors.length} row(s) had problems and were skipped</AlertTitle>
              <AlertDescription>
                <ul className="text-xs mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                  {uploadMutation.data.errors.map((e, i) => (
                    <li key={i}>Row {e.row}: {e.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadTarget(null)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={!csvText.trim() || uploadMutation.isPending}>
              {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FieldResultsPage;
