import React from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

// The sticky top bar shared by every "field screen" — the full-screen,
// standalone routes a coach actually works from on a phone at practice or
// a meet (attendance, splits, interval sessions). Codifies the pattern
// IntervalSessionManagePage arrived at on its own: below `sm`, actions
// collapse to icon-only so the title keeps its room instead of truncating
// to "5x…" behind four full-text buttons.
//
// Two rules the ad-hoc versions of this kept getting wrong, fixed once
// here: an icon-only tap target is 40px on mobile (`size="sm"` is 32px —
// under every platform's minimum, and these get tapped with a thumb while
// holding a stopwatch), and the bar is translucent-blurred rather than
// opaque so a scrolled grid reads as continuing underneath it instead of
// being clipped.

export interface FieldAction {
  icon: LucideIcon;
  /** Shown as text from `sm` up, and always as the tooltip/aria-label. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
}

export const FieldHeader: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  actions?: FieldAction[];
  /** Optional second row — a pill selector, an offline warning, a filter. */
  children?: React.ReactNode;
}> = ({ title, subtitle, actions = [], children }) => (
  <div className="print:hidden sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
    <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-6 sm:py-3">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold leading-tight sm:text-lg">{title}</h1>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {actions.map(({ icon: Icon, label, onClick, disabled, busy, variant = 'outline' }) => (
          <Button
            key={label}
            variant={variant}
            size="sm"
            onClick={onClick}
            disabled={disabled || busy}
            title={label}
            aria-label={label}
            className="h-11 w-11 p-0 sm:h-8 sm:w-auto sm:px-3"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" /> : <Icon className="h-4 w-4 sm:mr-1" />}
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}
      </div>
    </div>
    {children}
  </div>
);

export default FieldHeader;
