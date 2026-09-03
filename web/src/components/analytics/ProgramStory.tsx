import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BookOpen, ChevronDown } from 'lucide-react';
import type { ProgramStoryBeat } from '@/hooks/useProgramAnalytics';

// Story mode: the Program screen's charts, read out loud.
//
// A coach opening this in November isn't trying to read four charts
// against each other — they're trying to answer "did this year go well,
// and is the program going anywhere". The charts below hold the evidence;
// this is the reading of it.
//
// Every sentence is computed on the server from the same numbers those
// charts draw (backend/lib/programStory.js) — deterministic rules, no
// generation, nothing inferred, and nothing about any athlete leaving the
// server to produce it. That is also why each beat can show its own
// working: the number under the sentence is one tap away.

const KIND_STYLE: Record<ProgramStoryBeat['kind'], { label: string; dot: string }> = {
  growth: { label: 'Turnout', dot: 'bg-chart-1' },
  retention: { label: 'Staying', dot: 'bg-chart-2' },
  speed: { label: 'Speed', dot: 'bg-chart-3' },
  depth: { label: 'Depth', dot: 'bg-chart-4' },
  gap: { label: 'Not yet known', dot: 'bg-muted-foreground' },
};

const EVIDENCE_LABELS: Record<string, string> = {
  rosterSize: 'roster',
  previousSize: 'previous season',
  seasonsOnFile: 'seasons on file',
  racedCount: 'raced',
  racedShare: '% of roster racing',
  meets: 'meets',
  returning: 'returning',
  newcomers: 'new',
  returnRate: '% returning',
  window: 'years after joining',
  retentionPercent: '% retained',
  cohortSize: 'athletes in cohort',
  leftCensored: 'first seen in earliest season',
  season: 'season',
  paceSecPerMile: 'median pace (sec/mi)',
  previousSeason: 'compared with',
  previousPaceSecPerMile: 'their pace (sec/mi)',
  changeSec: 'change (sec/mi)',
  athleteCount: 'athletes',
  spreadSec: 'spread (sec)',
  raceName: 'race',
  seasons: 'seasons',
};

const Beat: React.FC<{ beat: ProgramStoryBeat }> = ({ beat }) => {
  const [showEvidence, setShowEvidence] = useState(false);
  const style = KIND_STYLE[beat.kind] ?? KIND_STYLE.gap;
  const evidence = Object.entries(beat.evidence ?? {}).filter(([, v]) => v !== null && v !== undefined);

  return (
    <div className="flex gap-3 py-3">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', style.dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn('font-medium', beat.kind === 'gap' && 'text-muted-foreground')}>{beat.headline}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{beat.detail}</p>
        {evidence.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowEvidence((v) => !v)}
              aria-expanded={showEvidence}
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn('h-3 w-3 transition-transform', showEvidence && 'rotate-180')} />
              {showEvidence ? 'Hide the numbers' : 'Show the numbers'}
            </button>
            {showEvidence && (
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
                {evidence.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2">
                    <dt className="truncate text-muted-foreground">{EVIDENCE_LABELS[key] ?? key}</dt>
                    <dd className="tabular-nums">{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const ProgramStory: React.FC<{ story: ProgramStoryBeat[] }> = ({ story }) => {
  // Gaps last and folded away: what the app doesn't know matters, but it
  // shouldn't be the first thing a coach reads about their own program.
  const [showGaps, setShowGaps] = useState(false);
  const findings = story.filter((b) => b.kind !== 'gap');
  const gaps = story.filter((b) => b.kind === 'gap');

  if (story.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BookOpen className="h-5 w-5" />
          What the numbers say
        </CardTitle>
        <CardDescription>
          Read from the same figures the charts below draw. Every line shows its working.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {findings.map((beat) => (
            <Beat key={beat.id} beat={beat} />
          ))}
        </div>

        {gaps.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setShowGaps((v) => !v)}>
              <ChevronDown className={cn('mr-1 h-4 w-4 transition-transform', showGaps && 'rotate-180')} />
              {gaps.length} thing{gaps.length === 1 ? '' : 's'} the app can't tell you yet
            </Button>
            {showGaps && (
              <div className="divide-y">
                {gaps.map((beat) => (
                  <Beat key={beat.id} beat={beat} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProgramStory;
