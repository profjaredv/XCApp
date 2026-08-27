import React from 'react';
import { Badge } from '@/components/ui/badge';
import { SPLIT_PATTERN_LABEL, SPLIT_PATTERN_BADGE_CLASS, formatSplitMMSS } from '@/lib/splitPatternDisplay';
import type { SplitsAggregateByDistance } from '@/types/splits';

// C10 (LeadPack Master Build Handoff follow-up): "how does this athlete
// typically pace themselves" — one block per distance bucket, shared
// between the athlete's own My Progress card and the coach-facing athlete
// profile so both read the exact same averages
// (backend/lib/splitAggregates.js, never recomputed here).

interface SplitsAggregateSummaryProps {
  aggregates: SplitsAggregateByDistance[];
}

export const SplitsAggregateSummary: React.FC<SplitsAggregateSummaryProps> = ({ aggregates }) => {
  if (aggregates.length === 0) {
    return <p className="text-sm text-muted-foreground">No races with splits entered yet.</p>;
  }

  return (
    <div className="space-y-4">
      {aggregates.map((bucket) => (
        <div key={bucket.distanceBucketMeters} className="rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold">
              {bucket.distanceLabel} splits{' '}
              <span className="font-normal text-muted-foreground">
                ({bucket.raceCount} race{bucket.raceCount === 1 ? '' : 's'})
              </span>
            </p>
            {bucket.pattern.predominant && (
              <Badge variant="outline" className={SPLIT_PATTERN_BADGE_CLASS[bucket.pattern.predominant]}>
                Typically {SPLIT_PATTERN_LABEL[bucket.pattern.predominant].toLowerCase()}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
            {bucket.segmentAverages.map((seg) => (
              <span key={seg.position}>
                {seg.label} avg: {formatSplitMMSS(seg.avgSegmentSec)}
                {seg.avgPaceSecPerMile != null ? ` (${formatSplitMMSS(seg.avgPaceSecPerMile)}/mi)` : ''}
                {/* Only when this position covers fewer races than the bucket —
                    a "Mile 3" that exists in one race out of four is not the
                    same claim as the bucket's headline race count, and with a
                    small sample that difference is the whole story. */}
                {seg.segmentRaceCount != null && seg.segmentRaceCount < bucket.raceCount
                  ? ` · ${seg.segmentRaceCount} of ${bucket.raceCount}`
                  : ''}
              </span>
            ))}
            {bucket.closingAverage && (
              <span>
                Final avg: {formatSplitMMSS(bucket.closingAverage.avgSegmentSec)}
                {bucket.closingAverage.avgPaceSecPerMile != null
                  ? ` (${formatSplitMMSS(bucket.closingAverage.avgPaceSecPerMile)}/mi)`
                  : ''}
              </span>
            )}
            {bucket.overallAveragePaceSecPerMile != null && (
              <span className="font-medium text-foreground">
                Avg pace: {formatSplitMMSS(bucket.overallAveragePaceSecPerMile)}/mi
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SplitsAggregateSummary;
