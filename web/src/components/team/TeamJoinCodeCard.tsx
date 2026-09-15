import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { teamService } from '@/api/teamService';

// Lifted out of the Roster page. Handing out a join code is team setup —
// something a coach does once at the start of a season — not roster work,
// which is what a coach opens that page for at practice, on a phone,
// looking for one athlete. It sat above the roster itself and pushed the
// list off the screen every single visit for a one-time task.

export const TeamJoinCodeCard: React.FC = () => {
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await teamService.generateJoinCode();
      setJoinCode(response.joinCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate join code');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!joinCode || typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(joinCode);
    toast.success('Join code copied to clipboard');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5" />
          Team Join Code
        </CardTitle>
        <CardDescription>
          Generate a code athletes can use to join the team and claim their roster profile.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {joinCode ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-3">
              <span className="min-w-0 truncate font-mono text-lg font-semibold">{joinCode}</span>
              <Button size="sm" variant="outline" className="shrink-0" onClick={handleCopy}>
                Copy Code
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this code with athletes so they can join the team and claim their profile.
            </p>
          </div>
        ) : (
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? 'Generating…' : 'Generate Join Code'}
          </Button>
        )}
        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default TeamJoinCodeCard;
