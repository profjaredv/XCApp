import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trackService, type TrackImportSummary } from '@/api/trackService';
import { getApiErrorMessage } from '@/lib/apiError';
import {
  eventProgressToCsv,
  looksLikeEventProgressHtml,
  parseEventProgress,
  type EventProgressGender,
  type ParsedEventProgress,
} from '@/lib/trackEventProgressPaste';

// Track & Field handoff, Section 4's scraper fallback (NOTES.md): the
// Event Progress page is Cloudflare-protected and Angular-rendered, so a
// server-side scraper can't reach it, but the coach's own browser already
// can. This reads the same way the XC Results Grid import does
// (BrowserSeasonImportPanel.tsx): the coach copies the page's HTML in
// their own browser and pastes it here — once per gender tab. The Relays
// tab is not supported yet; there's no real markup sample to build a
// parser from.
const GENDERS: EventProgressGender[] = ['Men', 'Women'];

export function BrowserEventProgressImportPanel({ season, onComplete }: { season: string; onComplete: () => void }) {
  const queryClient = useQueryClient();
  const [parsed, setParsed] = useState<Partial<Record<EventProgressGender, ParsedEventProgress>>>({});
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TrackImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedList = Object.values(parsed) as ParsedEventProgress[];
  const rows = parsedList.reduce((sum, p) => sum + p.rows.length, 0);
  const notes = parsedList.flatMap((p) => p.notes);

  const takePaste = (text: string) => {
    setError(null);
    if (!looksLikeEventProgressHtml(text)) {
      setPaste(text);
      return;
    }
    const p = parseEventProgress(text);
    if (p.errors.length) {
      setError(p.errors.join(' '));
      return;
    }
    if (p.season !== Number(season)) {
      setError(`That page is for ${p.season}, but you are importing ${season}. Open the ${season} Event Progress page, or change the season above.`);
      return;
    }
    setPaste('');
    setParsed((prev) => ({ ...prev, [p.gender as EventProgressGender]: p }));
  };

  const runImport = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const csv = parsedList.length ? eventProgressToCsv(parsedList) : paste;
      const summary = await trackService.importEventProgressCsv(Number(season), csv);
      setResult(summary);
      setPaste('');
      setParsed({});
      queryClient.invalidateQueries({ queryKey: ['track'] });
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
        <CardTitle>Import from Athletic.net's Event Progress page</CardTitle>
        <CardDescription>
          Open your team's {season} Outdoor Event Progress page in your own browser (Team page → Event Progress), right-click it and
          choose Inspect, copy the page's HTML, and paste it below — once for Mens, once for Womens. The Relays tab isn't supported yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Textarea
          id="event-progress-paste"
          value={parsedList.length ? '' : paste}
          onChange={(e) => takePaste(e.target.value)}
          onPaste={(e) => {
            const html = e.clipboardData.getData('text/html');
            if (html && looksLikeEventProgressHtml(html)) {
              e.preventDefault();
              takePaste(html);
            }
          }}
          placeholder="Paste here (Ctrl/Cmd+V)"
          className="h-28 font-mono text-xs"
        />
        {parsedList.length > 0 && (
          <ul className="space-y-0.5">
            {GENDERS.map((g) => {
              const p = parsed[g];
              return (
                <li key={g} className={p ? 'flex items-center gap-1.5' : 'text-muted-foreground'}>
                  {p ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      {g}: {p.rows.length} results
                    </>
                  ) : (
                    <>{g}: not pasted yet (optional)</>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {notes.length > 0 && <p className="text-muted-foreground">{notes.join(' ')}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={runImport} disabled={busy || rows === 0}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {busy ? 'Importing…' : `Import ${season} results`}
          </Button>
          {rows > 0 && !busy && <span className="text-muted-foreground">{rows} results ready</span>}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {result && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
