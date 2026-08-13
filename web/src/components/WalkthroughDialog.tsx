import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { useAuth } from '../contexts/AuthContext';
import { useWalkthrough } from '../contexts/WalkthroughContext';
import { WALKTHROUGH_STEPS } from '../lib/walkthroughContent';

// Stepped first-time tour — five features, one per role, picked as the
// core workflow (see lib/walkthroughContent.ts). Auto-opens once per
// user+role via WalkthroughContext; also reachable from Settings via
// useWalkthrough().open() to replay it.
export function WalkthroughDialog() {
  const { isOpen, role, close } = useWalkthrough();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);

  if (!role) return null;

  const steps = WALKTHROUGH_STEPS[role];
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const Icon = step.icon;
  // Built from the user's own team, not the current route's :athleticTeamId
  // param — this dialog can be open on routes (like /profile) that don't
  // have one, right after a new staff member accepts their invite.
  const athleticTeamId = currentUser?.team?.athleticTeamId;

  const reset = () => setStepIndex(0);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      reset();
      close();
    }
  };

  const handleGoThere = () => {
    if (athleticTeamId) {
      navigate(`/t/${athleticTeamId}${step.path}`);
    }
    reset();
    close();
  };

  const handleNext = () => {
    if (isLast) {
      reset();
      close();
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{step.title}</DialogTitle>
              <p className="text-xs text-muted-foreground">
                Step {stepIndex + 1} of {steps.length}
              </p>
            </div>
          </div>
          <DialogDescription className="pt-2 text-left">{step.description}</DialogDescription>
        </DialogHeader>

        <Progress value={((stepIndex + 1) / steps.length) * 100} />

        <DialogFooter className="flex-row items-center justify-between sm:justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => { reset(); close(); }}>
            Skip
          </Button>
          <div className="flex gap-2">
            {athleticTeamId && (
              <Button variant="outline" size="sm" onClick={handleGoThere}>
                {step.cta}
              </Button>
            )}
            <Button size="sm" onClick={handleNext}>
              {isLast ? 'Finish' : 'Next'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
