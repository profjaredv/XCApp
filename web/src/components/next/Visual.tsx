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
  to?: string;
  onClick?: () => void;
  tone?: string;
}> = ({ icon: Icon, label, to, onClick, tone = 'bg-primary/10 text-primary' }) => {
  const cls = 'flex min-w-0 flex-col items-center gap-1.5 rounded-2xl p-2 text-center hover:bg-accent';
  const body = (
    <>
      <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', tone)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="w-full truncate text-xs font-medium">{label}</span>
    </>
  );
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
};

/** One status line in a checklist: a state dot, what it is, its value, and its action. */
export const StatusRow: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  state: 'done' | 'warn' | 'todo';
  label: string;
  value: React.ReactNode;
  action?: React.ReactNode;
}> = ({ icon: Icon, state, label, value, action }) => (
  <div className="flex min-h-14 items-center gap-3 py-1.5">
    <span
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
        state === 'done' && 'bg-primary/15 text-primary',
        state === 'warn' && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
        state === 'todo' && 'bg-muted text-muted-foreground'
      )}
    >
      <Icon className="h-5 w-5" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
    {action}
  </div>
);

/** A small pill-shaped action for the end of a row. */
export const PillLink: React.FC<{ to?: string; onClick?: () => void; children: React.ReactNode; strong?: boolean }> = ({ to, onClick, children, strong }) => {
  const cls = cn(
    'inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold',
    strong ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-foreground hover:bg-accent'
  );
  return to ? (
    <Link to={to} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
};

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


/** The page's one dark-green hero surface. White text; put at most one white button inside. */
export const Hero: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <section
    className={cn(
      'relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-[oklch(0.3_0.09_160)] p-5 text-primary-foreground shadow-md',
      className
    )}
  >
    <div className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-white/[0.06]" />
    <div className="relative">{children}</div>
  </section>
);

/** A label over a big number, for stat rows. */
export const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }> = ({ label, value, sub, className }) => (
  <div className={cn('min-w-0 rounded-2xl bg-muted/60 p-3', className)}>
    <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="truncate text-2xl font-bold tabular-nums">{value}</p>
    {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
  </div>
);

/** A section heading outside a panel, with an optional link on the right. */
export const SectionHeading: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className="mb-2 flex items-center justify-between gap-2 px-1">
    <h2 className="text-sm font-semibold">{title}</h2>
    {action}
  </div>
);

/** Pill-style tabs. Renders a tablist; the page owns which tab is shown. */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none]', className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'min-h-10 flex-1 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors',
            value === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const AVATAR_TONES = [
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
];

/** Initials in a tinted circle; the tint is stable per name. */
export const Avatar: React.FC<{ name: string; size?: 'sm' | 'md' | 'lg'; className?: string }> = ({ name, size = 'md', className }) => {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' && 'h-8 w-8 text-xs',
        size === 'md' && 'h-10 w-10 text-sm',
        size === 'lg' && 'h-14 w-14 text-lg',
        AVATAR_TONES[h % AVATAR_TONES.length],
        className
      )}
    >
      {initials}
    </span>
  );
};
