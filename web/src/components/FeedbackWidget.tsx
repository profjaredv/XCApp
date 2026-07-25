import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { MessageSquarePlus, Bug, Ban, Paintbrush, Lightbulb, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import api from '@/api/api';
import { getRecentErrors, clearErrorBuffer } from '@/lib/errorBuffer';
import { useTeamContext } from '@/hooks/useTeamContext';

// In-app feedback capture. The point is that the reporter only has to write
// the sentence — screen, season and recent console errors are attached
// automatically, because those are exactly the details that make a report
// actionable and that nobody writes down by hand.

type Severity = 'blocker' | 'bug' | 'polish' | 'idea';

const SEVERITIES: Array<{
  value: Severity;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'blocker', label: 'Blocker', hint: "Can't continue", icon: Ban },
  { value: 'bug', label: 'Bug', hint: 'Wrong, but workable', icon: Bug },
  { value: 'polish', label: 'Polish', hint: 'Works, feels off', icon: Paintbrush },
  { value: 'idea', label: 'Idea', hint: 'Could be better', icon: Lightbulb },
];

// Route -> human label, so reports read like "Analytics" not "/analytics".
const SCREEN_NAMES: Record<string, string> = {
  '/analytics': 'Analytics',
  '/dashboard': 'Analytics',
  '/roster': 'Roster',
  '/team': 'My Team',
  '/results-grid': 'Results Grid',
  '/tools': 'Tools',
  '/coaches-tools': 'Coaches Tools',
  '/data-management': 'Data Management',
  '/settings': 'Settings',
  '/profile': 'Profile',
  '/onboarding': 'Onboarding',
  '/race-visualization': 'Race Visualization',
  '/feedback': 'Feedback Review',
};

// Team-scoped routes look like /t/12345/analytics — strip that prefix before
// matching against SCREEN_NAMES so the report reads "Analytics", not the raw
// path (which also embeds a value, the Athletic.net team ID, worth keeping
// out of a report title).
const TEAM_PREFIX = /^\/t\/[^/]+/;

function screenNameFor(pathname: string): string {
  const normalized = pathname.replace(TEAM_PREFIX, '') || '/';
  if (SCREEN_NAMES[normalized]) return SCREEN_NAMES[normalized];
  if (normalized.startsWith('/athlete/')) return 'Athlete Profile';
  if (normalized.includes('/athlete/')) return 'Team Athlete Profile';
  return normalized;
}

export const FeedbackWidget: React.FC = () => {
  const location = useLocation();
  const { data: context } = useTeamContext();

  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<Severity>('bug');
  const [message, setMessage] = useState('');

  const recentErrors = getRecentErrors();

  const submit = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams(location.search);
      const seasonParam = parseInt(params.get('season') ?? '', 10);

      return api.post('/feedback', {
        route: location.pathname,
        screen: screenNameFor(location.pathname),
        season: Number.isFinite(seasonParam) ? seasonParam : context?.activeSeason,
        severity,
        message: message.trim(),
        context: {
          consoleErrors: getRecentErrors(),
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        },
      });
    },
    onSuccess: () => {
      toast.success('Feedback logged', {
        description: 'Screen, season and console errors were attached automatically.',
      });
      setMessage('');
      setOpen(false);
      clearErrorBuffer();
    },
    onError: () => toast.error('Could not save feedback'),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Log feedback about this screen"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <MessageSquarePlus className="h-5 w-5" />
        <span className="hidden text-sm font-medium sm:inline">Feedback</span>
        {recentErrors.length > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white"
            title={`${recentErrors.length} console errors will be attached`}
          >
            {recentErrors.length}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Feedback on {screenNameFor(location.pathname)}</DialogTitle>
            <DialogDescription>
              Just describe what you saw. The screen, the season you're viewing and any console
              errors get attached for you.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>How bad is it?</Label>
              <div className="grid grid-cols-2 gap-2">
                {SEVERITIES.map((option) => {
                  const Icon = option.icon;
                  const selected = severity === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSeverity(option.value)}
                      className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                        selected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{option.label}</span>
                        <span className="block text-xs text-muted-foreground">{option.hint}</span>
                      </span>
                      {selected && <Check className="ml-auto h-4 w-4 flex-shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedbackMessage">What happened?</Label>
              <Textarea
                id="feedbackMessage"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder={
                  'What you expected, and what you got instead.\n\ne.g. "Grade breakdown has no freshmen — 2024 team had about 20."'
                }
              />
            </div>

            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Attached automatically</p>
              <p>
                {location.pathname}
                {context?.activeSeason ? ` • season ${context.activeSeason}` : ''} •{' '}
                {window.innerWidth}×{window.innerHeight}
              </p>
              {recentErrors.length > 0 && (
                <p className="mt-1 text-destructive">
                  {recentErrors.length} recent console error
                  {recentErrors.length === 1 ? '' : 's'}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => submit.mutate()} disabled={!message.trim() || submit.isPending}>
              {submit.isPending ? 'Saving…' : 'Log feedback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FeedbackWidget;
