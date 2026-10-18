import { Link } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  Palette,
  Upload,
  PencilLine,
  X,
  Flag,
  GraduationCap,
  Lock,
  School,
  ShieldCheck,
  Target,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { accentFor, type SectionKey } from '@/lib/sectionAccent';
import { cn } from '@/lib/utils';
import { AppPreview } from '@/components/landing/AppPreview';

// Recharts is the heavy part of this page; it loads after the first paint.
const ExampleCharts = lazy(() => import('@/components/landing/ExampleCharts'));

// The public landing page.
//
// Written entirely in theme tokens. The previous version mixed hardcoded
// slate/white with shadcn's Card, and in dark mode the two disagreed:
// cards went near-black while the page gradient stayed light, headings
// went near-white on a white background, and body copy stayed mid-grey on
// both. Every screen was a different half-broken combination.
//
// Two rules keep that from coming back:
//   1. No hardcoded colours at all. The one band that is deliberately dark
//      in both themes uses the `ink` tokens, which are defined identically
//      in light and dark so they cannot flip — and are in the brand's own
//      hue, unlike Tailwind's blue-tinted slate.
//   2. No shadcn Card on this page. Card follows the theme; a section that
//      does not would fight it. Plain divs with token colours instead.
//
// Claims are specific and checkable rather than badges — the Department of
// Education's own privacy office names "FERPA compliant" as a line to be
// skeptical of, and the people who evaluate this have been trained to
// discount it. See src/content/dataPolicy.ts.

const AUDIENCES: Array<{
  icon: typeof School;
  title: string;
  body: string;
  section: SectionKey;
}> = [
  {
    icon: School,
    title: 'High school',
    body: 'Class years, JV and varsity, parent access, and four years of history per athlete. We sign your district’s data privacy agreement.',
    section: 'season',
  },
  {
    icon: GraduationCap,
    title: 'College',
    body: 'Big rosters, training groups with their own assistants, and multi-year progression.',
    section: 'athletes',
  },
  {
    icon: Flag,
    title: 'Club',
    body: 'Mixed ages and schools, volunteer coaches with limited access, and meet logistics.',
    section: 'meets',
  },
];

const PAIN: string[] = [
  'Roster in one file, results in another, the latest version in an email.',
  'Attendance on paper, then retyped. Or not.',
  'Meet entries rebuilt every weekend.',
  'Paces worked out by hand.',
  'Last season’s results on a laptop that’s gone.',
  'An assistant who needs the sheet, and now sees all of it.',
];

const COMPARE: Array<{ job: string; sheet: string; app: string }> = [
  { job: 'Roster', sheet: 'Retyped every August', app: 'Built once, rolls over' },
  { job: 'Attendance', sheet: 'A column nobody trusts', app: 'Taken on your phone, by group' },
  { job: 'Results', sheet: 'Pasted into tabs, broken formulas', app: 'Paste or upload; every season kept' },
  { job: 'Workout paces', sheet: 'Calculated by hand', app: 'From each athlete’s own races' },
  { job: 'Meet day', sheet: 'A new sheet every weekend', app: 'Entries, heats, timer, scoring' },
  { job: 'Who’s improving', sheet: 'A chart you built once', app: 'Pack spread, progress, who’s stalled' },
  { job: 'Access', sheet: 'Everyone sees everything', app: 'Assistants see only their groups' },
  { job: 'Athletes', sheet: 'Not in the sheet', app: 'Their own private log and goals' },
];

const INTAKE: Array<{ icon: typeof Upload; title: string; body: string }> = [
  { icon: ClipboardPaste, title: 'Paste', body: 'Copy results from the page you’re looking at. Preview before anything saves.' },
  { icon: Upload, title: 'Upload', body: 'A CSV or spreadsheet you already have. Template included.' },
  { icon: PencilLine, title: 'Type', body: 'Enter a race, time or athlete by hand.' },
];

const FEATURES: Array<{
  icon: typeof ClipboardList;
  title: string;
  body: string;
  section: SectionKey;
}> = [
  {
    icon: ClipboardList,
    title: 'A roster that carries forward',
    body: 'Build it once. Class years roll over and seniors retire themselves.',
    section: 'athletes',
  },
  {
    icon: CalendarDays,
    title: 'Attendance & practice plans',
    body: 'Take attendance at the trailhead. Plan practices and assign workouts by group.',
    section: 'groups',
  },
  {
    icon: Timer,
    title: 'Workouts in your language',
    body: 'Define Threshold and VO2 your way. Paces come from each athlete’s own races.',
    section: 'training',
  },
  {
    icon: BarChart3,
    title: 'Meet day, handled',
    body: 'Entries, heats, a live timer, and team scoring.',
    section: 'meets',
  },
  {
    icon: TrendingUp,
    title: 'Analytics that answer',
    body: 'Who’s improving, who’s stalled, how tight the pack is, across every season.',
    section: 'program',
  },
  {
    icon: Palette,
    title: 'Looks like your team',
    body: 'Set your colors once. The app and your exports wear them.',
    section: 'season',
  },
];

const TRUST = [
  {
    icon: ClipboardPaste,
    title: 'You bring the results',
    body: 'Everything comes from what you paste, upload or type. No logging in as you. No pulling in the background.',
  },
  {
    icon: Lock,
    title: 'Nothing is public',
    body: 'No public profiles or rosters. Every screen needs a sign-in and a team.',
  },
  {
    icon: ShieldCheck,
    title: 'We sign your district’s agreement',
    body: 'Built to work as a school official under your agreement or the standard NDPA, with a full inventory of the student data we store.',
  },
  {
    icon: Users,
    title: 'Athletes own their writing',
    body: 'Training logs are private until the athlete shares them, and she can see exactly who sees what.',
  },
  {
    icon: Download,
    title: 'Your data is yours',
    body: 'Export the team or one athlete any time. No fee, no ticket.',
  },
  {
    icon: Target,
    title: 'Never sold. No ads.',
    body: 'Our one AI feature removes every name before anything leaves our servers.',
  },
  {
    icon: GraduationCap,
    title: 'Accounts start at 9th grade',
    body: 'Younger athletes can be rostered, but can’t sign up. Enforced in the software.',
  },
];

/** Icon in its section's colour on a soft tile of the same hue. The one
 *  place colour appears on this page, which is what keeps it from reading
 *  as decoration. */
const IconTile: React.FC<{ icon: typeof School; section: SectionKey }> = ({
  icon: Icon,
  section,
}) => {
  const accent = accentFor(section);
  return (
    <div
      className={cn('flex h-11 w-11 items-center justify-center rounded-xl', accent.soft)}
      aria-hidden
    >
      <Icon className={cn('h-5 w-5', accent.text)} />
    </div>
  );
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex items-center justify-between gap-2 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              LP
            </div>
            <span className="truncate text-lg font-bold sm:text-xl">LeadPack XC</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link to="/start">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 text-center sm:py-28">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Cross country team management
          </p>
          <h1 className="mt-3 text-5xl font-bold tracking-tight sm:text-7xl">LeadPack XC</h1>
          <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl">Team management for cross country</p>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground sm:text-xl">
            Your season has outgrown the spreadsheet. Paste or upload your results and get
            attendance, workouts, meet day and analytics.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/start">
              <Button size="lg" className="w-full px-8 sm:w-auto">
                Start free trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <a href="#spreadsheet">
              <Button size="lg" variant="outline" className="w-full px-8 sm:w-auto">
                See what replaces your sheet
              </Button>
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No credit card · Free for 30 days
          </p>
        </div>
        <AppPreview />
      </section>

      {/* The problem */}
      <section className="border-y bg-muted/40">
        <div className="container mx-auto max-w-5xl px-4 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <FileSpreadsheet className={cn('mx-auto h-9 w-9', accentFor('season').text)} />
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Sound like your August?
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              A spreadsheet holds the numbers. It doesn’t do the jobs.
            </p>
          </div>
          <ul className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-2">
            {PAIN.map((line) => (
              <li key={line} className="flex gap-3 rounded-2xl border bg-card p-5 text-sm shadow-sm">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                <span className="leading-relaxed text-muted-foreground">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Spreadsheet vs LeadPack */}
      <section id="spreadsheet" className="container mx-auto max-w-5xl scroll-mt-20 px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            What replaces your sheet
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">Same data, work done for you.</p>
        </div>
        <div className="mt-10 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="hidden grid-cols-[10rem_1fr_1fr] border-b bg-muted/50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span />
            <span>The spreadsheet</span>
            <span className="text-primary">LeadPack</span>
          </div>
          <ul className="divide-y">
            {COMPARE.map((row) => (
              <li key={row.job} className="grid gap-1 px-5 py-4 text-sm md:grid-cols-[10rem_1fr_1fr] md:gap-4">
                <span className="font-semibold">{row.job}</span>
                <span className="text-muted-foreground">
                  <span className="mr-2 text-xs font-semibold uppercase tracking-wide md:hidden">Sheet:</span>
                  {row.sheet}
                </span>
                <span>
                  <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-primary md:hidden">LeadPack:</span>
                  {row.app}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* What you get out */}
      <section className="container mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">See the season. See the growth.</h2>
          <p className="mt-3 text-lg text-muted-foreground">Enter results once. The charts build themselves.</p>
        </div>
        <div className="mt-10">
          <Suspense fallback={<div className="h-96 rounded-2xl border bg-muted/30" aria-hidden />}>
            <ExampleCharts />
          </Suspense>
        </div>
      </section>

      {/* How the data gets in */}
      <section className="border-y bg-muted/40">
        <div className="container mx-auto max-w-5xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your results. Your hands.
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Every result is one you put there. Nothing is fetched for you.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {INTAKE.map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="rounded-2xl border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <Icon className={cn('h-5 w-5', accentFor('season').text)} aria-hidden />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
            You always see a preview first. Imports never delete anything.
          </p>
        </div>
      </section>

      {/* Who it's for */}
      <section className="container mx-auto px-4 pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Built for your kind of team</h2>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {AUDIENCES.map((item) => (
            <div key={item.title} className="rounded-2xl border bg-card p-6 shadow-sm">
              <IconTile icon={item.icon} section={item.section} />
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">The daily work, done</h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <IconTile icon={item.icon} section={item.section} />
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust — deliberately dark in BOTH themes, so it sets its own
          foreground rather than inheriting one that would flip on it. */}
      <section className="bg-ink text-ink-foreground">
        <div className="container mx-auto max-w-5xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <ShieldCheck className="mx-auto h-9 w-9 text-ink-muted" />
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Student data, taken seriously
            </h2>
            <p className="mt-3 text-lg text-ink-muted">Most athletes are minors. Here is what that means in the software.</p>
          </div>

          <div className="mt-12 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {TRUST.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" />
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link to="/policies">
              <Button
                size="lg"
                variant="outline"
                className="border-ink-border bg-transparent text-ink-foreground hover:bg-ink-foreground hover:text-ink"
              >
                Read the policy
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* For coaches / for athletes */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Built for coaches & athletes
        </h2>
        <div className="mx-auto mt-12 grid max-w-4xl gap-10 md:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-xl font-semibold">
              <Users className={cn('h-5 w-5', accentFor('athletes').text)} />
              For coaches
            </h3>
            <ul className="mt-4 space-y-3">
              {[
                'Retire the roster, attendance and meet-day sheets',
                'See who’s improving and who’s stalled',
                'Give assistants access to just their groups',
                'Keep every season, four years in one picture',
              ].map((line) => (
                <li key={line} className="flex gap-3 text-sm">
                  <CheckCircle2
                    className={cn('mt-0.5 h-4 w-4 shrink-0', accentFor('athletes').text)}
                  />
                  <span className="text-muted-foreground">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="flex items-center gap-2 text-xl font-semibold">
              <Target className={cn('h-5 w-5', accentFor('training').text)} />
              For athletes
            </h3>
            <ul className="mt-4 space-y-3">
              {[
                'A training log that’s private until you share it',
                'Add runs from Garmin, Strava, Apple Health or any watch file',
                'Workout paces from your own recent races',
                'Set goals before a race, reflect after',
              ].map((line) => (
                <li key={line} className="flex gap-3 text-sm">
                  <CheckCircle2
                    className={cn('mt-0.5 h-4 w-4 shrink-0', accentFor('training').text)}
                  />
                  <span className="text-muted-foreground">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-muted/40">
        <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready to close the spreadsheet?</h2>
          <p className="mt-3 text-lg text-muted-foreground">Upload your roster, paste last season. Working in an afternoon.</p>
          <Link to="/start">
            <Button size="lg" className="mt-8 px-8">
              Start your free trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            No credit card required · Free for 30 days
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container mx-auto space-y-2 px-4 py-8 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} LeadPack XC. Built for cross country coaches and athletes.</p>
          <p>
            <Link to="/policies" className="underline underline-offset-4 hover:text-foreground">
              Your data, and what we do with it
            </Link>
            <span className="mx-2">·</span>
            <span>We never sell student data.</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
