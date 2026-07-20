import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { axiosInstance } from '@/api/axios';

const OnboardingPage: React.FC = () => {
  const [step, setStep] = useState<'choice' | 'join' | 'create'>('choice');
  const [joinCode, setJoinCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [athleticTeamId, setAthleticTeamId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!joinCode.trim()) {
      setError('Please enter a join code.');
      setLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }

      const response = await axiosInstance.post(
        '/profile/join-team',
        { joinCode }
      );

      if (response.data.success) {
        navigate('/analytics');
      } else {
        throw new Error(response.data.message || 'Failed to join team');
      }
    } catch (err: any) {
      if (err.response?.status === 404 || err.response?.data?.message?.includes('not found')) {
        setError('Invalid or expired join code. Would you like to create a new team instead?');
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to join team.');
      }
      console.error(err);
    }

    setLoading(false);
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!teamName.trim() || !athleticTeamId.trim()) {
      setError('Please enter both team name and Athletic.net Team ID.');
      setLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }

      const response = await axiosInstance.post(
        '/teams',
        { name: teamName, athleticTeamId }
      );

      if (response.data.success) {
        navigate('/analytics');
      } else {
        throw new Error(response.data.message || 'Failed to create team');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create team.');
      console.error(err);
    }

    setLoading(false);
  };

  if (step === 'choice') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Card className="mx-auto max-w-lg w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome to LeadPack XC!</CardTitle>
            <CardDescription>Let's get you set up with your team</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => setStep('join')}
              className="w-full h-20 text-lg"
              variant="outline"
            >
              <div className="text-center">
                <div className="font-semibold">Join an Existing Team</div>
                <div className="text-sm font-normal text-muted-foreground">I have a join code from my coach</div>
              </div>
            </Button>

            <Button
              onClick={() => setStep('create')}
              className="w-full h-20 text-lg"
              variant="outline"
            >
              <div className="text-center">
                <div className="font-semibold">Set Up a New Team</div>
                <div className="text-sm font-normal text-muted-foreground">I'm a coach creating a team</div>
              </div>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'join') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Card className="mx-auto max-w-md w-full">
          <CardHeader>
            <CardTitle>Join Your Team</CardTitle>
            <CardDescription>Enter the join code provided by your coach</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleJoinTeam} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="join-code">Join Code</Label>
                <Input
                  id="join-code"
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Enter join code"
                  required
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setStep('choice'); setError(''); }}
                  className="w-full"
                >
                  Back
                </Button>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Joining...' : 'Join Team'}
                </Button>
              </div>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setStep('create'); setError(''); }}
                className="text-sm text-blue-600 hover:underline"
              >
                Need to create a team instead?
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="mx-auto max-w-md w-full">
        <CardHeader>
          <CardTitle>Create Your Team</CardTitle>
          <CardDescription>Set up your cross country team</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleCreateTeam} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Lincoln High School XC"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="athletic-team-id">Athletic.net Team ID</Label>
              <Input
                id="athletic-team-id"
                type="text"
                value={athleticTeamId}
                onChange={(e) => setAthleticTeamId(e.target.value)}
                placeholder="e.g. 12345"
                required
              />
              <p className="text-xs text-muted-foreground">
                Find your team ID on Athletic.net in your team's URL
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setStep('choice'); setError(''); }}
                className="w-full"
              >
                Back
              </Button>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Creating...' : 'Create Team'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default OnboardingPage;
