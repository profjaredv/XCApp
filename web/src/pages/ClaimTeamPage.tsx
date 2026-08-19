import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { teamClaimService, type TeamClaimPreview } from '../api/teamClaimService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Loader2, XCircle } from 'lucide-react';

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message === 'string'
  ) {
    return (error as { response: { data: { message: string } } }).response.data.message;
  }
  return error instanceof Error ? error.message : fallback;
}

// F3 (LeadPack Master Build Handoff): the claim page. Public — shows the
// team name and masked email before sign-in, same as GET /api/team-claims/:token
// itself. Claiming is an explicit click, not auto-fired on mount, since the
// copy below is a real attestation the coach is meant to read first.
const ClaimTeamPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { currentUser, claimTeam } = useAuth();

  const [preview, setPreview] = useState<TeamClaimPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPreviewError('Invalid claim link.');
      setLoadingPreview(false);
      return;
    }
    teamClaimService
      .getClaim(token)
      .then((data) => setPreview(data))
      .catch((error) => setPreviewError(getErrorMessage(error, 'This claim link is no longer valid.')))
      .finally(() => setLoadingPreview(false));
  }, [token]);

  const handleSignIn = () => {
    sessionStorage.setItem('redirectUrl', window.location.pathname);
    navigate('/login');
  };

  const handleCreateAccount = () => {
    sessionStorage.setItem('redirectUrl', window.location.pathname);
    navigate('/register');
  };

  const handleClaim = async () => {
    if (!token) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const result = await claimTeam(token);
      navigate(`/t/${result.athleticTeamId}/checkout`);
    } catch (error) {
      setClaimError(getErrorMessage(error, 'Could not claim this team.'));
      setClaiming(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <Card className="mx-auto max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Claim Your Team</CardTitle>
          {preview && <CardDescription>Claiming for {preview.teamName}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingPreview && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading...</span>
            </div>
          )}

          {!loadingPreview && previewError && (
            <>
              <div className="flex items-center justify-center py-4">
                <XCircle className="h-12 w-12 text-red-500" />
              </div>
              <Alert variant="destructive">
                <AlertDescription>{previewError}</AlertDescription>
              </Alert>
              <Button variant="outline" onClick={() => navigate('/')} className="w-full">
                Go Home
              </Button>
            </>
          )}

          {!loadingPreview && preview && (
            <>
              <p className="text-sm text-muted-foreground">
                This link is sent to <strong>{preview.maskedEmail}</strong>.
              </p>
              <Alert>
                <AlertDescription>
                  This link is for the head coach of {preview.teamName}, or someone with their explicit
                  authorization to manage the team on their behalf. If that isn't you, please don't continue.
                </AlertDescription>
              </Alert>

              {claimError && (
                <Alert variant="destructive">
                  <AlertDescription>{claimError}</AlertDescription>
                </Alert>
              )}

              {!currentUser ? (
                <>
                  <Button onClick={handleCreateAccount} className="w-full">
                    Create an Account to Claim
                  </Button>
                  <Button onClick={handleSignIn} variant="outline" className="w-full">
                    I already have an account — Sign In
                  </Button>
                </>
              ) : (
                <Button onClick={handleClaim} disabled={claiming} className="w-full">
                  {claiming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Claim {preview.teamName}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ClaimTeamPage;
