import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Heart, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { authClient } from '@/lib/auth';
import { parentService } from '@/api/parentService';
import { getApiErrorMessage } from '@/lib/apiError';

// /parent-invite/<token>: a coach invited this parent by email with the
// runners already chosen, so accepting needs no further approval. The
// server only accepts it from an account with that same email; this page
// says which address that is when someone opens it signed in as another.

const ParentInviteAcceptPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { currentUser, loading } = useAuth();
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);

  const { data: preview, isLoading, error: loadError } = useQuery({
    queryKey: ['parent-invite', token],
    queryFn: () => parentService.previewInvite(token as string),
    enabled: Boolean(token && currentUser),
    retry: false,
  });

  const accept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);
    try {
      const result = await parentService.acceptInvite(token);
      setDone(result.msg);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not accept this invite.'));
    }
    setAccepting(false);
  };

  // The invite is the approval; once the right person is signed in there is nothing to decide.
  useEffect(() => {
    if (preview?.emailMatches && !preview.expired && preview.status !== 'revoked' && !tried.current) {
      tried.current = true;
      void accept();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  const toAuth = (target: 'register' | 'login') => {
    sessionStorage.setItem('redirectUrl', window.location.pathname);
    navigate(`/${target}`);
  };

  let body: React.ReactNode;
  if (loading || (currentUser && isLoading) || accepting) {
    body = <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />;
  } else if (!currentUser) {
    body = (
      <div className="space-y-3">
        <Button className="w-full" onClick={() => toAuth('register')}>
          Create my account
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button variant="outline" className="w-full" onClick={() => toAuth('login')}>
          I already have an account
        </Button>
        <p className="text-xs text-muted-foreground">Use the email address this invite was sent to.</p>
      </div>
    );
  } else if (done) {
    body = (
      <div className="space-y-3">
        <Alert>
          <AlertDescription>{done}</AlertDescription>
        </Alert>
        <Button className="w-full" onClick={() => navigate('/my-runners')}>
          See my runners
        </Button>
      </div>
    );
  } else if (loadError) {
    body = (
      <Alert variant="destructive">
        <AlertDescription>{getApiErrorMessage(loadError, 'This invite is no longer valid.')}</AlertDescription>
      </Alert>
    );
  } else if (preview && !preview.emailMatches) {
    body = (
      <div className="space-y-3">
        <Alert variant="destructive">
          <AlertDescription>
            This invite was sent to {preview.sentTo}, but you’re signed in as {currentUser.email}. Sign in with that
            address, or ask the coach to send it to the one you use.
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="w-full" onClick={() => authClient.signOut()}>
          Sign out
        </Button>
      </div>
    );
  } else if (preview?.expired) {
    body = (
      <Alert variant="destructive">
        <AlertDescription>This invite has expired. Ask the coach at {preview.teamName} to send it again.</AlertDescription>
      </Alert>
    );
  } else {
    body = error ? (
      <div className="space-y-3">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button className="w-full" onClick={accept}>
          Try again
        </Button>
      </div>
    ) : null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-secondary p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Heart className="mb-2 h-8 w-8 text-primary" />
          <CardTitle className="text-2xl">
            {preview?.athletes.length ? `Follow ${preview.athletes.map((a) => a.name).join(' and ')}` : 'You’re invited to follow your runner'}
          </CardTitle>
          <CardDescription>
            {preview?.teamName
              ? `A coach at ${preview.teamName} invited you to see meets and results on LeadPack.`
              : 'A coach invited you to see your runner’s meets and results on LeadPack.'}
          </CardDescription>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  );
};

export default ParentInviteAcceptPage;
