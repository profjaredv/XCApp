import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart3,
  TrendingUp,
  Users,
  Target,
  Trophy,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Lock,
  Download,
  ClipboardList,
  CalendarDays,
  Timer,
  GraduationCap,
  School,
  Flag,
} from 'lucide-react';

// The public landing page.
//
// Claims here are deliberately specific and checkable rather than badges.
// That is not modesty — it is what the audience responds to. The people
// who decide whether a school may use this have been trained to distrust
// vague assurances: the Department of Education's own Privacy Technical
// Assistance Center names "Our Software is FERPA Compliant" as a line to
// be skeptical of, and notes there is no ED seal of approval to point at.
// FERPA binds schools; a vendor earns its standing by signing an
// agreement and behaving a particular way. So every trust claim below is
// either something the code enforces (and a test asserts) or a commitment
// stated plainly enough to be held to.
//
// Anything asserted here that the software must actually do is covered by
// src/content/dataPolicy.ts and the backend classification registry, so
// the marketing page and the policy page cannot drift apart.

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-secondary">
      {/* Hero Section */}
      <header className="border-b bg-white/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-lg">
              LP
            </div>
            <h1 className="truncate text-xl sm:text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              LeadPack XC
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-4">
            <Link to="/login">
              <Button variant="ghost" size="sm" className="sm:h-9 sm:px-4">Sign In</Button>
            </Link>
            <Link to="/start">
              <Button size="sm" className="bg-gradient-to-r from-primary to-primary/80 sm:h-9 sm:px-4">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Content */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-5xl md:text-6xl font-black mb-6 bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
            Run the whole season from one place
          </h2>
          <p className="text-xl text-slate-600 mb-4 max-w-2xl mx-auto">
            Cross country team management and analytics — roster, attendance, workouts, meet day,
            and every result your program has ever run. Built for high school, college, and club
            teams.
          </p>
          <p className="text-base text-slate-500 mb-8 max-w-2xl mx-auto">
            Made by a coach who got tired of the spreadsheet.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/start">
              <Button size="lg" className="bg-gradient-to-r from-primary to-primary/80 text-lg px-8 py-6">
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/policies">
              <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                How we handle your data
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            No credit card required · Free for 30 days
          </p>
        </div>
      </section>

      {/* Who it's for */}
      <section className="container mx-auto px-4 pb-12">
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <Card className="border-2">
            <CardHeader>
              <School className="h-6 w-6 text-primary mb-3" />
              <CardTitle className="text-lg">High school programs</CardTitle>
              <CardDescription>
                Class years, eligibility, JV and varsity, parent access, and the season-over-season
                history that makes a four-year athlete's arc visible. We sign your district's data
                privacy agreement.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2">
            <CardHeader>
              <GraduationCap className="h-6 w-6 text-accent mb-3" />
              <CardTitle className="text-lg">College teams</CardTitle>
              <CardDescription>
                Larger rosters, training groups with their own assistant coaches, deeper workout
                data, and multi-year progression for athletes recruited on a five-year clock.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2">
            <CardHeader>
              <Flag className="h-6 w-6 text-chart-3 mb-3" />
              <CardTitle className="text-lg">Club teams</CardTitle>
              <CardDescription>
                Mixed ages and schools, volunteer coaches with scoped access, and meet logistics for
                a roster that does not share a building.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold mb-4">Everything the season actually needs</h3>
          <p className="text-slate-600 text-lg">
            Not just charts. The daily work of running a program.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-2 hover:border-primary/30 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <ClipboardList className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Roster & season management</CardTitle>
              <CardDescription>
                Build the roster once and carry it forward. Class years roll over, graduating
                athletes retire themselves, and last season stays intact for comparison.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/30 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                <CalendarDays className="h-6 w-6 text-accent" />
              </div>
              <CardTitle>Attendance & practice plans</CardTitle>
              <CardDescription>
                Take attendance in seconds on your phone at the trailhead. Plan practices, assign
                workouts to groups, and see who has actually been there.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/30 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center mb-4">
                <Timer className="h-6 w-6 text-chart-3" />
              </div>
              <CardTitle>Workouts in your own language</CardTitle>
              <CardDescription>
                Define what Threshold and VO2 mean for your program, and every interval session
                calculates paces from each athlete's own recent races. McMillan defaults included.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/30 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle>Meet day, handled</CardTitle>
              <CardDescription>
                Entries, heat assignments, a live timer, and full field-results scoring — so you know
                where you actually placed, not just who finished first for you.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/30 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="h-6 w-6 text-yellow-600" />
              </div>
              <CardTitle>Analytics that answer questions</CardTitle>
              <CardDescription>
                Pack spread, course-adjusted comparisons, who is improving and who has stalled, and
                career progression across every season an athlete has run.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/30 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <Trophy className="h-6 w-6 text-red-600" />
              </div>
              <CardTitle>Athletes see their own story</CardTitle>
              <CardDescription>
                A private training log, race reflections, and their own progress — plus imports from
                Garmin, Strava, Apple Health or any watch that exports a file.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Trust Section — specific, checkable claims only */}
      <section className="bg-slate-900 text-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <ShieldCheck className="h-10 w-10 mx-auto mb-4 text-white/90" />
              <h3 className="text-4xl font-bold mb-4">Student data, taken seriously</h3>
              <p className="text-lg text-white/70 max-w-2xl mx-auto">
                Most of our athletes are minors. Here is exactly what that means in the software —
                not a badge, the actual behaviour.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <Lock className="h-6 w-6 flex-shrink-0 mt-1 text-white/80" />
                <div>
                  <h4 className="font-semibold mb-1">Nothing is public</h4>
                  <p className="text-white/70 text-sm">
                    No public profiles, no public rosters, no searchable athlete pages. Every screen
                    requires signing in and being on the team.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <ShieldCheck className="h-6 w-6 flex-shrink-0 mt-1 text-white/80" />
                <div>
                  <h4 className="font-semibold mb-1">We will sign your district's agreement</h4>
                  <p className="text-white/70 text-sm">
                    LeadPack is built to operate as a school official under a signed data privacy
                    agreement — yours or the standard NDPA. We can hand your district a complete
                    inventory of every category of student data we store.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <Users className="h-6 w-6 flex-shrink-0 mt-1 text-white/80" />
                <div>
                  <h4 className="font-semibold mb-1">The athlete's own writing is hers</h4>
                  <p className="text-white/70 text-sm">
                    Training logs are private by default. A coach sees one only when the athlete
                    shares it. She can see everyone who can see anything of hers, on one screen, and
                    change it.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <Download className="h-6 w-6 flex-shrink-0 mt-1 text-white/80" />
                <div>
                  <h4 className="font-semibold mb-1">Your data is yours, and you can take it</h4>
                  <p className="text-white/70 text-sm">
                    Export everything — the whole team or one athlete — any time, without asking us.
                    No lock-in, no export fee, no support ticket.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <Target className="h-6 w-6 flex-shrink-0 mt-1 text-white/80" />
                <div>
                  <h4 className="font-semibold mb-1">Never sold. Never advertised against.</h4>
                  <p className="text-white/70 text-sm">
                    We don't sell student data and we don't run ads. Our one AI feature strips every
                    athlete's name before anything leaves our servers — the model writing your team's
                    insights never learns who anyone is.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <GraduationCap className="h-6 w-6 flex-shrink-0 mt-1 text-white/80" />
                <div>
                  <h4 className="font-semibold mb-1">Accounts start at 9th grade</h4>
                  <p className="text-white/70 text-sm">
                    Younger athletes can be rostered and scored by their coach, but cannot create an
                    account. Enforced in the software, not just promised here.
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center mt-12">
              <Link to="/policies">
                <Button size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white hover:text-slate-900">
                  Read the whole policy
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-gradient-to-br from-primary to-primary/80 text-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-4xl font-bold mb-12 text-center">Built for coaches & athletes</h3>

            <div className="grid md:grid-cols-2 gap-12">
              <div>
                <h4 className="text-2xl font-bold mb-6 flex items-center">
                  <Users className="h-6 w-6 mr-3" />
                  For coaches
                </h4>
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>Run roster, attendance, workouts and meet day without a spreadsheet</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>See who is improving, who has stalled, and how the pack is closing</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>Give assistants and volunteers access to just their own groups</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>Keep every season, so a senior's whole four years is one picture</span>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="text-2xl font-bold mb-6 flex items-center">
                  <Target className="h-6 w-6 mr-3" />
                  For athletes
                </h4>
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>A training log that is actually private until you share it</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>Import your runs from Garmin, Strava, Apple Health or your watch</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>Know your paces for every workout, from your own recent races</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>Set goals before a race and reflect on it after, in your own words</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto text-center bg-gradient-to-br from-primary to-primary/80 rounded-3xl p-12 text-white shadow-2xl">
          <h3 className="text-4xl font-bold mb-4">Ready to Lead Your Pack?</h3>
          <p className="text-xl mb-8 text-white/85">
            Start with your current roster and last season's results. You will have a working season
            in an afternoon.
          </p>
          <Link to="/start">
            <Button size="lg" className="bg-white text-primary hover:bg-white/90 text-lg px-8 py-6">
              Start Your Free Trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <p className="mt-4 text-sm text-white/70">No credit card required • Free for 30 days</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-slate-50 py-8">
        <div className="container mx-auto space-y-3 px-4 text-center text-slate-600">
          <p>&copy; 2025 LeadPack XC. Built for cross country coaches and athletes.</p>
          <p className="text-sm">
            <Link to="/policies" className="underline underline-offset-4 hover:text-slate-900">
              Your data, and what we do with it
            </Link>
            <span className="mx-2 text-slate-400">·</span>
            <span className="text-slate-500">We never sell student data.</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
