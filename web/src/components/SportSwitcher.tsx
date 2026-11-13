import React from 'react';
import { cn } from '@/lib/utils';
import { SPORT_LABEL, SPORT_SHORT, type Sport } from '@/lib/sport';

const SPORTS: Sport[] = ['XC', 'TRACK'];

/** The top-level choice of sport. Everything in the nav below it follows. */
export const SportSwitcher: React.FC<{ sport: Sport; onChange: (s: Sport) => void; collapsed?: boolean; className?: string }> = ({
  sport,
  onChange,
  collapsed,
  className,
}) => (
  <div role="group" aria-label="Sport" className={cn('flex gap-1 rounded-lg bg-muted p-1', collapsed && 'flex-col', className)}>
    {SPORTS.map((s) => (
      <button
        key={s}
        type="button"
        aria-pressed={sport === s}
        title={SPORT_LABEL[s]}
        onClick={() => sport !== s && onChange(s)}
        className={cn(
          'min-h-9 flex-1 rounded-md px-2 text-xs font-semibold transition-colors',
          sport === s ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {collapsed ? SPORT_SHORT[s].slice(0, 2) : SPORT_LABEL[s]}
      </button>
    ))}
  </div>
);
