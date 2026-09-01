import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  Flag,
  GraduationCap,
  Lock,
  School,
  ShieldCheck,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { accentFor, type SectionKey } from '@/lib/sectionAccent';
import { cn } from '@/lib/utils';

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
    title: 'High school programs',
    body: 'Class years, eligibility, JV and varsity, parent access, and the season-over-season history that makes a four-year athlete’s arc visible. We sign your district’s data privacy agreement.',
    section: 'season',
  },
  {
    icon: GraduationCap,
    title: 'College teams',
    body: 'Larger rosters, training groups with their own assistant coaches, deeper workout data, and multi-year progression for athletes recruited on a five-year clock.',
    section: 'athletes',
  },
  {
    icon: Flag,
    title: 'Club teams',
    body: 'Mixed ages and schools, volunteer coaches with scoped access, and meet logistics for a roster that does not share a building.',
    section: 'meets',
  },
];

const FEATURES: Array<{
  icon: typeof ClipboardList;
  title: string;
  body: string;
  section: SectionKey;
}> = [
  {
    icon: ClipboardList,
    title: 'Roster & season management',
    body: 'Build the roster once and carry it forward. Class years roll over, graduating athletes retire themselves, and last season stays intact for comparison.',
    section: 'athletes',
  },
  {
    icon: CalendarDays,
    title: 'Attendance & practice plans',
    body: 'Take attendance in seconds on your phone at the trailhead. Plan practices, assign workouts to groups, and see who has actually been there.',
    section: 'groups',
  },
  {
    icon: Timer,
    title: 'Workouts in your own language',
    body: 'Define what Threshold and VO2 mean for your program, and every interval session calculates paces from each athlete’s own recent races. McMillan defaults included.',
    section: 'training',
  },
  {
    icon: BarChart3,
    title: 'Meet day, handled',
    body: 'Entries, heat assignments, a live timer, and full field-results scoring — so you know where you actually placed, not just who finished first for you.',
    section: 'meets',
  },
  {
    icon: TrendingUp,
    title: 'Analytics that answer questions',
    body: 'Pack spread, course-adjusted comparisons, who is improving and who has stalled, and career progression across every season an athlete has run.',
    section: 'program',
  },
  {
    icon: Trophy,
    title: 'Athletes see their own story',
    body: 'A private training log, race reflections, and their own progress — plus imports from Garmin, Strava, Apple Health or any watch that exports a file.',
    section: 'season',
  },
];

const TRUST = [
  {
    icon: Lock,
    title: 'Nothing is public',
    body: 'No public profiles, no public rosters, no searchable athlete pages. Every screen requires signing in and being on the team.',
  },
  {
    icon: ShieldCheck,
    title: "We will sign your district's agreement",
    body: 'LeadPack is built to operate as a school official under a signed data privacy agreement — yours or the standard NDPA. We can hand your district a complete inventory of every category of student data we store.',
  },
  {
    icon: Users,
    title: 'The athlete’s own writing is hers',
    body: 'Training logs are private by default. A coach sees one only when the athlete shares it. She can see everyone who can see anything of hers, on one screen, and change it.',
  },
  {
    icon: Download,
    title: 'Your data is yours, and you can take it',
    body: 'Export everything — the whole team or one athlete — any time, without asking us. No lock-in, no export fee, no support ticket.',
  },
  {
    icon: Target,
    title: 'Never sold. Never advertised against.',
    body: 'We don’t sell student data and we don’t run ads. Our one AI feature strips every athlete’s name before anything leaves our servers — the model writing your team’s insights never learns who anyone is.',
  },
  {
    icon: GraduationCap,
    title: 'Accounts start at 9th grade',
    body: 'Younger athletes can be rostered and scored by their coach, but cannot create an account. Enforced in the software, not just promised here.',
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
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Run the whole season
            <br className="hidden sm:block" /> from one place
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Cross country team management and analytics — roster, attendance, workouts, meet day,
            and every result your program has ever run. Built for high school, college and club
            teams.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Made by a coach who got tired of the spreadsheet.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/start">
              <Button size="lg" className="w-full px-8 sm:w-auto">
                Start free trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/policies">
              <Button size="lg" variant="outline" className="w-full px-8 sm:w-auto">
                How we handle your data
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No credit card required · Free for 30 days
          </p>
        </div>
      </section>

      {/* Who it's for */}
      <section className="border-y bg-muted/40">
        <div className="container mx-auto grid gap-6 px-4 py-16 md:grid-cols-3">
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
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything the season actually needs
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            Not just charts. The daily work of running a program.
          </p>
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
            <p className="mt-3 text-lg text-ink-muted">
              Most of our athletes are minors. Here is exactly what that means in the software —
              not a badge, the actual behaviour.
            </p>
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
                Read the whole policy
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
                'Run roster, attendance, workouts and meet day without a spreadsheet',
                'See who is improving, who has stalled, and how the pack is closing',
                'Give assistants and volunteers access to just their own groups',
                'Keep every season, so a senior’s whole four years is one picture',
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
                'A training log that is actually private until you share it',
                'Import your runs from Garmin, Strava, Apple Health or your watch',
                'Know your paces for every workout, from your own recent races',
                'Set goals before a race and reflect on it after, in your own words',
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
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready to lead your pack?</h2>
          <p className="mt-3 text-lg text-muted-foreground">
            Start with your current roster and last season’s results. You will have a working season
            in an afternoon.
          </p>
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
          <p>&copy; 2025 LeadPack XC. Built for cross country coaches and athletes.</p>
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
