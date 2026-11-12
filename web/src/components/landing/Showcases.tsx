import React from 'react';
import { Check, Footprints, Tag, Timer, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

// Pictures of the four things on the public page that deserve one. Drawn in
// theme tokens with invented names and numbers, like AppPreview next to
// them: no screenshots to go stale, no real athlete anywhere near a public
// page, and they follow light and dark on their own. Decoration for the copy
// beside them, so hidden from assistive tech.

const Frame: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div aria-hidden="true" className={cn('overflow-hidden rounded-3xl border bg-card shadow-xl ring-1 ring-border/60', className)}>
    <div className="flex items-center gap-2 border-b bg-muted/60 px-4 py-2.5">
      <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
      <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
      <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
      <span className="ml-3 truncate text-xs font-medium text-muted-foreground">{title}</span>
    </div>
    <div className="bg-background p-4 sm:p-5">{children}</div>
  </div>
);

/** A stand-in for a photo: a tinted tile with a horizon, never a real picture. */
const PhotoTile: React.FC<{ tone: 1 | 2 | 3 | 4 | 5; className?: string; children?: React.ReactNode }> = ({ tone, className, children }) => (
  <div
    className={cn('relative overflow-hidden rounded-lg', className)}
    style={{ background: `linear-gradient(160deg, color-mix(in oklch, var(--chart-${tone}) 55%, transparent), color-mix(in oklch, var(--chart-${tone}) 18%, transparent))` }}
  >
    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-foreground/10" />
    <div className="absolute bottom-[22%] left-1/2 h-[38%] w-[16%] -translate-x-1/2 rounded-full bg-foreground/25" />
    {children}
  </div>
);

const NameChip: React.FC<{ children: React.ReactNode; on?: boolean }> = ({ children, on }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
      on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
    )}
  >
    {on && <Check className="h-2.5 w-2.5" />}
    {children}
  </span>
);

/** Photos: tag a meet on the left, the collage it becomes on the right. */
export const PhotosShowcase: React.FC = () => (
  <Frame title="LeadPack Photos · League Championship">
    <div className="grid gap-4 sm:grid-cols-5">
      <div className="sm:col-span-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <Tag className="h-3 w-3" /> Tag
          </span>
          <span>212 of 240 tagged</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {([1, 3, 2, 5, 4, 1, 3, 2] as const).map((tone, i) => (
            <PhotoTile key={i} tone={tone} className={cn('aspect-square', i === 5 && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}>
              {i !== 3 && i !== 6 && (
                <span className="absolute left-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
            </PhotoTile>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <NameChip on>Maya R.</NameChip>
          <NameChip>Jonah P.</NameChip>
          <NameChip>Ava L.</NameChip>
          <NameChip>Eli S.</NameChip>
          <NameChip>+32</NameChip>
        </div>
      </div>
      {/* the collage page */}
      <div className="sm:col-span-2">
        <div className="mx-auto aspect-[17/22] w-full max-w-[11rem] rounded-md border bg-card p-2 shadow-md">
          <div className="h-2 w-2/3 rounded-full bg-primary" />
          <div className="mt-1 h-1.5 w-1/3 rounded-full bg-muted-foreground/30" />
          <PhotoTile tone={1} className="mx-auto mt-2 aspect-square w-3/5 !rounded-full ring-2 ring-primary" />
          <div className="mt-2 grid grid-cols-4 gap-1">
            {([3, 2, 5, 4] as const).map((tone) => (
              <PhotoTile key={tone} tone={tone} className="aspect-[3/4] !rounded-sm" />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1 text-center">
            {[
              ['19:42', 'PR'],
              ['−1:08', 'Season'],
              ['9', 'Races'],
            ].map(([v, l]) => (
              <div key={l} className="rounded-sm bg-muted/70 py-0.5">
                <div className="text-[9px] font-bold leading-tight tabular-nums">{v}</div>
                <div className="text-[6px] uppercase leading-tight text-muted-foreground">{l}</div>
              </div>
            ))}
          </div>
          <svg viewBox="0 0 100 22" className="mt-1.5 w-full" role="presentation">
            <polyline points="2,4 18,7 34,6 50,11 66,13 82,17 98,19" fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">One page per runner. Print-ready PDF.</p>
      </div>
    </div>
  </Frame>
);

/** Footsteps: grey alumni paths, the athlete's own, and the dashed projection. Faster sits lower. */
export const FootstepsShowcase: React.FC = () => {
  // y: lower on the chart = faster. Four grades across.
  const x = [30, 120, 210, 300];
  const alumni = [
    [22, 44, 66, 82],
    [30, 46, 58, 70],
    [18, 40, 70, 92],
    [26, 38, 52, 74],
  ];
  const pts = (ys: number[], n = ys.length) => ys.slice(0, n).map((y, i) => `${x[i]},${y}`).join(' ');
  return (
    <Frame title="Journey · Footsteps">
      <p className="text-sm">
        <span className="font-semibold">6 runners</span> from this program ran within 16s per mile of Maya as a sophomore.
      </p>
      <div className="mt-3 rounded-xl bg-primary/5 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">In their footsteps, by senior year</p>
        <p className="mt-1 text-4xl font-bold tabular-nums leading-none">19:05</p>
        <p className="mt-1.5 text-xs text-muted-foreground">Now 20:49. Those runners ran between 18:20 and 19:40. Based on 5 runners.</p>
      </div>
      <svg viewBox="0 0 330 120" className="mt-3 w-full" role="presentation">
        {[20, 50, 80].map((y) => (
          <line key={y} x1="20" x2="310" y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 4" />
        ))}
        {alumni.map((ys, i) => (
          <polyline key={i} points={pts(ys)} fill="none" stroke="var(--muted-foreground)" strokeOpacity="0.45" strokeWidth="1.5" strokeLinejoin="round" />
        ))}
        <polyline points={`${x[1]},42 ${x[2]},60 ${x[3]},78`} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round" />
        <polyline points={`${x[0]},24 ${x[1]},42`} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
        <circle cx={x[0]} cy="24" r="4" fill="var(--card)" stroke="var(--primary)" strokeWidth="2.5" />
        <circle cx={x[1]} cy="42" r="4" fill="var(--card)" stroke="var(--primary)" strokeWidth="2.5" />
        <circle cx={x[3]} cy="78" r="3.5" fill="var(--primary)" />
        {['Fr', 'So', 'Jr', 'Sr'].map((g, i) => (
          <text key={g} x={x[i]} y="114" textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
            {g}
          </text>
        ))}
      </svg>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Footprints className="h-3 w-3" /> Faster is lower. Grey lines are past runners.
      </p>
    </Frame>
  );
};

/** Meet day: the live timer beside the team score it produces. */
export const MeetDayShowcase: React.FC = () => (
  <Frame title="Meets · League Championship · Varsity Girls">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-[var(--hero-end)] p-4 text-primary-foreground">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider opacity-70">
          <Timer className="h-3 w-3" /> Live timer
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums leading-none">12:41.3</p>
        <div className="mt-3 space-y-1.5 text-xs">
          {[
            ['Maya R.', 'Mile 2', '12:38', '−0:06'],
            ['Ava L.', 'Mile 2', '12:40', '−0:02'],
            ['Zoe K.', 'Mile 2', '—', ''],
          ].map(([name, mark, split, delta]) => (
            <div key={name} className="flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
              <span className="opacity-70">{mark}</span>
              <span className="w-10 text-right tabular-nums">{split}</span>
              <span className="w-9 text-right tabular-nums opacity-80">{delta}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Trophy className="h-3 w-3" /> Team scores
        </p>
        <ul className="mt-2 space-y-1.5 text-sm">
          {[
            ['1', 'Your team', '41', true],
            ['2', 'Ridgeview', '47', false],
            ['3', 'Cedar Valley', '68', false],
            ['4', 'North Fork', '92', false],
          ].map(([place, team, score, us]) => (
            <li key={String(team)} className={cn('flex items-center gap-2 rounded-lg px-2.5 py-1.5', us ? 'bg-primary/10 font-semibold' : '')}>
              <span className="w-4 tabular-nums text-muted-foreground">{place}</span>
              <span className="min-w-0 flex-1 truncate">{team}</span>
              <span className="tabular-nums">{score}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">1–5 spread 0:48 · 3 PRs</p>
      </div>
    </div>
  </Frame>
);

/** The daily loop: attendance by group and the paces each runner gets. */
export const PracticeShowcase: React.FC = () => (
  <Frame title="Groups · Varsity Girls · Tuesday">
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Attendance</p>
        <ul className="mt-2 space-y-1.5 text-sm">
          {[
            ['Maya R.', 'here'],
            ['Ava L.', 'here'],
            ['Zoe K.', 'late'],
            ['Nora B.', 'out'],
          ].map(([name, state]) => (
            <li key={name} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                  state === 'here' && 'bg-primary text-primary-foreground',
                  state === 'late' && 'bg-[var(--chart-2)]/25 text-foreground',
                  state === 'out' && 'bg-muted text-muted-foreground'
                )}
              >
                {state === 'here' ? <Check className="h-3 w-3" /> : state === 'late' ? 'L' : '–'}
              </span>
              <span className="min-w-0 flex-1 truncate">{name}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Today: 5 × 1K at threshold</p>
        <ul className="mt-2 space-y-1.5 text-sm">
          {[
            ['Maya R.', '3:58'],
            ['Ava L.', '4:02'],
            ['Zoe K.', '4:09'],
            ['Nora B.', '4:15'],
          ].map(([name, pace]) => (
            <li key={name} className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-2.5 py-1">
              <span className="min-w-0 truncate">{name}</span>
              <span className="font-semibold tabular-nums">{pace}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">Paces from each runner’s own races.</p>
      </div>
    </div>
  </Frame>
);
