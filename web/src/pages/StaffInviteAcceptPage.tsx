import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { getApiErrorMessage } from '../lib/apiError';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

// Accept half of the T1 staff-invite flow (see UpgradeRolePage for context
// on what this replaced). Deliberately mirrors InviteAcceptPage.tsx's
// shape — same loading/requires_auth/success/error states — since the
// underlying flow (a token identifies what's being granted, the signed-in
// session identifies who's accepting it) is the same pattern.
const StaffInviteAcceptPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { currentUser, acceptStaffInvite } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'requires_auth'>('loading');
  const [message, setMessage] = useState<string>('');
  // Accepting an invite must happen ONCE per token, and this effect cannot
  // be trusted to run once on its own: it depends on `currentUser` and on
  // the accept function, and the accept call itself refreshes currentUser
  // (AuthProvider builds a brand-new user object and a brand-new function
  // identity on every render). So the successful first call immediately
  // re-triggered the effect, the second POST found the invite already
  // marked accepted, the backend correctly answered "no longer valid", and
  // the page flipped from success to a red error — while the account had
  // in fact joined the team perfectly. That is the reported "signed up,
  // then got an invalid/unauthorized link" bug.
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
        const response = await acceptStaffInvite(token);
        setStatus('success');
        setMessage(
          response && typeof response === 'object' && 'msg' in response
            ? ((response as { msg: string }).msg)
            : 'Invitation accepted successfully!'
        );
      } catch (error) {
        console.error('Error accepting staff invitation:', error);
        setStatus('error');
        setMessage(getApiErrorMessage(error, 'Failed to accept invitation.'));
      }
    };

    handleAcceptance();
  }, [token, currentUser, acceptStaffInvite]);

  const handleSignIn = () => {
    sessionStorage.setItem('redirectUrl', window.location.pathname);
    navigate('/login');
  };

  const handleCreateAccount = () => {
    sessionStorage.setItem('redirectUrl', window.location.pathname);
    navigate('/register');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="mx-auto max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Staff Invitation</CardTitle>
          <CardDescription>You've been invited to join a coaching staff on LeadPack XC</CardDescription>
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
              <Button onClick={() => navigate('/profile')} className="w-full">
                Continue
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

export default StaffInviteAcceptPage;
