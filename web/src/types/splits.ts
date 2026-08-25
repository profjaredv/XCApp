// C8 (LeadPack Master Build Handoff): rewritten against the marker-based
// Split model. The old shape declared twoMileTime: number, which never
// existed in the schema and was permanently undefined, plus a
// SplitAnalysis hardcoded to exactly three miles. Everything here matches
// backend/routes/splits.js's buildRaceView / lib/splitMath.js output.

export type SplitMarkerScheme = 'MILE' | 'KM' | 'CUSTOM';

export interface SplitMarker {
  sequence: number;
  markerMeters: number;
  label: string;
}

export interface AthleteSplitValue {
  id: string;
  sequence: number;
  elapsedSec: number;
  label: string;
}

export interface DerivedSegment {
  sequence: number;
  fromMeters: number;
  toMeters: number;
  distanceMeters: number;
  segmentSec: number;
  paceSecPerMile: number | null;
  isClosing: boolean;
}

export type SplitPattern = 'negative' | 'even' | 'positive';

export interface SplitAnalysis {
  firstHalfSec: number;
  secondHalfSec: number;
  differentialSec: number;
  pattern: SplitPattern;
  segmentPaces: number[];
}

export interface PreviousSameDistanceComparison {
  raceId: string;
  raceName: string;
  date: string;
  finishSec: number;
  deltaSec: number; // negative = faster than that previous race
}

export interface RaceSplitRow {
  resultId: string;
  athleteId: string;
  athleteName: string;
  gender: string | null;
  place: number | null;
  finishSec: number | null;
  splits: AthleteSplitValue[];
  segments: DerivedSegment[];
  analysis: SplitAnalysis | null;
  overallPaceSecPerMile: number | null;
  previousSameDistance: PreviousSameDistanceComparison | null;
}

export interface RaceSplitsView {
  raceId: string;
  raceName: string;
  distanceMeters: number | null;
  splitMarkerScheme: SplitMarkerScheme | null;
  splitMarkersMeters: number[];
  markers: SplitMarker[];
  results: RaceSplitRow[];
}

export interface AthleteSplitHistoryRow {
  resultId: string;
  raceId: string;
  raceName: string;
  date: string;
  distanceMeters: number | null;
  finishSec: number | null;
  segments: DerivedSegment[];
  analysis: SplitAnalysis | null;
  overallPaceSecPerMile: number | null;
}

// What the entry grid sends per cell/row edit. Only sequences actually
// being changed belong here — anything else for that resultId is left
// untouched server-side, never inferred as "should be deleted" (see
// backend/routes/splits.js POST /batch's header comment). elapsedSec:
// null clears that one sequence.
export interface SplitEntryInput {
  sequence: number;
  elapsedSec: number | null;
}

export interface BatchSplitEntry {
  resultId: string;
  splits: SplitEntryInput[];
}

export interface BatchSplitFlag {
  resultId: string;
  sequence: number;
  reason: string;
}

export interface BatchSplitResultRow {
  resultId: string;
  splits: SplitEntryInput[];
  segments: DerivedSegment[];
  analysis: SplitAnalysis | null;
  overallPaceSecPerMile: number | null;
}

export interface BatchSplitResponse {
  success: boolean;
  entriesSaved: number;
  flags: BatchSplitFlag[];
  results: BatchSplitResultRow[];
}

// C10: "how does this athlete typically pace themselves" — averaged per
// distance bucket by backend/lib/splitAggregates.js, never mixing a 5K
// with an 8K.
export interface SegmentAverage {
  position: number;
  label: string;
  avgSegmentSec: number | null;
  avgPaceSecPerMile: number | null;
  raceCount: number;
}

export interface ClosingSegmentAverage {
  avgSegmentSec: number | null;
  avgPaceSecPerMile: number | null;
  raceCount: number;
}

export type AggregateSplitPattern = SplitPattern | 'mixed';

export interface SplitsAggregateByDistance {
  distanceBucketMeters: number;
  distanceLabel: string;
  raceCount: number;
  segmentAverages: SegmentAverage[];
  closingAverage: ClosingSegmentAverage | null;
  overallAveragePaceSecPerMile: number | null;
  pattern: {
    predominant: AggregateSplitPattern | null;
    counts: { negative: number; even: number; positive: number };
  };
}

export interface AthleteSplitsAggregateResponse {
  athleteId: string;
  aggregates: SplitsAggregateByDistance[];
}
