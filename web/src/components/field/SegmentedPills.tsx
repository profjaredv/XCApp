import React from 'react';

// "Which one am I working on right now" — the selector that lets a dense
// grid show a single column at a time on a phone instead of scrolling
// sideways through six of them. IntervalSessionManagePage proved the
// pattern with its active-rep row; this generalizes it so the splits grid
// (markers) and the attendance week (weekdays) get the same control
// instead of three slightly different hand-rolled ones.
//
// Sized for a thumb, not a mouse: 44px minimum on mobile, which is the
// floor every mobile platform's guidance lands on and roughly what these
// were all violating before (28px circles).
//
// Wraps rather than scrolling horizontally. The first pass scrolled with a
// hidden scrollbar, and a 375px screenshot showed the last pill (Friday, on
// the weekday row) clipped at the edge with no affordance suggesting it was
// reachable — a coach would simply never find Friday. These sets are small
// and bounded (5 weekdays, ~6 markers, 4-5 grades), so a second line costs
// one row of height and guarantees everything is visible.

export interface Segment {
  value: string;
  /** The main text — a weekday, a rep number, a marker name. */
  label: string;
  /** Optional second line: a date, a distance. */
  sublabel?: string;
  /** Optional trailing count, e.g. how many athletes are already marked. */
  badge?: number | string;
}

export const SegmentedPills: React.FC<{
  segments: Segment[];
  value: string;
  onChange: (value: string) => void;
  /** Small leading caption, e.g. "Active rep". */
  caption?: string;
  /**
   * Share the row's width equally between segments instead of sizing each
   * to its label. For a fixed, meaningful set — the five weekdays — equal
   * columns read as one strip and keep all five on a single line at 375px,
   * where natural widths wrapped the last one onto a lonely second row.
   */
  equal?: boolean;
  className?: string;
}> = ({ segments, value, onChange, caption, equal = false, className = '' }) => (
  <div className={`flex items-start gap-2 ${className}`}>
    {caption && (
      <span className="shrink-0 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:pt-2.5">
        {caption}
      </span>
    )}
    <div className="flex flex-1 flex-wrap gap-1.5">
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            onClick={() => onChange(segment.value)}
            aria-pressed={active}
            className={`flex min-h-11 min-w-11 flex-col items-center justify-center rounded-lg border py-1.5 text-sm font-medium leading-tight transition-colors sm:min-h-9 ${
              // Equal columns are a narrow-screen device only — stretched
              // across a laptop they'd make a "Sr 2" pill 350px wide.
              equal ? 'flex-1 basis-0 px-1 sm:flex-none sm:basis-auto sm:px-3' : 'shrink-0 px-3'
            } ${
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-accent'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {segment.label}
              {segment.badge !== undefined && (
                <span
                  className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                    active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {segment.badge}
                </span>
              )}
            </span>
            {segment.sublabel && (
              <span className={`text-[10px] font-normal tabular-nums ${active ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                {segment.sublabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);

export default SegmentedPills;
