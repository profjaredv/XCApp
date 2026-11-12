import { Link } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Camera,
  CalendarDays,
  ClipboardList,
  ClipboardPaste,
  Download,
  Footprints,
  GraduationCap,
  HeartHandshake,
  Lock,
  NotebookPen,
  Package,
  Palette,
  PencilLine,
  ShieldCheck,
  Target,
  Timer,
  TrendingUp,
  Upload,
  Users,
  UsersRound,
} from 'lucide-react';
import { accentFor, type SectionKey } from '@/lib/sectionAccent';
import { cn } from '@/lib/utils';
import { AppPreview } from '@/components/landing/AppPreview';
import { FootstepsShowcase, MeetDayShowcase, PhotosShowcase, PracticeShowcase } from '@/components/landing/Showcases';

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

// The page is organised around what the product does, biggest first. Each
// showcase is one job, a picture of it, and three plain facts. Everything
// claimed here exists in the app today.
const SHOWCASES: Array<{
  id: string;
  icon: typeof Camera;
  section: SectionKey;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  visual: React.ReactNode;
}> = [
  {
    id: 'photos',
    icon: Camera,
    section: 'meets',
    eyebrow: 'LeadPack Photos',
    title: 'Every runner gets their photos',
    body: 'Hundreds of meet photos usually sit in one parent’s camera roll. Load them once, tag who is in each, and every athlete ends the season with their own.',
    points: [
      'Load from your computer or a shared Google Photos album.',
      'Parents help tag with a meet-day password. No account needed.',
      'One-page collage per runner with their stats and season chart, as a print-ready PDF.',
      'A private download link per athlete, and a slideshow for the banquet.',
    ],
    visual: <PhotosShowcase />,
  },
  {
    id: 'footsteps',
    icon: Footprints,
    section: 'program',
    eyebrow: 'Footsteps',
    title: 'See where a runner is heading',
    body: 'Your own alumni are the best prediction you have. Footsteps finds the runners from your program who ran like this athlete at the same grade, and shows what they went on to run.',
    points: [
      'A projected time with its range and how many runners it rests on.',
      'Built from your team’s history. No formula, no AI.',
      'Coaches see who the matches are. Athletes and parents see class year only.',
    ],
    visual: <FootstepsShowcase />,
  },
  {
    id: 'meet-day',
    icon: Timer,
    section: 'meets',
    eyebrow: 'Meet day',
    title: 'Entries to team score, on your phone',
    body: 'Build entries from the roster, time the race, and have the scores before the bus leaves.',
    points: [
      'Entries and meet plans by race and division.',
      'A live timer that records mile splits as they pass.',
      'Team scoring, pack spread and PRs. Add the full field and see where you placed.',
    ],
    visual: <MeetDayShowcase />,
  },
  {
    id: 'practice',
    icon: CalendarDays,
    section: 'groups',
    eyebrow: 'Every day',
    title: 'Attendance, plans and paces by group',
    body: 'The part of coaching that happens at 3:30. Each assistant sees their own group and nothing else.',
    points: [
      'Take attendance at the trailhead in a few taps.',
      'Plan the week and assign workouts by training group.',
      'Define Threshold and VO2 your way. Paces come from each runner’s races.',
    ],
    visual: <PracticeShowcase />,
  },
];

const COMPARE: Array<{ job: string; sheet: string; app: string }> = [
  { job: 'Roster', sheet: 'Retyped every August', app: 'Built once, rolls over' },
  { job: 'Attendance', sheet: 'A column nobody trusts', app: 'Taken on your phone, by group' },
  { job: 'Results', sheet: 'Pasted into tabs, broken formulas', app: 'Paste or upload; every season kept' },
  { job: 'Workout paces', sheet: 'Calculated by hand', app: 'From each athlete’s own races' },
  { job: 'Meet day', sheet: 'A new sheet every weekend', app: 'Entries, timer, scoring' },
  { job: 'Photos', sheet: 'Not in the sheet', app: 'Tagged, and handed to each runner' },
  { job: 'Access', sheet: 'Everyone sees everything', app: 'Assistants see only their groups' },
];

const INTAKE: Array<{ icon: typeof Upload; title: string; body: string }> = [
  { icon: ClipboardPaste, title: 'Paste', body: 'Copy results from the page you’re looking at. Preview before anything saves.' },
  { icon: Upload, title: 'Upload', body: 'A CSV or spreadsheet you already have. Template included.' },
  { icon: PencilLine, title: 'Type', body: 'Enter a race, time or athlete by hand.' },
];

// The rest of the product, one line each.
const FEATURES: Array<{
  icon: typeof ClipboardList;
  title: string;
  body: string;
  section: SectionKey;
}> = [
  {
    icon: ClipboardList,
    title: 'A roster that carries forward',
    body: 'Class years roll over and seniors retire themselves.',
    section: 'athletes',
  },
  {
    icon: TrendingUp,
    title: 'Season and program analytics',
    body: 'Who’s improving, how tight the pack is, and how far each season went.',
    section: 'program',
  },
  {
    icon: NotebookPen,
    title: 'Athlete log and goals',
    body: 'Private until shared. Runs come in from Garmin, Strava, Apple Health or a watch file.',
    section: 'training',
  },
  {
    icon: HeartHandshake,
    title: 'Parents, with limits',
    body: 'A parent sees their own runner once you approve the link.',
    section: 'athletes',
  },
  {
    icon: UsersRound,
    title: 'Staff roles',
    body: 'Assistants and volunteers get their groups, not the whole team.',
    section: 'groups',
  },
  {
    icon: Package,
    title: 'Equipment',
    body: 'Uniforms and gear checked out to names, with what’s overdue.',
    section: 'season',
  },
  {
    icon: Palette,
    title: 'Your colors',
    body: 'Set them once. The app and every export wear them.',
    section: 'season',
  },
  {
    icon: Download,
    title: 'Exports',
    body: 'The team or one athlete, any time. No fee, no ticket.',
    section: 'meets',
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
            Roster, practice, meet day, results and photos in one place. Everything your spreadsheet does, and the
            things it never could.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/start">
              <Button size="lg" className="w-full px-8 sm:w-auto">
                Start free trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <a href="#photos">
              <Button size="lg" variant="outline" className="w-full px-8 sm:w-auto">
                See what it does
              </Button>
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No credit card · Free for 30 days
          </p>
          {/* Jump links: the page in one line. */}
          <nav aria-label="Features" className="mt-8 flex flex-wrap justify-center gap-2">
            {SHOWCASES.map(({ id, icon: Icon, eyebrow }) => (
              <a
                key={id}
                href={`#${id}`}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
              >
                <Icon className="h-4 w-4 text-primary" aria-hidden />
                {eyebrow}
              </a>
            ))}
          </nav>
        </div>
        <AppPreview />
      </section>

      {/* Feature showcases: one job each, picture beside it, alternating sides. */}
      {SHOWCASES.map((item, i) => {
        const accent = accentFor(item.section);
        return (
          <section
            key={item.id}
            id={item.id}
            className={cn('scroll-mt-20', i % 2 === 0 && 'border-y bg-muted/40')}
          >
            <div className="container mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-20">
              <div className={cn(i % 2 === 1 && 'md:order-2')}>
                <p className={cn('flex items-center gap-2 text-sm font-semibold uppercase tracking-widest', accent.text)}>
                  <item.icon className="h-4 w-4" aria-hidden />
                  {item.eyebrow}
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{item.title}</h2>
                <p className="mt-3 text-lg text-muted-foreground">{item.body}</p>
                <ul className="mt-6 space-y-3">
                  {item.points.map((point) => (
                    <li key={point} className="flex gap-3 text-sm">
                      <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current', accent.text)} aria-hidden />
                      <span className="leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={cn('min-w-0', i % 2 === 1 && 'md:order-1')}>
                {item.visual}
                <p className="mt-3 text-center text-xs text-muted-foreground">Example with made-up names and numbers.</p>
              </div>
            </div>
          </section>
        );
      })}

      {/* What you get out */}
      <section id="analytics" className="container mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
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

      {/* The rest of the product */}
      <section className="border-y bg-muted/40">
        <div className="container mx-auto px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">And the rest of the job</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((item) => (
              <div key={item.title} className="rounded-2xl border bg-card p-5 shadow-sm">
                <IconTile icon={item.icon} section={item.section} />
                <h3 className="mt-4 font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
            For high school, college and club teams.
          </p>
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

      {/* CTA */}
      <section className="border-t bg-muted/40">
        <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready to close the spreadsheet?</h2>
          <p className="mt-3 text-lg text-muted-foreground">Upload your roster, paste last season, load a meet’s photos. Working in an afternoon.</p>
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
