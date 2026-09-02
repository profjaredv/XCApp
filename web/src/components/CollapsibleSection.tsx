import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// A page section with a heading you can shut.
//
// Distinct from SettingsSection, which is a card: this wraps a heading and
// whatever was already under it, so a screen built out of grids and boards
// (Groups) can collapse its parts without every section becoming a card
// inside a card. Pair it with useExpandedSections to remember what a coach
// opened.

export const CollapsibleSection: React.FC<{
  id: string;
  title: string;
  /** A number worth seeing while the section is shut — "12". */
  count?: number;
  description?: string;
  open: boolean;
  onToggle: () => void;
  /** Controls that belong to the section, not to opening it (a filter, a button). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, title, count, description, open, onToggle, actions, children }) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-content`}
        className="group flex min-w-0 items-center gap-2 text-left"
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            !open && '-rotate-90'
          )}
        />
        <span className="truncate text-lg font-semibold group-hover:text-foreground/80">{title}</span>
        {count !== undefined && <Badge variant="secondary">{count}</Badge>}
      </button>
      {/* Actions stay reachable while the section is shut only if they
          make sense there; sections pass them in when they do. */}
      {actions}
    </div>
    {description && open && <p className="text-sm text-muted-foreground">{description}</p>}
    {open && <div id={`${id}-content`}>{children}</div>}
  </section>
);

export default CollapsibleSection;
