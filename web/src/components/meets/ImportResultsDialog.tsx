import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Upload, ClipboardPaste, AlertTriangle } from 'lucide-react';
import { meetOpsService, type ParsedResultsPreview, type RaceResultEntry } from '@/api/meetOpsService';
import { useSubmitRaceResults } from '@/hooks/useMeetOps';
import { useRosterWithRaces } from '@/hooks/useGroups';
import { formatTime } from '@/lib/formatUtils';

// Manual results import — the insurance policy against Athletic.net blocking
// the scraper. A coach can always SEE a results page in their own browser
// (that's the whole reason the manual field-results upload exists), so the
// input this accepts is deliberately whatever they can get: a copied block
// of text, or a CSV file.
//
// Two steps on purpose. Parsing is read-only and server-side, and shows
// exactly what would be written — including which rows matched a roster
// athlete, which didn't, and which lines were ignored entirely. Only after
// the coach has reviewed (and fixed any unmatched row with the dropdown)
// does it save, through the SAME batch endpoint manual entry and the live
// timer already use. No new write path, and no possibility of a half-applied
// import.

const SKIP = '__skip__';

export const ImportResultsDialog: React.FC<{
  raceId: string;
  raceName: string;
  seasonYear?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ raceId, raceName, seasonYear, open, onOpenChange }) => {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ParsedResultsPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  // Coach overrides for rows the matcher couldn't resolve, keyed by row index.
  const [overrides, setOverrides] = useState<Record<number, string>>({});

  const submitResults = useSubmitRaceResults(raceId);
  const { data: roster = [] } = useRosterWithRaces(seasonYear);

  const reset = () => {
    setText('');
    setPreview(null);
    setOverrides({});
  };

  const handleParse = async () => {
    if (!text.trim()) return;
    setParsing(true);
    try {
      const result = await meetOpsService.parseRaceResults(raceId, text);
      setPreview(result);
      setOverrides({});
      if (result.summary.parsed === 0) {
        toast.error('No result lines found — check the paste includes times.');
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg;
      toast.error(msg ?? 'Could not read those results.');
    } finally {
      setParsing(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setText(await file.text());
    setPreview(null);
  };

  // A row is importable when it resolved to an athlete, either by the
  // server's match or by the coach picking one here.
  const resolvedIdFor = (index: number, athleteId: string | null): string | null => {
    const override = overrides[index];
    if (override === SKIP) return null;
    if (override) return override;
    return athleteId;
  };

  const entries: RaceResultEntry[] = useMemo(() => {
    if (!preview) return [];
    const out: RaceResultEntry[] = [];
    const used = new Set<string>();
    preview.rows.forEach((row, i) => {
      const id = resolvedIdFor(i, row.athleteId);
      // Last-write-wins on a duplicated athlete would silently drop a time,
      // so the first occurrence is kept and the rest are left for the coach
      // to resolve by skipping one.
      if (!id || used.has(id)) return;
      used.add(id);
      out.push({ athleteId: id, time: row.timeSec });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, overrides]);

  const handleImport = async () => {
    if (entries.length === 0) return;
    try {
      const result = await submitResults.mutateAsync(entries);
      toast.success(`Imported ${result.saved} result${result.saved === 1 ? '' : 's'}.`);
      reset();
      onOpenChange(false);
    } catch {
      toast.error('Could not save those results.');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import results — {raceName}</DialogTitle>
          <DialogDescription>
            Paste results straight from a results page, or upload a CSV. Nothing is saved until you review what was
            read.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="space-y-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="font-mono text-xs"
              placeholder={'1  Callum Woods-Vallejo  12  18:42.3  Kenwood\n2  Gigi Anderson  11  19:05\n\n…or CSV:\nPlace,Athlete,Time\n1,Callum Woods-Vallejo,18:42.3'}
            />
            <p className="text-xs text-muted-foreground">
              Other schools' runners are ignored automatically — only your roster is matched, so pasting a whole
              public results page is fine.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" asChild className="h-10 sm:h-9">
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload CSV
                  <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={handleFile} className="hidden" />
                </label>
              </Button>
              <Button onClick={handleParse} disabled={!text.trim() || parsing} className="h-10 sm:h-9">
                {parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardPaste className="mr-2 h-4 w-4" />}
                Read results
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">{preview.summary.matched} matched</Badge>
              {preview.summary.unmatched > 0 && <Badge variant="outline">{preview.summary.unmatched} unmatched</Badge>}
              {preview.summary.skipped > 0 && <Badge variant="outline">{preview.summary.skipped} lines ignored</Badge>}
            </div>

            <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-md border p-2">
              {preview.rows.map((row, i) => {
                const resolved = resolvedIdFor(i, row.athleteId);
                return (
                  <div
                    key={i}
                    className={`flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-sm ${
                      resolved ? '' : 'bg-muted/50'
                    }`}
                  >
                    <span className="w-8 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {row.place ?? '—'}
                    </span>
                    <span className="w-16 shrink-0 font-mono text-xs tabular-nums">{formatTime(row.timeSec)}</span>
                    {row.athleteId && !overrides[i] ? (
                      <span className="min-w-0 flex-1 truncate">{row.matchedName}</span>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate text-xs text-muted-foreground" title={row.raw}>
                          {row.nameCandidates[0] ?? row.raw}
                        </span>
                        <Select
                          value={overrides[i] ?? SKIP}
                          onValueChange={(v) => setOverrides((prev) => ({ ...prev, [i]: v }))}
                        >
                          <SelectTrigger className="h-8 w-[190px] text-xs">
                            <SelectValue placeholder="Skip" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SKIP}>Skip this row</SelectItem>
                            {roster.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.preferredName || a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {row.duplicate && (
                      <span className="flex items-center gap-1 text-xs text-amber-600" title="This athlete appears more than once in the paste">
                        <AlertTriangle className="h-3 w-3" />
                        dup
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {preview.skipped.length > 0 && (
              <details className="rounded-md bg-muted/50 p-2">
                <summary className="cursor-pointer text-xs font-medium">
                  {preview.skipped.length} line{preview.skipped.length === 1 ? '' : 's'} ignored (no time found)
                </summary>
                <pre className="mt-2 max-h-32 overflow-auto text-xs">{preview.skipped.join('\n')}</pre>
              </details>
            )}
          </div>
        )}

        <DialogFooter>
          {preview && (
            <Button variant="outline" onClick={() => setPreview(null)} className="h-10 sm:h-9">
              Back
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-10 sm:h-9">
            Cancel
          </Button>
          {preview && (
            <Button onClick={handleImport} disabled={entries.length === 0 || submitResults.isPending} className="h-10 sm:h-9">
              {submitResults.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {entries.length} result{entries.length === 1 ? '' : 's'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportResultsDialog;
