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
import { invalidateAfterDataChange } from '@/hooks/useDataManagement';

// Import a season from Athletic.net's team Results Grid, read in the coach's
// own browser by a bookmarklet (lib/seasonGridBookmarklet.ts) and pasted
// here. Athletic.net's bot check blocks the automatic server import; this
// path never has LeadPack's server contact Athletic.net at all.

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const BOOKMARKS_BAR_SHORTCUT = isMac ? 'Cmd+Shift+B' : 'Ctrl+Shift+B';

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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const athleticTeamId = currentUser?.team?.athleticTeamId;
  const gridUrl = athleticTeamId ? `https://www.athletic.net/team/${athleticTeamId}/cross-country/${season}/results-grid` : null;
  const rows = csv.trim() ? csv.trim().split('\n').length - 1 : 0;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(buildSeasonGridBookmarkletHref());
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      setCodeCopied(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.post<ImportResult>('/teams/import-season-csv', { year: Number(season), csv });
      setResult(data);
      setCsv('');
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
          Athletic.net now blocks LeadPack's automatic import. This reads your team's {season} Results Grid in your own
          browser, the page you'd look at anyway, and you paste it here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <section className="space-y-2">
          <p className="font-semibold">1. Add the bookmark (one time)</p>
          <p className="text-muted-foreground">
            Show your bookmarks bar ({BOOKMARKS_BAR_SHORTCUT}), then drag this onto it:{' '}
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
          </p>
          <p className="text-muted-foreground">
            If dragging doesn't work, add a bookmark by hand and paste this code as its address:{' '}
            <Button type="button" size="sm" variant="outline" onClick={copyCode}>
              {codeCopied ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
              {codeCopied ? 'Copied' : 'Copy bookmark code'}
            </Button>
          </p>
        </section>

        <section className="space-y-2">
          <p className="font-semibold">2. Copy your results from Athletic.net</p>
          <p className="text-muted-foreground">
            Open the Results Grid, wait for it to load, click the bookmark, then click <strong>Copy results</strong> in the
            panel it shows. It reads both the Mens and Womens tables.
          </p>
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

        <section className="space-y-2">
          <label htmlFor="season-grid-paste" className="font-semibold">
            3. Paste and import
          </label>
          <Textarea
            id="season-grid-paste"
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setError(null);
            }}
            placeholder="Paste here (Ctrl/Cmd+V)"
            className="h-28 font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={runImport} disabled={busy || rows === 0}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busy ? 'Importing…' : `Import ${season} results`}
            </Button>
            {rows > 0 && !busy && <span className="text-muted-foreground">{rows} results pasted</span>}
          </div>
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
