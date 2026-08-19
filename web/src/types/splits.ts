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
}

// What the entry grid sends per cell/row edit.
export interface SplitEntryInput {
  sequence: number;
  elapsedSec: number;
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
}

export interface BatchSplitResponse {
  success: boolean;
  entriesSaved: number;
  flags: BatchSplitFlag[];
  results: BatchSplitResultRow[];
}
