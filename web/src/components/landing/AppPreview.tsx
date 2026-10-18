import React from 'react';
import { CalendarDays, CheckCircle2, ChevronRight, Flag } from 'lucide-react';
import { SEASON } from './exampleData';

// A picture of the product for the top of the public page: the Today screen a
// coach opens in the morning. Drawn from the same tokens as the real app (so
// it follows light/dark), with invented numbers, and hidden from assistive
// tech because it is decoration for the headline above it.

function Sparkline() {
  const w = 220;
  const h = 56;
  const min = Math.min(...SEASON.map((p) => p.pace));
  const max = Math.max(...SEASON.map((p) => p.pace));
  const pts = SEASON.map((p, i) => [(i / (SEASON.length - 1)) * (w - 8) + 4, 4 + ((p.pace - min) / (max - min)) * (h - 8)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" role="presentation">
      <polygon points={`4,${h} ${line} ${w - 4},${h}`} fill="var(--chart-1)" fillOpacity="0.12" />
      <polyline points={line} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="4" fill="var(--card)" stroke="var(--chart-1)" strokeWidth="2" />
    </svg>
  );
}

export const AppPreview: React.FC = () => (
  <div aria-hidden="true" className="mx-auto mt-14 w-full max-w-4xl text-left">
    <div className="overflow-hidden rounded-3xl border bg-card shadow-xl ring-1 ring-border/60">
      {/* window bar */}
      <div className="flex items-center gap-2 border-b bg-muted/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="ml-3 text-xs font-medium text-muted-foreground">LeadPack XC · Today</span>
      </div>
      <div className="grid gap-4 bg-background p-4 sm:grid-cols-5 sm:p-6">
        {/* practice hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-[var(--hero-end)] p-5 text-primary-foreground sm:col-span-3">
          <p className="text-xs font-medium uppercase tracking-wider opacity-70">Practice today</p>
          <p className="mt-1 text-4xl font-bold tabular-nums leading-none">
            31<span className="text-xl font-semibold opacity-60"> / 36</span>
          </p>
          <p className="mt-1 text-sm opacity-80">checked in across 4 groups</p>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">6 mi steady · Riverside Trail · 3:30 pm</span>
            <ChevronRight className="h-4 w-4 opacity-70" />
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-primary">
            <CheckCircle2 className="h-4 w-4" /> Take attendance
          </div>
        </div>
        {/* right column */}
        <div className="grid gap-4 sm:col-span-2">
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next meet</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
                <span className="text-[10px] font-semibold leading-none">OCT</span>
                <span className="text-lg font-bold leading-none">24</span>
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 truncate text-sm font-semibold"><Flag className="h-3.5 w-3.5 shrink-0" /> League Championship</span>
                <span className="block truncate text-xs text-muted-foreground">Home · 3 days</span>
              </span>
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team pace this season</p>
            <Sparkline />
            <p className="text-xs text-muted-foreground">0:36 per mile faster since September</p>
          </div>
        </div>
      </div>
    </div>
    <p className="mt-3 text-center text-xs text-muted-foreground">Example screen with made-up numbers.</p>
  </div>
);
