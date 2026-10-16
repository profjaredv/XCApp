import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { getApiErrorMessage } from '@/lib/apiError';
import { invalidateAfterDataChange } from '@/hooks/useDataManagement';
import { applyPicks, pickKey, readBox, type PasteBox } from '@/lib/gridPasteInput';
import type { GridGender, GridPayload } from '@/lib/gridTextParse';
import {
  resultsPasteService,
  type AthleteDecision,
  type MeetDecision,
  type PastePlan,
  type PasteDecisions,
} from '@/api/resultsPasteService';
import { BrowserSeasonImportPanel } from './BrowserSeasonImportPanel';

// "Update results": copy the Athletic.net Results Grid (Ctrl+A, Ctrl+C on the
// page), paste Boys, optionally Girls, review, confirm. The coach's own
// browser reads the page; LeadPack's server never contacts Athletic.net.
// Nothing already in LeadPack is deleted because it is missing from a paste.

const BOX_LABEL: Record<GridGender, string> = { Men: 'Boys', Women: 'Girls' };
const SELECTED: Record<GridGender, string> = { Men: 'Mens', Women: 'Womens' };
const EMPTY_BOX: PasteBox = { text: '', html: '' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};
const classOf = (year: number | null) => (year ? `class of ${year}` : 'class year unknown');

export function UpdateResultsPanel({ season, onComplete }: { season: string; onComplete: () => void }) {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [boxes, setBoxes] = useState<Record<GridGender, PasteBox>>({ Men: EMPTY_BOX, Women: EMPTY_BOX });
  const [infoText, setInfoText] = useState('');
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [decisions, setDecisions] = useState<PasteDecisions>({ athletes: {}, meets: {} });
  const [plan, setPlan] = useState<PastePlan | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const requestId = useRef(0);
  const picksRef = useRef(picks);
  picksRef.current = picks;

  const athleticTeamId = currentUser?.team?.athleticTeamId;
  const gridUrl = athleticTeamId ? `https://www.athletic.net/team/${athleticTeamId}/cross-country/${season}/results-grid` : null;

  const reads = useMemo(
    () => ({ Men: readBox('Men', boxes.Men, infoText), Women: readBox('Women', boxes.Women, infoText) }),
    [boxes, infoText]
  );
  const needsInfo = reads.Men.state === 'needsInfo' || reads.Women.state === 'needsInfo';
  const anyBoxError = reads.Men.state === 'error' || reads.Women.state === 'error';
  const grids = useMemo(
    () => (['Men', 'Women'] as const).flatMap((g) => (reads[g].payload ? [applyPicks(reads[g].payload as GridPayload, picks)] : [])),
    [reads, picks]
  );

  // Ask the server what this paste would do whenever the paste or a decision changes.
  const requestKey = useMemo(() => JSON.stringify({ season, grids, decisions }), [season, grids, decisions]);
  useEffect(() => {
    if (grids.length === 0) {
      setPlan(null);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const next = await resultsPasteService.preview({ season: Number(season), grids, decisions });
        if (id === requestId.current) {
          setPlan(next);
          setPreviewError(null);
          // Keep an earlier choice between two times unless the coach has just made a new one.
          const missing = Object.entries(next.preselect ?? {}).filter(([k]) => !(k in picksRef.current));
          if (missing.length) setPicks((p) => ({ ...Object.fromEntries(missing), ...p }));
        }
      } catch (e) {
        if (id === requestId.current) {
          setPlan(null);
          setPreviewError(getApiErrorMessage(e, 'Could not read that paste. Please try again.'));
        }
      } finally {
        if (id === requestId.current) setPreviewing(false);
      }
    }, 350);
    return () => clearTimeout(timer);
    // requestKey stands for grids/decisions/season.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const setBox = (g: GridGender, box: PasteBox) => {
    setDone(null);
    setSaveError(null);
    setBoxes((prev) => ({ ...prev, [g]: box }));
    setPicks({});
  };
  const decideAthlete = (key: string, d: AthleteDecision) => setDecisions((p) => ({ ...p, athletes: { ...p.athletes, [key]: d } }));
  const decideMeet = (key: string, d: MeetDecision) => setDecisions((p) => ({ ...p, meets: { ...p.meets, [key]: d } }));

  const summary = plan?.summary;
  const canConfirm =
    !!plan && plan.hasChanges && !previewing && !saving && grids.length > 0 && !anyBoxError && !needsInfo && plan.errors.length === 0 && (summary?.needsReview ?? 1) === 0;
  const reviewAthletes = plan?.athletes.filter((a) => a.status === 'review') ?? [];
  const newAthletes = plan?.athletes.filter((a) => a.status === 'new') ?? [];
  const doubles = grids.flatMap((g) =>
    g.athletes.flatMap((a) => a.cells.filter((c) => c.alternatives).map((c) => ({ athlete: a, cell: c, meetName: g.meets[c.meet].name })))
  );

  const confirm = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await resultsPasteService.commit({ season: Number(season), grids, decisions });
      setDone(res.applied ? `${res.message} ${res.summary.newResults} new and ${res.summary.changedResults} changed results.` : res.message);
      setBoxes({ Men: EMPTY_BOX, Women: EMPTY_BOX });
      setInfoText('');
      setPicks({});
      setDecisions({ athletes: {}, meets: {} });
      setPlan(null);
      invalidateAfterDataChange(queryClient);
      onComplete();
    } catch (e) {
      setSaveError(getApiErrorMessage(e, 'Could not save those results. Nothing was changed.'));
    } finally {
      setSaving(false);
    }
  };

  const renderBox = (g: GridGender, n: number) => {
    const read = reads[g];
    return (
      <section className="space-y-2" key={g}>
        <label htmlFor={`paste-${g}`} className="font-semibold">
          {n}. Paste {BOX_LABEL[g]}
          {g === 'Women' && <span className="ml-2 font-normal text-muted-foreground">(optional)</span>}
        </label>
        <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
          <li>
            {gridUrl ? (
              <a href={gridUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground underline">
                Open your Results Grid on Athletic.net <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              'Open your Results Grid on Athletic.net (set your Athletic.net team in Settings to get a direct link)'
            )}
          </li>
          <li>Make sure <strong>{SELECTED[g]}</strong> is selected.</li>
          <li>Press <strong>Ctrl+A (⌘A)</strong>, then <strong>Ctrl+C (⌘C)</strong>.</li>
          <li>Paste here.</li>
        </ol>
        <Textarea
          id={`paste-${g}`}
          aria-label={`${BOX_LABEL[g]} paste`}
          value={boxes[g].text}
          onChange={(e) => setBox(g, { text: e.target.value, html: '' })}
          onPaste={(e) => {
            const plain = e.clipboardData.getData('text/plain');
            if (!plain) return;
            e.preventDefault();
            setBox(g, { text: plain, html: e.clipboardData.getData('text/html') });
          }}
          placeholder={`Paste the ${BOX_LABEL[g]} grid here (Ctrl/Cmd+V)`}
          className="h-20 font-mono text-xs"
        />
        {read.state === 'ok' && (
          <p className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {read.summary}
          </p>
        )}
        {read.state === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>{read.errors.join(' ')}</AlertDescription>
          </Alert>
        )}
        {read.notes.length > 0 && <p className="text-muted-foreground">{read.notes.join(' ')}</p>}
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Update results</CardTitle>
          <CardDescription>
            Copy your team's {season} Results Grid from Athletic.net and paste it here. LeadPack reads what you paste in your browser and
            never contacts Athletic.net. Nothing already in LeadPack is deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          {renderBox('Men', 1)}
          {renderBox('Women', 2)}

          {needsInfo && (
            <section className="space-y-2">
              <label htmlFor="paste-info" className="font-semibold">
                The paste didn't include the meet list. Copy the Meet List and Race Distances below the grid and paste them here.
              </label>
              <Textarea id="paste-info" aria-label="Meet list and race distances" value={infoText} onChange={(e) => setInfoText(e.target.value)} className="h-20 font-mono text-xs" placeholder="Race Distances: …  Meet List: …" />
            </section>
          )}

          {previewError && (
            <Alert variant="destructive">
              <AlertDescription>{previewError}</AlertDescription>
            </Alert>
          )}
          {plan && plan.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>{plan.errors.join(' ')}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {plan && plan.errors.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              Meets {previewing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <ul className="space-y-2">
              {plan.meets.map((m) => (
                <li key={m.key} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {shortDate(m.date)} · {m.name}
                    </span>
                    {m.status === 'new' && <Badge>New</Badge>}
                    {m.status === 'existing' && <Badge variant="secondary">Already in LeadPack</Badge>}
                    {m.status === 'review' && <Badge variant="destructive">Needs your choice</Badge>}
                  </div>
                  <p className="text-muted-foreground">{m.distances.join(', ') || 'No results yet'}</p>
                  {m.status === 'existing' && m.existingName && m.existingName !== m.name && (
                    <p className="text-muted-foreground">Same meet as “{m.existingName}”.</p>
                  )}
                  {m.status === 'review' && (
                    <fieldset className="mt-2 space-y-1">
                      <legend className="text-muted-foreground">{m.reviewReason}</legend>
                      {m.candidates?.map((c) => (
                        <label key={c.id} className="flex items-center gap-2">
                          <input type="radio" name={`meet-${m.key}`} checked={decisions.meets[m.key]?.action === 'existing' && (decisions.meets[m.key] as { meetId: string }).meetId === c.id} onChange={() => decideMeet(m.key, { action: 'existing', meetId: c.id })} />
                          Same meet as “{c.name}”
                        </label>
                      ))}
                      <label className="flex items-center gap-2">
                        <input type="radio" name={`meet-${m.key}`} checked={decisions.meets[m.key]?.action === 'new'} onChange={() => decideMeet(m.key, { action: 'new' })} />
                        Add as a new meet
                      </label>
                    </fieldset>
                  )}
                </li>
              ))}
            </ul>

            {reviewAthletes.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-semibold">Needs your decision ({reviewAthletes.length})</h3>
                <p className="text-muted-foreground">LeadPack won't guess. Choose who these are; it will remember your answer for next time.</p>
                <ul className="space-y-2">
                  {reviewAthletes.map((a) => (
                    <li key={a.key} className="rounded-xl border p-3">
                      <p className="font-medium">
                        {a.name} <span className="font-normal text-muted-foreground">({BOX_LABEL[a.gender]}{a.grade ? `, grade ${a.grade}` : ''})</span>
                      </p>
                      <fieldset className="mt-1 space-y-1">
                        <legend className="text-muted-foreground">{a.reviewReason}</legend>
                        {a.candidates?.map((c) => (
                          <label key={c.id} className="flex items-center gap-2">
                            <input type="radio" name={`ath-${a.key}`} checked={decisions.athletes[a.key]?.action === 'existing' && (decisions.athletes[a.key] as { athleteId: string }).athleteId === c.id} onChange={() => decideAthlete(a.key, { action: 'existing', athleteId: c.id })} />
                            This is {c.name} <span className="text-muted-foreground">({classOf(c.graduationYear)})</span>
                          </label>
                        ))}
                        <label className="flex items-center gap-2">
                          <input type="radio" name={`ath-${a.key}`} checked={decisions.athletes[a.key]?.action === 'new'} onChange={() => decideAthlete(a.key, { action: 'new' })} />
                          Add as a new athlete
                        </label>
                      </fieldset>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {doubles.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-semibold">Two times at one meet ({doubles.length})</h3>
                <p className="text-muted-foreground">LeadPack keeps one result per athlete per race. The faster time is selected.</p>
                <ul className="space-y-2">
                  {doubles.map(({ athlete, cell, meetName }) => {
                    const key = pickKey(athlete.key, cell.meet, cell.distance);
                    return (
                      <li key={key} className="rounded-xl border p-3">
                        <p className="font-medium">
                          {athlete.name} <span className="font-normal text-muted-foreground">· {meetName}, {cell.distance}</span>
                        </p>
                        <div className="mt-1 flex flex-wrap gap-4">
                          {cell.alternatives?.map((t) => (
                            <label key={t} className="flex items-center gap-2">
                              <input type="radio" name={key} checked={cell.time === t} onChange={() => setPicks((p) => ({ ...p, [key]: t }))} />
                              {t}
                            </label>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {newAthletes.length > 0 && (
              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer font-medium">
                  {newAthletes.length} new athlete{newAthletes.length === 1 ? '' : 's'} will be added to the roster
                </summary>
                <p className="mt-1 text-muted-foreground">{newAthletes.map((a) => a.name).join(', ')}</p>
              </details>
            )}

            {summary && (
              <div className="space-y-1 rounded-xl bg-muted/50 p-3">
                <p className="font-medium">
                  {summary.newMeets} new meets · {summary.newRaces} new races · {summary.newResults} new results · {summary.changedResults} changed times ·{' '}
                  {summary.unchanged} unchanged{summary.needsReview > 0 ? ` · ${summary.needsReview} need a decision` : ''}
                </p>
                {summary.notInPaste > 0 && (
                  <p className="text-muted-foreground">
                    In LeadPack but not in this paste: {summary.notInPaste}. Nothing is deleted.
                  </p>
                )}
              </div>
            )}

            {saveError && (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={confirm} disabled={!canConfirm}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? 'Saving…' : summary && !plan.hasChanges ? 'Nothing new to save' : 'Confirm and save'}
              </Button>
              {summary && summary.needsReview > 0 && <span className="text-muted-foreground">Make a choice for each item above to continue.</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {done && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{done}</AlertDescription>
        </Alert>
      )}

      <details className="rounded-xl border p-3 text-sm">
        <summary className="flex cursor-pointer items-center gap-1 font-medium">
          <ChevronRight className="h-4 w-4" /> Having trouble?
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-muted-foreground">
            If copying the whole page doesn't work, there are two other ways to get your results grid in. They live here so the main steps above stay short.
          </p>
          <BrowserSeasonImportPanel season={season} onComplete={onComplete} />
        </div>
      </details>
    </div>
  );
}
