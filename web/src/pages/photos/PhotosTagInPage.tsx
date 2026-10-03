import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/apiError';
import { photosService } from '../../api/photosService';
import { getVolunteerToken, setVolunteerToken } from '../../lib/photosVolunteer';
import PhotosWorkspacePage from './PhotosWorkspacePage';

// Public entry point for the no-account tagging path — deliberately
// outside ProtectedRoute (router/index.tsx): there's no sign-in here at
// all, only the team's own shared password (set by a coach in the Load
// module — components/TagPasswordControl.tsx). Once unlocked, this
// renders the exact same PhotosWorkspacePage a signed-in account gets;
// PhotosWorkspaceProvider has no dependency on being signed in itself —
// it only talks to photosService, whose axios instance attaches whichever
// of a real Bearer token or the stored volunteer token applies (see
// api/axios.ts).
const PhotosTagInPage: React.FC = () => {
  const { athleticTeamId } = useParams<{ athleticTeamId: string }>();
  const [unlocked, setUnlocked] = useState(() => Boolean(athleticTeamId && getVolunteerToken(athleticTeamId)));
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!athleticTeamId) {
    return (
      <div className="dark fixed inset-0 flex items-center justify-center bg-ink text-center text-sm text-ink-muted">
        That tagging link looks incomplete.
      </div>
    );
  }

  if (unlocked) {
    return <PhotosWorkspacePage />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { token } = await photosService.volunteerLogin(athleticTeamId!, password.trim());
      setVolunteerToken(athleticTeamId!, token);
      setUnlocked(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "That didn't work — check the password and try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dark fixed inset-0 flex flex-col items-center justify-center gap-4 bg-ink px-6 text-center text-ink-foreground">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-border/40">
        <KeyRound className="h-5 w-5 text-ink-muted" />
      </div>
      <div>
        <div className="text-base font-semibold">Tag meet photos</div>
        <div className="mt-1 text-sm text-ink-muted">Enter the team's tagging password. No account needed.</div>
      </div>
      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col items-stretch gap-2">
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          disabled={submitting}
          className="w-full rounded-md bg-ink-border/40 px-3 py-2 text-sm text-ink-foreground outline-none placeholder:text-ink-muted disabled:opacity-60"
        />
        {error && <div className="text-xs text-destructive">{error}</div>}
        <Button type="submit" disabled={!password.trim() || submitting} className="gap-1.5">
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitting ? 'Checking…' : 'Continue'}
        </Button>
      </form>
    </div>
  );
};

export default PhotosTagInPage;
