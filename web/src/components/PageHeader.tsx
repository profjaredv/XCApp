import React from 'react';
import type { ComponentType } from 'react';
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
  /** Buttons, filters — anything that belongs with the title. */
  actions?: React.ReactNode;
  className?: string;
}> = ({ section, icon: Icon, title, description, actions, className }) => {
  const accent = accentFor(section);

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
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
};

export default PageHeader;
