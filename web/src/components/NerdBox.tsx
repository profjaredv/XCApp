import React from 'react';
import { FlaskConical } from 'lucide-react';
import { useNerdMode } from '@/contexts/NerdModeContext';
import type { Explanation } from '@/lib/paceZones';

// The one way nerd mode shows its work. Renders nothing at all when the
// mode is off, so a caller can drop it in unconditionally and the normal
// view is untouched — no wrapper, no reserved space, no layout shift.
//
// Every explanation it renders was produced by the calculation itself (see
// the comment on NerdModeContext). This component only lays it out; it
// never restates or re-derives anything, which is what stops the panel and
// the number beside it from ever disagreeing.

export const NerdBox: React.FC<{ explain: Explanation | null | undefined }> = ({ explain }) => {
  const { enabled } = useNerdMode();
  if (!enabled || !explain) return null;

  return (
    <div className="mt-2 rounded-md border border-dashed border-primary/30 bg-primary/[0.03] p-2 text-xs">
      <p className="flex items-start gap-1.5 font-medium text-primary/90">
        <FlaskConical className="mt-0.5 h-3 w-3 flex-shrink-0" />
        <span>{explain.title}</span>
      </p>
      <ol className="mt-1.5 space-y-1.5">
        {explain.steps.map((step, i) => (
          <li key={i} className="border-l-2 border-primary/20 pl-2">
            <p className="text-muted-foreground">{step.label}</p>
            {step.formula && (
              <p className="font-mono text-[11px] text-muted-foreground/80">{step.formula}</p>
            )}
            {/* The substituted line is the one that does the convincing —
                it carries this athlete's own numbers, not symbols. It
                WRAPS rather than scrolling sideways: these panels sit in
                narrow cards, and a horizontally clipped equation reads as
                broken, with no affordance saying there is more. Wrapping
                at spaces keeps every token intact, and the strings are
                built with spaces around each operator so the breaks land
                somewhere sensible. */}
            <p className="whitespace-pre-wrap break-words font-mono text-[11px] text-foreground">
              {step.substituted}
              <span className="text-primary"> = {step.result}</span>
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-1.5 font-mono text-[10px] text-muted-foreground/70">{explain.source}</p>
    </div>
  );
};

/**
 * For a one-line note where a full step list would be too much — "n = 4
 * races", "excludes 2 with no split data". Same on/off rule.
 */
export const NerdNote: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { enabled } = useNerdMode();
  if (!enabled) return null;
  return (
    <p className="mt-1 flex items-start gap-1.5 font-mono text-[11px] text-primary/80">
      <FlaskConical className="mt-0.5 h-3 w-3 flex-shrink-0" />
      <span>{children}</span>
    </p>
  );
};

export default NerdBox;
