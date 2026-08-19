import type { AggregateSplitPattern } from '@/types/splits';

// Shared presentation for a SplitAnalysis.pattern badge — used by the
// coach's entry grid (SplitsEntryPage), the athlete-facing splits view
// (MyProgressPage), and the C10 pacing-aggregate summary (which adds a
// 'mixed' outcome for an exact tie across a distance bucket's races) — so
// none of them drift into describing the same values differently.
export const SPLIT_PATTERN_LABEL: Record<AggregateSplitPattern, string> = {
  negative: 'Negative split',
  even: 'Even split',
  positive: 'Positive split',
  mixed: 'Mixed',
};

export const SPLIT_PATTERN_BADGE_CLASS: Record<AggregateSplitPattern, string> = {
  negative: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  even: 'bg-muted text-muted-foreground border-border',
  positive: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  mixed: 'bg-sky-500/10 text-sky-700 border-sky-500/30',
};

// Splits are always whole seconds (see SplitCell's 4-digit MMSS entry) —
// deliberately not formatTime()'s tenths-of-a-second precision.
export function formatSplitMMSS(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return '';
  const mm = Math.floor(sec / 60);
  const ss = Math.round(sec % 60);
  return `${mm}:${String(ss).padStart(2, '0')}`;
}
