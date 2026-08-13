import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

// axios's own error.message is a generic "Request failed with status code
// 404" — the useful text ("This invite has expired", "no longer valid",
// etc.) is in the JSON body the backend sent, which axios only exposes
// under response.data.
function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { data?: { msg?: string } } }).response?.data?.msg === 'string'
  ) {
    return (error as { response: { data: { msg: string } } }).response.data.msg;
  }
  return error instanceof Error ? error.message : 'Failed to accept invitation.';
}

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
        setMessage(getErrorMessage(error));
      }
    };

    handleAcceptance();
  }, [token, currentUser, acceptStaffInvite]);

  const handleSignIn = () => {
    sessionStorage.setItem('redirectUrl', window.location.pathname);
    navigate('/login');
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
              <Button onClick={handleSignIn} className="w-full">
                Sign In to Accept Invitation
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
