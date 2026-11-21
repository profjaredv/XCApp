import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Heart, KeyRound, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/axios';
import { teamService } from '@/api/teamService';
import { parentJoinLink } from '@/api/parentService';

// Lifted out of the Roster page. Handing out a join code is team setup —
// something a coach does once at the start of a season — not roster work,
// which is what a coach opens that page for at practice, on a phone,
// looking for one athlete. It sat above the roster itself and pushed the
// list off the screen every single visit for a one-time task.
//
// The code is the same for athletes and parents; what differs is where it
// takes them. Athletes type the code. Parents get a link that opens the
// parent sign-up with the code already in it.
//
// It shows the team's CURRENT code. It used to show nothing until you
// pressed Generate, and Generate makes a new code — so a coach checking
// the code they had already handed out quietly broke it for everyone.

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Could not copy. Select the text and copy it yourself.');
  }
};

export const TeamJoinCodeCard: React.FC = () => {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: joinCode, isLoading } = useQuery({
    queryKey: ['team-join-code'],
    queryFn: async () => ((await api.get<{ joinCode?: string | null }>('/teams/current')).data.joinCode ?? null),
  });

  const handleGenerate = async () => {
    if (
      joinCode &&
      !window.confirm('Make a new code? The current code and parent link stop working for anyone who hasn’t used them yet.')
    ) {
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const response = await teamService.generateJoinCode();
      queryClient.setQueryData(['team-join-code'], response.joinCode);
      toast.success('New join code made');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate join code');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5" />
          Team Join Code
        </CardTitle>
        <CardDescription>One code for your team. Athletes type it; parents get a link with it built in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? null : joinCode ? (
          <>
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Users className="h-4 w-4 text-muted-foreground" /> Athletes
              </p>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-3">
                <span className="min-w-0 truncate font-mono text-lg font-semibold">{joinCode}</span>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => copy(joinCode, 'Join code')}>
                  Copy code
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">They sign up, enter the code, and claim their roster profile.</p>
            </div>

            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Heart className="h-4 w-4 text-muted-foreground" /> Parents
              </p>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-3">
                <span className="min-w-0 truncate text-sm">{parentJoinLink(joinCode)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => copy(parentJoinLink(joinCode), 'Parent link')}
                >
                  Copy link
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                For a team email or group text. Parents pick their runner and you approve each one below. To skip the
                approval, invite a parent directly instead.
              </p>
            </div>

            <Button variant="ghost" size="sm" className="-ml-2" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? 'Making a new code…' : 'Make a new code'}
            </Button>
          </>
        ) : (
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? 'Generating…' : 'Generate Join Code'}
          </Button>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default TeamJoinCodeCard;
