import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';

// Shown instead of a wall of empty charts while a team is still being set up.
// The app previously had no concept of "not set up yet", so a brand-new coach
// saw the same dozen analytics screens as an established team — just blank.

interface Step {
  label: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
}

export const SetupChecklist: React.FC = () => {
  const { data: context, isLoading } = useTeamContext();

  if (isLoading || !context) return null;

  const steps: Step[] = [
    {
      label: 'Connect your Athletic.net team',
      description: 'Lets the app import your race results automatically.',
      done: context.setup.hasAthleticTeamId,
      href: '/settings',
      cta: 'Open settings',
    },
    {
      label: 'Build your roster',
      description: 'Add athletes by hand, or let an import create them for you.',
      done: context.setup.hasRoster,
      href: '/roster',
      cta: 'Manage roster',
    },
    {
      label: 'Import a season',
      description: 'Pull in results to unlock analytics, PRs and trends.',
      done: context.setup.hasResults,
      href: '/data-management',
      cta: 'Import results',
    },
  ];

  const nextStep = steps.find((s) => !s.done);
  const completed = steps.filter((s) => s.done).length;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle>Finish setting up {context.team?.name ?? 'your team'}</CardTitle>
        <CardDescription>
          {completed} of {steps.length} steps done. Analytics fill in as you go.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step) => (
          <div key={step.label} className="flex items-start gap-3">
            {step.done ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className={step.done ? 'font-medium text-muted-foreground line-through' : 'font-medium'}>
                {step.label}
              </p>
              {!step.done && (
                <p className="text-sm text-muted-foreground">{step.description}</p>
              )}
            </div>
            {step === nextStep && (
              <Button asChild size="sm">
                <Link to={step.href}>
                  {step.cta}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default SetupChecklist;
