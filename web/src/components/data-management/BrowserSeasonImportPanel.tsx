import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { axiosInstance as api } from '@/api/axios';
import { useAuth } from '@/contexts/AuthContext';
import { getApiErrorMessage } from '@/lib/apiError';
import { buildSeasonGridBookmarkletHref } from '@/lib/seasonGridBookmarklet';
import { gridsToCsv, looksLikeGridHtml, parseResultsGrid, type GridGender, type ParsedGrid } from '@/lib/resultsGridPaste';
import { invalidateAfterDataChange } from '@/hooks/useDataManagement';

// Import a season from Athletic.net's team Results Grid, copied by the coach
// in their own browser and pasted here. Two ways to copy, same paste box:
//   - the bookmark (lib/seasonGridBookmarklet.ts) reads both genders and
//     hands over a CSV;
//   - copying the page's <shared-results-grid> element by hand (one gender
//     per paste) is parsed here (lib/resultsGridPaste.ts).
// Athletic.net's bot check blocks the automatic server import; this path
// never has LeadPack's server contact Athletic.net at all, and an import
// never deletes anything that is missing from the paste.

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const BOOKMARKS_BAR_SHORTCUT = isMac ? 'Cmd+Shift+B' : 'Ctrl+Shift+B';
const GENDER_LABEL: Record<GridGender, string> = { Men: 'Boys', Women: 'Girls' };

interface ImportResult {
  message: string;
  recordsProcessed: number;
  skippedMissing: number;
  skippedDate: number;
}

export function BrowserSeasonImportPanel({ season, onComplete }: { season: string; onComplete: () => void }) {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState('');
  const [grids, setGrids] = useState<Partial<Record<GridGender, ParsedGrid>>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const athleticTeamId = currentUser?.team?.athleticTeamId;
  const gridUrl = athleticTeamId ? `https://www.athletic.net/team/${athleticTeamId}/cross-country/${season}/results-grid` : null;

  const pastedGrids = Object.values(grids) as ParsedGrid[];
  const effectiveCsv = pastedGrids.length ? gridsToCsv(pastedGrids) : csv;
  const rows = effectiveCsv.trim() ? effectiveCsv.trim().split('\n').length - 1 : 0;
  const notes = pastedGrids.flatMap((g) => g.notes);
  // The bookmark writes "Unknown" when it couldn't read a distance. Importing
  // those would create races keyed on "Unknown" that a fixed import then duplicates.
  const unknownDistance = (effectiveCsv.match(/,"Unknown","/g) ?? []).length;
  const blocked = rows > 0 && unknownDistance >= rows / 2;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(buildSeasonGridBookmarkletHref());
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      setCodeCopied(false);
    }
  };

  // Text from the paste box or the clipboard: the grid's HTML, or a CSV from the bookmark.
  const takePaste = (text: string) => {
    setError(null);
    if (!looksLikeGridHtml(text)) {
      setCsv(text);
      return;
    }
    const grid = parseResultsGrid(text);
    if (grid.errors.length) {
      setError(grid.errors.join(' '));
      return;
    }
    if (grid.year !== Number(season)) {
      setError(`That grid is for ${grid.year}, but you are importing ${season}. Open the ${season} grid, or change the season above.`);
      return;
    }
    setCsv('');
    setGrids((prev) => ({ ...prev, [grid.gender as GridGender]: grid }));
  };

  const runImport = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.post<ImportResult>('/teams/import-season-csv', { year: Number(season), csv: effectiveCsv });
      setResult(data);
      setCsv('');
      setGrids({});
      invalidateAfterDataChange(queryClient);
      onComplete();
    } catch (e) {
      setError(getApiErrorMessage(e, 'The import failed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import from Athletic.net in your browser</CardTitle>
        <CardDescription>
          Athletic.net now blocks LeadPack's automatic import. Copy your team's {season} Results Grid in your own browser, the page
          you'd look at anyway, and paste it here. Nothing already in LeadPack is deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <section className="space-y-2">
          <p className="font-semibold">1. Open the Results Grid</p>
          {gridUrl ? (
            <Button asChild variant="outline" size="sm">
              <a href={gridUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Open the {season} Results Grid
              </a>
            </Button>
          ) : (
            <p className="text-muted-foreground">Set your Athletic.net team in Settings to get a direct link.</p>
          )}
        </section>

        <section className="space-y-3">
          <p className="font-semibold">2. Copy it (either way)</p>
          <div className="space-y-1">
            <p className="font-medium">A. One click, with a bookmark</p>
            <p className="text-muted-foreground">
              One time: show your bookmarks bar ({BOOKMARKS_BAR_SHORTCUT}) and drag this onto it:{' '}
              <a
                ref={(el) => {
                  // React strips javascript: URLs from the href prop; set it on the DOM node so it can be dragged.
                  if (el) el.setAttribute('href', buildSeasonGridBookmarkletHref());
                }}
                onClick={(e) => e.preventDefault()}
                className="inline-block cursor-grab rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground"
              >
                LeadPack: Results Grid
              </a>
              . Then, on the grid, click the bookmark and press <strong>Copy results</strong>. It reads Mens and Womens together.
            </p>
            <p className="text-muted-foreground">
              Dragging not working?{' '}
              <Button type="button" size="sm" variant="outline" onClick={copyCode}>
                {codeCopied ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                {codeCopied ? 'Copied' : 'Copy bookmark code'}
              </Button>{' '}
              and paste it as the address of a new bookmark.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">B. By hand, no bookmark</p>
            <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
              <li>On the Results Grid, right-click the page next to the "Results Grid" title and choose <strong>Inspect</strong>.</li>
              <li>
                In the panel that opens, find the line <code>&lt;shared-results-grid&gt;</code>, right-click it, and choose{' '}
                <strong>Copy &gt; Copy element</strong>.
              </li>
              <li>Paste below. Then click <strong>Womens</strong> on the grid and repeat for the girls.</li>
            </ol>
          </div>
        </section>

        <section className="space-y-2">
          <label htmlFor="season-grid-paste" className="font-semibold">
            3. Paste and import
          </label>
          <Textarea
            id="season-grid-paste"
            value={pastedGrids.length ? '' : csv}
            onChange={(e) => takePaste(e.target.value)}
            onPaste={(e) => {
              const html = e.clipboardData.getData('text/html');
              if (html && looksLikeGridHtml(html)) {
                e.preventDefault();
                takePaste(html);
              }
            }}
            placeholder="Paste here (Ctrl/Cmd+V)"
            className="h-28 font-mono text-xs"
          />
          {pastedGrids.length > 0 && (
            <ul className="space-y-0.5">
              {(['Men', 'Women'] as const).map((g) => {
                const grid = grids[g];
                return (
                  <li key={g} className={grid ? 'flex items-center gap-1.5' : 'text-muted-foreground'}>
                    {grid ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        {GENDER_LABEL[g]}: {grid.rows.length} results across {grid.meets.length} meets
                      </>
                    ) : (
                      <>{GENDER_LABEL[g]}: not pasted yet (optional)</>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {notes.length > 0 && <p className="text-muted-foreground">{notes.join(' ')}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={runImport} disabled={busy || rows === 0 || blocked}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busy ? 'Importing…' : `Import ${season} results`}
            </Button>
            {rows > 0 && !busy && <span className="text-muted-foreground">{rows} results ready</span>}
          </div>
          {blocked && (
            <Alert variant="destructive">
              <AlertDescription>
                Most of these results have no distance, so the bookmark didn't read the page's distance key. Importing them would
                create races that have to be cleaned up. Nothing was imported.
              </AlertDescription>
            </Alert>
          )}
        </section>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {result && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              {result.message}
              {result.skippedMissing + result.skippedDate > 0 &&
                ` ${result.skippedMissing + result.skippedDate} row(s) were skipped because a name, time or date was missing or unreadable.`}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
