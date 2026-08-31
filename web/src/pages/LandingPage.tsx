import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Target, 
  Zap, 
  Trophy,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-secondary">
      {/* Hero Section */}
      <header className="border-b bg-white/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-lg">
              LP
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              LeadPack XC
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link to="/login">
              <Button className="bg-gradient-to-r from-primary to-primary/80">
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
            Lead Your Pack to Victory
          </h2>
          <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
            The comprehensive cross country analytics platform designed to help coaches and athletes 
            track performance, identify trends, and reach the lead pack.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/login">
              <Button size="lg" className="bg-gradient-to-r from-primary to-primary/80 text-lg px-8 py-6">
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6">
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold mb-4">Everything You Need to Win</h3>
          <p className="text-slate-600 text-lg">Powerful analytics tools built specifically for cross country</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-2 hover:border-primary/30 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Real-Time Performance Tracking</CardTitle>
              <CardDescription>
                Monitor every race, every athlete, every season. Import data directly from Athletic.net 
                and see instant analytics.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/30 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="h-6 w-6 text-accent" />
              </div>
              <CardTitle>Athlete Progress Charts</CardTitle>
              <CardDescription>
                Visualize improvement over time with beautiful charts. Track PRs, pace progression, 
                and season-over-season growth.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/30 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-chart-3" />
              </div>
              <CardTitle>Team Analytics Dashboard</CardTitle>
              <CardDescription>
                Get a complete view of your team's performance. Identify top performers, track pack 
                splits, and analyze meet results.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/30 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <Target className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle>Distance Analysis</CardTitle>
              <CardDescription>
                Compare performance across different race distances. Understand how athletes perform 
                at 1 mile, 3 mile, and 5K distances.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/30 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-yellow-600" />
              </div>
              <CardTitle>AI-Powered Insights</CardTitle>
              <CardDescription>
                Get intelligent recommendations and insights. Identify improvement opportunities and 
                predict future performance trends.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/30 transition-all hover:shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <Trophy className="h-6 w-6 text-red-600" />
              </div>
              <CardTitle>Shareable Highlights</CardTitle>
              <CardDescription>
                Create beautiful season and career highlight cards. Export and share athlete 
                achievements on social media.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-gradient-to-br from-primary to-primary/80 text-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-4xl font-bold mb-12 text-center">Built for Coaches & Athletes</h3>
            
            <div className="grid md:grid-cols-2 gap-12">
              <div>
                <h4 className="text-2xl font-bold mb-6 flex items-center">
                  <Users className="h-6 w-6 mr-3" />
                  For Coaches
                </h4>
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>Make data-driven decisions about training and race strategy</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>Identify which athletes are improving and who needs extra support</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>Track team performance across multiple seasons</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>Save hours of manual data entry and spreadsheet work</span>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="text-2xl font-bold mb-6 flex items-center">
                  <Target className="h-6 w-6 mr-3" />
                  For Athletes
                </h4>
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>See your progress visualized with beautiful charts and graphs</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>Celebrate PRs and milestones with shareable highlight cards</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>Compare your performance across different race distances</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="h-6 w-6 mr-3 flex-shrink-0 mt-0.5" />
                    <span>Set goals and track improvement over your entire career</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid md:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-5xl font-black text-primary mb-2">10K+</div>
            <div className="text-slate-600">Races Analyzed</div>
          </div>
          <div>
            <div className="text-5xl font-black text-primary mb-2">500+</div>
            <div className="text-slate-600">Athletes Tracked</div>
          </div>
          <div>
            <div className="text-5xl font-black text-primary mb-2">50+</div>
            <div className="text-slate-600">Teams Using</div>
          </div>
          <div>
            <div className="text-5xl font-black text-primary mb-2">99%</div>
            <div className="text-slate-600">Coach Satisfaction</div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto text-center bg-gradient-to-br from-primary to-primary/80 rounded-3xl p-12 text-white shadow-2xl">
          <h3 className="text-4xl font-bold mb-4">Ready to Lead Your Pack?</h3>
          <p className="text-xl mb-8 text-white/85">
            Join coaches and athletes who are already using LeadPack XC to improve performance.
          </p>
          <Link to="/login">
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
