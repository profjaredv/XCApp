import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from './Sheet';

// One header rule for every next page (docs/leadpack-new-ui-trial.md
// §3.1): a title, at most one primary button, everything else behind ⋯.
export interface OverflowItem {
  label: string;
  to?: string;
  onClick?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

export const NextPageHeader: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  primary?: React.ReactNode;
  overflow?: OverflowItem[];
  /** Hide the primary below lg, when a page puts it in the sticky bar instead. */
  primaryDesktopOnly?: boolean;
}> = ({ title, subtitle, primary, overflow = [], primaryDesktopOnly }) => {
  const [open, setOpen] = useState(false);
  const row = 'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-accent disabled:opacity-50';
  return (
    <div className="mb-4 flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-bold">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {primary && <div className={cn('shrink-0', primaryDesktopOnly && 'hidden lg:block')}>{primary}</div>}
      {overflow.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="More actions"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-accent lg:h-10 lg:w-10"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent title={title}>
              {overflow.map((item) => {
                const Icon = item.icon;
                const content = (
                  <>
                    {Icon && <Icon className="h-5 w-5" />}
                    {item.label}
                  </>
                );
                return item.to ? (
                  <Link key={item.label} to={item.to} onClick={() => setOpen(false)} className={row}>
                    {content}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      item.onClick?.();
                    }}
                    className={row}
                  >
                    {content}
                  </button>
                );
              })}
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
};

/**
 * The thumb-zone bar (§3.2): the page's constant action, pinned just above
 * the tab bar on a phone. Hidden from lg up, where the action sits in the
 * header instead.
 */
export const StickyActionBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>
    {/* Room for the bar, so the page's last row isn't hidden under it. */}
    <div className="h-20 lg:hidden" aria-hidden />
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-20 border-t border-border bg-background/95 px-3 py-2 backdrop-blur lg:hidden">
      {children}
    </div>
  </>
);

/** A whole-row link, 48px+, for lists — no button inside the row. */
export const RowLink: React.FC<{ to: string; className?: string; children: React.ReactNode }> = ({ to, className, children }) => (
  <Link to={to} className={cn('flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent', className)}>
    {children}
  </Link>
);
