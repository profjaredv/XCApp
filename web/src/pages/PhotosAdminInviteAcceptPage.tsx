import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { getApiErrorMessage } from '../lib/apiError';
import { photosService } from '../api/photosService';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

// Accept half of the Photos Admin invite flow (backend's PhotosAdmin —
// full Load/Tag/Build authority in the Photos module only, for anyone a
// coach invites, not just a coach). Mirrors StaffInviteAcceptPage.tsx's
// shape, but calls photosService directly rather than going through
// AuthContext: accepting never changes this account's team membership
// (user.teamId stays null, same as a guardian — see backend's PhotosAdmin
// schema comment), so there's no currentUser refresh to coordinate here.
const PhotosAdminInviteAcceptPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'requires_auth'>('loading');
  const [message, setMessage] = useState<string>('');
  const [athleticTeamId, setAthleticTeamId] = useState<string | null>(null);
  // Same "accept exactly once per token" guard as StaffInviteAcceptPage —
  // see that file's own comment for the bug this prevents.
  const attemptedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const handleAcceptance = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Invalid invitation link.');
        return;
      }

      if (!currentUser) {
        setStatus('requires_auth');
        setMessage('Please sign in to accept this invitation.');
        return;
      }

      if (attemptedTokenRef.current === token) return;
      attemptedTokenRef.current = token;

      try {
        setStatus('loading');
        const response = await photosService.acceptPhotosAdminInvite(token);
        setStatus('success');
        setMessage(response.msg);
        setAthleticTeamId(response.athleticTeamId);
      } catch (error) {
        console.error('Error accepting Photos Admin invitation:', error);
        setStatus('error');
        setMessage(getApiErrorMessage(error, 'Failed to accept invitation.'));
      }
    };

    handleAcceptance();
  }, [token, currentUser]);

  const handleSignIn = () => {
    sessionStorage.setItem('redirectUrl', window.location.pathname);
    navigate('/login');
  };

  const handleCreateAccount = () => {
    sessionStorage.setItem('redirectUrl', window.location.pathname);
    navigate('/register');
  };

  const handleContinue = () => {
    if (athleticTeamId) navigate(`/t/${athleticTeamId}/photos`);
    else navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="mx-auto max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Photos Invitation</CardTitle>
          <CardDescription>You've been invited to load, tag, and build photo collages on LeadPack XC</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'loading' && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Processing invitation...</span>
            </div>
          )}

          {status === 'requires_auth' && (
            <>
              <Alert>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
              <Button onClick={handleCreateAccount} className="w-full">
                Create an Account to Accept
              </Button>
              <Button onClick={handleSignIn} variant="outline" className="w-full">
                I already have an account — Sign In
              </Button>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="flex items-center justify-center py-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <Alert>
                <AlertDescription className="text-center">{message}</AlertDescription>
              </Alert>
              <p className="text-center text-sm text-muted-foreground">
                No coaching access — just the Photos module (Load, Tag, and Build).
              </p>
              <Button onClick={handleContinue} className="w-full">
                Continue to Photos
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="flex items-center justify-center py-4">
                <XCircle className="h-12 w-12 text-red-500" />
              </div>
              <Alert variant="destructive">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate('/login')} className="flex-1">
                  Sign In
                </Button>
                <Button variant="outline" onClick={() => navigate('/')} className="flex-1">
                  Go Home
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PhotosAdminInviteAcceptPage;
