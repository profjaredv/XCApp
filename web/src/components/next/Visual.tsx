import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

// Visual building blocks for the next shell: a progress ring, a calendar
// date tile, an icon quick-action tile and a hero card. They give pages a
// number or a shape to read first instead of a stack of text rows.

export const ProgressRing: React.FC<{
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  /** Ring colors; defaults suit a card surface. */
  trackClassName?: string;
  barClassName?: string;
  children?: React.ReactNode;
  label: string;
}> = ({ value, max, size = 56, stroke = 6, trackClassName = 'stroke-muted', barClassName = 'stroke-primary', children, label }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={trackClassName} />
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            className={cn('transition-[stroke-dasharray] duration-500', barClassName)}
          />
        )}
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
};

export const DateTile: React.FC<{ date: string; className?: string }> = ({ date, className }) => {
  const d = new Date(date);
  const month = d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }).toUpperCase();
  const day = d.toLocaleDateString(undefined, { day: 'numeric', timeZone: 'UTC' });
  return (
    <div className={cn('flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary/10 text-primary', className)}>
      <span className="text-[10px] font-semibold tracking-wider">{month}</span>
      <span className="text-xl font-bold leading-none">{day}</span>
    </div>
  );
};

export const QuickAction: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  to: string;
  tone?: string;
}> = ({ icon: Icon, label, to, tone = 'bg-primary/10 text-primary' }) => (
  <Link to={to} className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl p-2 text-center hover:bg-accent">
    <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', tone)}>
      <Icon className="h-5 w-5" />
    </span>
    <span className="w-full truncate text-xs font-medium">{label}</span>
  </Link>
);

/** A rounded surface with a section label, used instead of Card on next pages. */
export const Panel: React.FC<{ title?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  title,
  action,
  className,
  children,
}) => (
  <section className={cn('min-w-0 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border/60', className)}>
    {(title || action) && (
      <div className="mb-3 flex items-center justify-between gap-2">
        {title && <h2 className="text-sm font-semibold">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </section>
);

