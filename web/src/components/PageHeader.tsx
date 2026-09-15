import React, { useState } from 'react';
import type { ComponentType } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { accentFor, type SectionKey } from '@/lib/sectionAccent';
import { cn } from '@/lib/utils';

// The block of colour at the top of a page.
//
// Every main screen used to open with black text on white, which made them
// indistinguishable at a glance and gave the app no character at all. This
// gives each one an identity: a filled tile carrying the section's icon, in
// the section's colour, on a soft wash of the same hue.
//
// The colour is never the only signal — the heading text is right beside
// it, always. That is what makes a six-colour palette safe for people who
// cannot separate two of the hues.

export const PageHeader: React.FC<{
  section: SectionKey;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** The one or two things a coach came to this page to do. Always visible. */
  actions?: React.ReactNode;
  /** Occasional setup actions — sync, import, merge. Inline from sm up;
   *  behind a "More" toggle on a phone, where four buttons at full size
   *  ate half the screen before the page content started. */
  secondaryActions?: React.ReactNode;
  className?: string;
}> = ({ section, icon: Icon, title, description, actions, secondaryActions, className }) => {
  const accent = accentFor(section);
  const [showMore, setShowMore] = useState(false);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border p-5 sm:p-6',
        accent.soft,
        className
      )}
    >
      {/* The rail reads as a spine down the left edge, and survives when
          the wash behind it is too subtle to notice. */}
      <div className={cn('absolute inset-y-0 left-0 w-1.5', accent.rail)} aria-hidden />

      <div className="flex flex-wrap items-start justify-between gap-4 pl-3">
        <div className="flex min-w-0 items-start gap-4">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg shadow-sm',
              accent.bg
            )}
            aria-hidden
          >
            <Icon className={cn('h-6 w-6', accent.on)} />
          </div>
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground sm:text-base">{description}</p>
            )}
          </div>
        </div>
        {/* shrink-0 with a fixed-width control inside was the original
            bug: a long action ("Sync from Athletic.net") ran off the right
            edge instead of wrapping. Buttons wrap at their natural width —
            NOT forced full width, which just traded an overflow for four
            stacked bars filling half a phone screen. */}
        {(actions || secondaryActions) && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 [&>*]:min-w-0">
            {actions}
            {secondaryActions && <span className="hidden sm:contents">{secondaryActions}</span>}
            {secondaryActions && (
              <Button
                variant="ghost"
                size="sm"
                className="sm:hidden"
                aria-expanded={showMore}
                onClick={() => setShowMore((v) => !v)}
              >
                {showMore ? 'Less' : 'More'}
                {showMore ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
              </Button>
            )}
          </div>
        )}
        {secondaryActions && showMore && (
          <div className="flex w-full flex-wrap gap-2 sm:hidden">{secondaryActions}</div>
        )}
      </div>
    </div>
  );
};

export default PageHeader;
