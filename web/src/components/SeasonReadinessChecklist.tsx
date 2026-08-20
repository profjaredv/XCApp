import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useTeamPath } from '@/hooks/useTeamRoute';

// Today page follow-up: SetupChecklist.tsx covers "does this team have a
// season at all" — this is the next layer down, shown once a season
// exists but some of it still needs setting up (meets scheduled, training
// groups, coaching staff, a practice plan). Same A3 rule as the rest of
// Today: nothing renders once every step is done — an empty area is the
// reward, not a green all-clear badge.

interface Step {
  label: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
}

export const SeasonReadinessChecklist: React.FC = () => {
  const { data: context, isLoading } = useTeamContext();
  const teamPath = useTeamPath();

  if (isLoading || !context) return null;

  const steps: Step[] = [
    {
      label: 'Schedule your meets',
      description: 'Import your calendar or add meets by hand so entries and logistics have somewhere to live.',
      done: context.setup.hasMeets,
      href: teamPath('/meets'),
      cta: 'Open Meets',
    },
    {
      label: 'Set up training groups',
      description: 'Group athletes by pace so plans and analytics can be assigned per group instead of one at a time.',
      done: context.setup.hasGroups,
      href: teamPath('/groups'),
      cta: 'Open Groups',
    },
    {
      label: 'Invite your coaching staff',
      description: 'Assistant and volunteer coaches get their own login and scoped access, not a shared password.',
      done: context.setup.hasStaff,
      href: teamPath('/settings'),
      cta: 'Invite staff',
    },
    {
      label: 'Build a practice plan',
      description: "Athletes see nothing on their own Today page until a plan is published.",
      done: context.setup.hasTrainingPlans,
      href: teamPath('/schedule'),
      cta: 'Open Schedule',
    },
  ];

  if (steps.every((s) => s.done)) return null;

  const nextStep = steps.find((s) => !s.done);
  const completed = steps.filter((s) => s.done).length;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle>Finish setting up this season</CardTitle>
        <CardDescription>{completed} of {steps.length} steps done.</CardDescription>
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
              {!step.done && <p className="text-sm text-muted-foreground">{step.description}</p>}
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

export default SeasonReadinessChecklist;
