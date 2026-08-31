import React, { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { AlertTriangle, FileUp, Loader2, ShieldCheck, Undo2 } from 'lucide-react';
import { trainingLogService } from '@/api/trainingLogService';
import { ActivityFileError, parseActivityFile, sortRuns, type ParseOutcome } from '@/lib/activityFiles';
import { formatDuration } from '@/lib/formatUtils';
import { getApiErrorMessage } from '@/lib/apiError';

// Import runs from a watch file or a platform export.
//
// Two steps, matching every other import in this app (see
// meets/ImportResultsDialog): parsing shows exactly what would be written
// before anything is, and the athlete confirms. Here the parse is entirely
// local — the file is read in this tab and only summary rows are ever
// posted — which is worth saying out loud in the UI, because "upload your
// health data" is a sentence that should make a person hesitate.

const ACCEPT = '.fit,.gpx,.tcx,.csv,.xml,.zip';

const SKIP_REASONS: Record<string, string> = {
  alreadyImported: 'already in your log',
  duplicateInFile: 'listed twice in the file',
  badType: 'not an importable workout type',
  empty: 'no distance or time recorded',
  future: 'dated in the future',
  tooOld: 'more than five years ago',
  dateMismatch: 'date and start time disagreed',
  outOfRange: 'distance or time out of range',
  noExternalId: 'missing an identifier',
  badDate: 'unreadable date',
  malformed: 'unreadable',
};

export const ImportWorkoutsDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const [parsing, setParsing] = useState(false);
  const [outcome, setOutcome] = useState<ParseOutcome | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  // Off by default, matching TrainingLog's "yours alone" posture. An
  // athlete dropping four years of history should not discover afterwards
  // that they shared it.
  const [shareCoach, setShareCoach] = useState(false);
  const [shareTeam, setShareTeam] = useState(false);
  const [lastBatchIds, setLastBatchIds] = useState<string[]>([]);

  const reset = () => {
    setOutcome(null);
    setParseError(null);
    setParsing(false);
    setShareCoach(false);
    setShareTeam(false);
    setLastBatchIds([]);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setParsing(true);
    setParseError(null);
    setOutcome(null);
    setLastBatchIds([]);

    try {
      const result = await parseActivityFile(file);
      setOutcome(result);
      if (result.runs.length === 0) {
        setParseError(
          result.ignoredNonRuns > 0
            ? 'That file has activities, but no runs in it.'
            : 'No runs found in that file.'
        );
      }
    } catch (err) {
      setParseError(
        err instanceof ActivityFileError ? err.message : 'That file could not be read.'
      );
    } finally {
      setParsing(false);
    }
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!outcome) throw new Error('Nothing to import');
      return trainingLogService.importRuns(outcome.source, outcome.fileName, outcome.runs, {
        sharedWithCoach: shareCoach,
        sharedWithTeam: shareTeam,
      });
    },
    onSuccess: (results) => {
      const created = results.reduce((sum, r) => sum + r.created, 0);
      const skipped = results.reduce(
        (acc, r) => {
          for (const [reason, count] of Object.entries(r.skipped)) {
            acc[reason] = (acc[reason] || 0) + count;
          }
          return acc;
        },
        {} as Record<string, number>
      );

      setLastBatchIds(results.map((r) => r.batchId));
      queryClient.invalidateQueries({ queryKey: ['myTrainingLogs'] });
      queryClient.invalidateQueries({ queryKey: ['today'] });

      const alreadyThere = skipped.alreadyImported ?? 0;
      if (created === 0 && alreadyThere > 0) {
        toast.success(`Already up to date — all ${alreadyThere} runs were already in your log.`);
      } else {
        const detail = Object.entries(skipped)
          .filter(([, count]) => count > 0)
          .map(([reason, count]) => `${count} ${SKIP_REASONS[reason] ?? reason}`)
          .join(', ');
        toast.success(
          `Added ${created} run${created === 1 ? '' : 's'}.`,
          detail ? { description: `Skipped: ${detail}.` } : undefined
        );
      }
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not save those runs.')),
  });

  const undoMutation = useMutation({
    mutationFn: async () => {
      // A multi-chunk import is several batches; undoing means all of them.
      let deleted = 0;
      for (const id of lastBatchIds) {
        const result = await trainingLogService.undoImport(id);
        deleted += result.deleted;
      }
      return deleted;
    },
    onSuccess: (deleted) => {
      setLastBatchIds([]);
      queryClient.invalidateQueries({ queryKey: ['myTrainingLogs'] });
      queryClient.invalidateQueries({ queryKey: ['today'] });
      toast.success(`Removed ${deleted} imported run${deleted === 1 ? '' : 's'}.`);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not undo that import.')),
  });

  const runs = outcome ? sortRuns(outcome.runs) : [];
  const totalMiles = runs.reduce((sum, run) => sum + (run.distanceMi ?? 0), 0);
  const newest = runs[0]?.date;
  const oldest = runs[runs.length - 1]?.date;
  const imported = lastBatchIds.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import runs from your watch</DialogTitle>
          <DialogDescription>
            Bring your training history into LeadPack from Garmin, Strava, Apple Health, COROS —
            anything that can export a file.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            Your file is read here on your device. Only the date, distance and time of each run are
            sent to LeadPack — never the GPS map, and never anything else in the file.
          </AlertDescription>
        </Alert>

        {!outcome && !parsing && (
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed p-6 text-center">
              <FileUp className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Choose a <code>.fit</code>, <code>.gpx</code>, <code>.tcx</code>, <code>.csv</code>{' '}
                file, or a <code>.zip</code> export.
              </p>
              <Button className="mt-4" onClick={() => fileInput.current?.click()}>
                Choose file
              </Button>
            </div>

            <details className="rounded-lg border p-4 text-sm">
              <summary className="cursor-pointer font-medium">
                How do I get my file?
              </summary>
              <dl className="mt-3 space-y-3 text-muted-foreground">
                <div>
                  <dt className="font-medium text-foreground">Garmin — fastest</dt>
                  <dd>
                    Garmin Connect on the web → Activities → filter to Running → Export CSV. One
                    file, all your runs.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Strava</dt>
                  <dd>
                    Settings → My Account → Download or Delete Your Account → Request Archive.
                    Strava emails you a .zip, usually within a few hours. Drop the whole zip here.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Apple Health / Apple Watch</dt>
                  <dd>
                    Health app → tap your picture (top right) → Export All Health Data. Save the
                    .zip and drop it here. It is a big file, and all of it stays on your phone
                    except your run summaries.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">A single run</dt>
                  <dd>
                    Any watch or app that exports one activity as .fit, .gpx or .tcx works — COROS,
                    Suunto, Polar, Wahoo.
                  </dd>
                </div>
              </dl>
            </details>
          </div>
        )}

        {parsing && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading your file…
          </div>
        )}

        {parseError && !parsing && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        )}

        {outcome && runs.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{runs.length} runs</Badge>
              <Badge variant="secondary">{totalMiles.toFixed(1)} mi</Badge>
              {oldest && newest && (
                <span className="text-muted-foreground">
                  {oldest} → {newest}
                </span>
              )}
              {outcome.ignoredNonRuns > 0 && (
                <span className="text-muted-foreground">
                  · {outcome.ignoredNonRuns} non-running{' '}
                  {outcome.ignoredNonRuns === 1 ? 'activity' : 'activities'} skipped
                </span>
              )}
              {outcome.unreadable > 0 && (
                <span className="text-amber-600 dark:text-amber-500">
                  · {outcome.unreadable} could not be read
                </span>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/95">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Date</th>
                    <th className="p-2 font-medium">Type</th>
                    <th className="p-2 text-right font-medium">Miles</th>
                    <th className="p-2 text-right font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.slice(0, 100).map((run) => (
                    <tr key={run.externalId} className="border-t">
                      <td className="p-2">{run.date}</td>
                      <td className="p-2 capitalize text-muted-foreground">{run.type}</td>
                      <td className="p-2 text-right tabular-nums">
                        {run.distanceMi?.toFixed(2) ?? '—'}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {run.durationSec ? formatDuration(run.durationSec) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {runs.length > 100 && (
                <p className="border-t p-2 text-center text-xs text-muted-foreground">
                  Showing the 100 most recent of {runs.length}. All {runs.length} will be imported.
                </p>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">Who can see these?</p>
              <p className="text-xs text-muted-foreground">
                Imported runs are private to you unless you say otherwise. You can change this
                per-run later.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={shareCoach}
                  onCheckedChange={(checked) => setShareCoach(checked === true)}
                  disabled={imported}
                />
                Share with my coaches
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={shareTeam}
                  onCheckedChange={(checked) => setShareTeam(checked === true)}
                  disabled={imported}
                />
                Share with my teammates
              </label>
            </div>

            {imported && (
              <Alert>
                <Undo2 className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>Imported. Changed your mind?</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => undoMutation.mutate()}
                    disabled={undoMutation.isPending}
                  >
                    {undoMutation.isPending ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : null}
                    Undo this import
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={handleFile}
        />

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {imported ? 'Done' : 'Cancel'}
          </Button>
          {(outcome || parseError) && !imported && (
            <Button variant="ghost" onClick={reset}>
              Choose a different file
            </Button>
          )}
          {outcome && runs.length > 0 && !imported && (
            <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
              {importMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Import {runs.length} run{runs.length === 1 ? '' : 's'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportWorkoutsDialog;
