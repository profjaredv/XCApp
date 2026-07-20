import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { teamService, type JoinTeamResponse } from '@/api/teamService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, CheckCircle } from 'lucide-react';

const JoinTeamPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [joinCode, setJoinCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinResult, setJoinResult] = useState<JoinTeamResponse | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [claimStatus, setClaimStatus] = useState<'idle' | 'claiming' | 'claimed'>('idle');

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await teamService.joinTeam(joinCode.trim());
      setJoinResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join team');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaimProfile = async (athleteId: string) => {
    if (!athleteId) return;

    setClaimStatus('claiming');
    setError(null);

    try {
      await teamService.claimProfile(athleteId);
      setSelectedProfile(athleteId);
      setClaimStatus('claimed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim profile');
      setClaimStatus('idle');
    }
  };

  const handleContinue = () => {
    navigate('/analytics');
  };

  const calculateMatchScore = (athleteName: string, userName: string) => {
    if (!athleteName || !userName) return 0;
    
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z]/g, '');
    const n1 = normalize(athleteName);
    const n2 = normalize(userName);
    
    if (n1 === n2) return 100;
    if (n1.includes(n2) || n2.includes(n1)) return 80;
    
    // Simple similarity calculation
    const maxLength = Math.max(n1.length, n2.length);
    if (maxLength === 0) return 100;
    
    let matches = 0;
    for (let i = 0; i < Math.min(n1.length, n2.length); i++) {
      if (n1[i] === n2[i]) matches++;
    }
    
    return Math.round((matches / maxLength) * 100);
  };

  const userName = currentUser?.name || currentUser?.email?.split('@')[0] || '';

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Card className="mx-auto max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>Please sign in to join a team</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/login')} className="w-full">
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="mx-auto max-w-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Users className="h-12 w-12 text-blue-500" />
          </div>
          <CardTitle className="text-2xl">Join Your Team</CardTitle>
          <CardDescription>
            Enter the team join code provided by your coach
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!joinResult ? (
            // Step 1: Enter join code
            <form onSubmit={handleJoinTeam} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="joinCode">Team Join Code</Label>
                <Input
                  id="joinCode"
                  type="text"
                  placeholder="e.g., LIONS2024AB"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="text-center font-mono text-lg"
                  maxLength={12}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Ask your coach for the team join code
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={isLoading || !joinCode.trim()} className="w-full">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Joining Team...
                  </>
                ) : (
                  'Join Team'
                )}
              </Button>
            </form>
          ) : (
            // Step 2: Claim athlete profile
            <div className="space-y-6">
              <div className="text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-green-700">
                  Successfully joined {joinResult.teamName}!
                </h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Now claim your athlete profile to access your performance data
                </p>
              </div>

              {joinResult.availableProfiles.length > 0 ? (
                <div className="space-y-4">
                  <h4 className="font-medium">Select Your Profile:</h4>
                  <div className="space-y-2">
                    {joinResult.availableProfiles
                      .map(profile => ({
                        ...profile,
                        matchScore: calculateMatchScore(profile.name, userName)
                      }))
                      .sort((a, b) => b.matchScore - a.matchScore)
                      .map((profile) => (
                        <div
                          key={profile._id}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedProfile === profile._id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => !claimStatus && setSelectedProfile(profile._id)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{profile.name}</p>
                              {profile.matchScore > 60 && (
                                <Badge variant="secondary" className="text-xs mt-1">
                                  {profile.matchScore}% match
                                </Badge>
                              )}
                            </div>
                            {selectedProfile === profile._id && claimStatus === 'claimed' && (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            )}
                          </div>
                        </div>
                      ))}
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {claimStatus === 'claimed' ? (
                    <div className="space-y-4">
                      <Alert>
                        <AlertDescription>
                          Profile claim submitted! Your coach will review and approve the request.
                          You'll have full access once approved.
                        </AlertDescription>
                      </Alert>
                      <Button onClick={handleContinue} className="w-full">
                        Continue to Dashboard
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => selectedProfile && handleClaimProfile(selectedProfile)}
                      disabled={!selectedProfile || claimStatus === 'claiming'}
                      className="w-full"
                    >
                      {claimStatus === 'claiming' ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Claiming Profile...
                        </>
                      ) : (
                        'Claim Selected Profile'
                      )}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground">
                    No unclaimed profiles found. Contact your coach if you think this is an error.
                  </p>
                  <Button onClick={handleContinue} variant="outline" className="w-full">
                    Continue to Dashboard
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinTeamPage;
