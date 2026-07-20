import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

const InviteAcceptPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { currentUser, acceptInvite } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'requires_auth'>('loading');
  const [message, setMessage] = useState<string>('');
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    const handleInviteAcceptance = async () => {
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
        const response = await acceptInvite(token);
        
        if (response && typeof response === 'object' && 'msg' in response) {
          setStatus('success');
          setMessage(response.msg as string);
          setAthleteId((response as { athleteId?: string }).athleteId || null);
          setTeamId((response as { teamId?: string }).teamId || null);
        } else {
          setStatus('success');
          setMessage('Invitation accepted successfully!');
        }
      } catch (error) {
        console.error('Error accepting invitation:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Failed to accept invitation.');
      }
    };

    handleInviteAcceptance();
  }, [token, currentUser, acceptInvite]);

  const handleContinue = () => {
    if (athleteId && teamId) {
      navigate(`/team/${teamId}/athlete/${athleteId}`);
    } else {
      navigate('/analytics');
    }
  };

  const handleSignIn = () => {
    // Store the current URL so we can redirect back after sign in
    sessionStorage.setItem('redirectUrl', window.location.pathname);
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="mx-auto max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Team Invitation</CardTitle>
          <CardDescription>
            You've been invited to join a cross country team on LeadPack XC
          </CardDescription>
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
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center">
                  You now have access to:
                </p>
                <ul className="text-sm space-y-1">
                  <li>• Team analytics and performance data</li>
                  <li>• Race results and history</li>
                  <li>• Your personal athlete profile</li>
                  <li>• Training tools and calculators</li>
                </ul>
              </div>
              <Button onClick={handleContinue} className="w-full">
                Continue to Dashboard
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

export default InviteAcceptPage;
