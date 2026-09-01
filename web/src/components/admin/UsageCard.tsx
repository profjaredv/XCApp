import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import { adminService } from '@/api/adminService';

// Which parts of the app actually get opened.
//
// Reads the PageView telemetry that has been collecting since E2 but was
// never surfaced anywhere — the data existed, nothing showed it.
//
// What it can and cannot say is worth stating, because the shape of this
// card follows from it: PageView stores a normalized route, a coarse role
// bucket and a timestamp, and nothing else. No user, no team, no athlete.
// So this answers "which screens does anyone use", which is the question
// for deciding what to build next, and cannot answer "what did this coach
// do", which is not a question this product should be able to answer about
// its own users.

const WINDOWS = [7, 30, 90];

const ROLE_LABELS: Record<string, string> = {
  coach: 'Coaches',
  athlete: 'Athletes',
  super_admin: 'Admin (you)',
  other: 'No team yet',
};

/** "/t/:id/roster" reads as "Athletes" to a human. Falls back to the raw
 *  route so a screen added later still shows up, just unlabelled. */
const ROUTE_LABELS: Record<string, string> = {
  '/t/:id/today': 'Today',
  '/t/:id/roster': 'Athletes',
  '/t/:id/groups': 'Groups',
  '/t/:id/schedule': 'Schedule',
  '/t/:id/analytics': 'Season',
  '/t/:id/band-trends': 'Program',
  '/t/:id/me': 'My Progress',
  '/t/:id/settings': 'Settings',
  '/t/:id/data-management': 'Data & Import',
  '/t/:id/equipment': 'Equipment',
  '/t/:id/field-results': 'Field Results',
  '/t/:id/attendance': 'Attendance',
  '/t/:id/meets': 'Meets',
  '/t/:id/admin': 'Platform',
  '/t/:id/coaches-tools': "Coach's Tools",
  '/onboarding': 'Onboarding',
  '/login': 'Sign in',
  '/': 'Landing page',
  '/policies': 'Data policy',
};

export const UsageCard: React.FC = () => {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ['adminUsage', days],
    queryFn: () => adminService.usage(days),
  });

  const peak = data?.routes[0]?.views ?? 0;
  const dailyMax = Math.max(...(data?.daily.map((d) => d.views) ?? [1]), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5" />
              What people actually open
            </CardTitle>
            <CardDescription>
              Screen opens by route and role. No user, team or athlete is recorded — this can say
              which screens get used, never who used them.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-1">
            {WINDOWS.map((w) => (
              <Button
                key={w}
                size="sm"
                variant={days === w ? 'default' : 'outline'}
                onClick={() => setDays(w)}
              >
                {w}d
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {isLoading && <Skeleton className="h-48 w-full" />}

        {data && data.total === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No screen opens recorded in the last {data.days} days.
          </p>
        )}

        {data && data.total > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">{data.total.toLocaleString()} screen opens</Badge>
              {data.roles
                .slice()
                .sort((a, b) => b.views - a.views)
                .map((r) => (
                  <span key={r.role} className="text-sm text-muted-foreground">
                    {ROLE_LABELS[r.role] ?? r.role} {r.views.toLocaleString()}
                  </span>
                ))}
            </div>

            <div>
              <p className="mb-3 text-sm font-medium">Most-opened screens</p>
              <ul className="space-y-2">
                {data.routes.map((r) => (
                  <li key={r.route} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        {ROUTE_LABELS[r.route] ?? r.route}
                        {ROUTE_LABELS[r.route] && (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {r.route}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{r.views}</span>
                    </div>
                    {/* A bar rather than a chart library: one measure, one
                        category, already sorted — an axis would carry no
                        information the number beside it does not. */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: peak > 0 ? `${Math.max(2, (r.views / peak) * 100)}%` : '0%' }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {data.daily.length > 1 && (
              <div>
                <p className="mb-2 text-sm font-medium">Daily opens</p>
                <div
                  className="flex h-16 items-end gap-0.5"
                  role="img"
                  aria-label={`Daily screen opens over the last ${data.days} days`}
                >
                  {data.daily.map((d) => (
                    <div
                      key={d.day}
                      title={`${d.day}: ${d.views}`}
                      className="min-w-0 flex-1 rounded-sm bg-primary/70"
                      style={{ height: `${Math.max(4, (d.views / dailyMax) * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>{data.daily[0]?.day}</span>
                  <span>{data.daily[data.daily.length - 1]?.day}</span>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default UsageCard;
