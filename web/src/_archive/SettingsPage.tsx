import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import api from '@/api/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { MeetGroupsManager } from '@/components/settings/MeetGroupsManager';

const SettingsPage: React.FC = () => {
  const { currentUser, setCurrentUser } = useAuth();
  const currentTeam = currentUser?.team || null;

  // Component state
  const [teamName, setTeamName] = useState('');
  const [athleticTeamId, setAthleticTeamId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  // Sync state with data from currentUser.team
  useEffect(() => {
    if (currentTeam) {
      setTeamName(currentTeam.name || '');
      setAthleticTeamId(currentTeam.athleticTeamId || '');
    } else {
      // Reset fields if there's no team
      setTeamName('');
      setAthleticTeamId('');
    }
  }, [currentTeam]);

  // Handle save team settings
  const handleSaveTeamSettings = async () => {
    if (!teamName || !athleticTeamId) {
      toast.error('Please provide both Team Name and Athletic.net Team ID.');
      return;
    }

    setIsSaving(true);
    try {
      if (currentTeam) {
        await api.put(`/teams/${currentTeam._id}`, { name: teamName, athleticTeamId });
        toast.success('Team settings updated successfully');
        setIsEditing(false);
      } else {
        await api.post('/teams', { name: teamName, athleticTeamId });
        toast.success('Team created successfully');
      }
      // Refresh user to get updated team
      const me = await api.get('/users/me');
      if (me?.data) {
        setCurrentUser(me.data);
      }
    } catch (error) {
      console.error('Error saving team settings:', error);
      
      const isAxiosError = (err: unknown): err is { response?: { status: number, data?: { message?: string } } } => {
        return typeof err === 'object' && err !== null && 'response' in err;
      };

      if (isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || 'An unexpected error occurred.';
        if (status === 409) {
          toast.error('This Athletic.net Team ID is already in use.');
        } else if (status === 403) {
          toast.error('You do not have permission to perform this action.');
        } else {
          toast.error(message);
        }
      } else {
        toast.error('An unknown error occurred.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Handle clear data
  const handleJoinTeam = async () => {
    if (!joinCode) {
      toast.error('Please enter a join code.');
      return;
    }
    setIsSaving(true);
    try {
      await api.post('/teams/join', { joinCode });
      toast.success('Successfully joined team!');
      const me = await api.get('/users/me');
      if (me?.data) {
        setCurrentUser(me.data);
      }
    } catch (error) {
      console.error('Error joining team:', error);
      const isAxiosError = (err: unknown): err is { response?: { status: number, data?: { message?: string } } } => {
        return typeof err === 'object' && err !== null && 'response' in err;
      };

      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || 'Failed to join team.');
      } else {
        toast.error('An unknown error occurred.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearData = async () => {
    if (!currentTeam?.athleticTeamId) {
      toast.error('No team selected or team ID is missing.');
      return;
    }

    setIsClearing(true);
    try {
      // Clear data via API
      await api.delete(`/teams/${currentTeam.athleticTeamId}/results`);
      toast.success('Team data has been cleared successfully.');
    } catch (error) {
      console.error('Failed to clear team data', error);
      let errorMessage = 'An unknown error occurred.';
      
      const isAxiosError = (err: unknown): err is { response?: { data?: { message?: string } } } => {
        return typeof err === 'object' && err !== null && 'response' in err;
      };
      
      if (isAxiosError(error) && 
          error.response?.data && 
          typeof error.response.data === 'object' && 
          'message' in error.response.data) {
        errorMessage = String(error.response.data.message);
      }
      
      toast.error(`Failed to clear data: ${errorMessage}`);
    } finally {
      setIsClearing(false);
    }
  };

  // No separate loading/error gate; rely on auth and render UI accordingly

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      
      {/* Team Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Team Settings</CardTitle>
          <CardDescription>Manage your team information</CardDescription>
        </CardHeader>
        <CardContent>
          {!currentTeam && currentUser?.role === 'coach' ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">You are not yet part of a team. Create one to get started.</p>
              <div className="space-y-2">
                <Label htmlFor="teamName">Team Name</Label>
                <Input 
                  id="teamName" 
                  value={teamName} 
                  onChange={(e) => setTeamName(e.target.value)} 
                  placeholder="Enter team name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="athleticTeamId">Athletic.net Team ID</Label>
                <Input 
                  id="athleticTeamId" 
                  value={athleticTeamId} 
                  onChange={(e) => setAthleticTeamId(e.target.value)} 
                  placeholder="Enter Athletic.net Team ID"
                />
              </div>
              <Button 
                onClick={handleSaveTeamSettings}
                disabled={isSaving}
                className="relative"
              >
                {isSaving && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <div className="animate-spin h-5 w-5 border-b-2 border-white rounded-full"></div>
                  </span>
                )}
                <span className={isSaving ? 'invisible' : ''}>
                  Create Team
                </span>
              </Button>
            </div>
          ) : !currentTeam ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Have a join code? Enter it here to join your team.</p>
              <div className="space-y-2">
                <Label htmlFor="joinCode">Join Code</Label>
                <Input 
                  id="joinCode" 
                  value={joinCode} 
                  onChange={(e) => setJoinCode(e.target.value)} 
                  placeholder="Enter join code"
                />
              </div>
              <Button 
                onClick={handleJoinTeam}
                disabled={isSaving}
                className="relative"
              >
                {isSaving && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <div className="animate-spin h-5 w-5 border-b-2 border-white rounded-full"></div>
                  </span>
                )}
                <span className={isSaving ? 'invisible' : ''}>
                  Join Team
                </span>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="teamName">Team Name</Label>
                {isEditing ? (
                  <Input 
                    id="teamName" 
                    value={teamName} 
                    onChange={(e) => setTeamName(e.target.value)} 
                    placeholder="Enter team name"
                  />
                ) : (
                  <div className="p-2 border rounded-md bg-muted/50">{teamName || 'Not set'}</div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="athleticTeamId">Athletic.net Team ID</Label>
                {isEditing ? (
                  <Input 
                    id="athleticTeamId"
                    value={athleticTeamId} 
                    onChange={(e) => setAthleticTeamId(e.target.value)} 
                    placeholder="Enter Athletic.net Team ID"
                  />
                ) : (
                  <div className="p-2 border rounded-md bg-muted/50">{athleticTeamId || 'Not set'}</div>
                )}
                {!isEditing && (
                  <p className="text-xs text-muted-foreground mt-1">
                    This ID is used for importing data from Athletic.net
                  </p>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                {isEditing ? (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => setIsEditing(false)}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSaveTeamSettings}
                      disabled={isSaving}
                      className="relative"
                    >
                      {isSaving && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <div className="animate-spin h-5 w-5 border-b-2 border-white rounded-full"></div>
                        </span>
                      )}
                      <span className={isSaving ? 'invisible' : ''}>
                        Save Changes
                      </span>
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setIsEditing(true)}>
                    Edit Team Settings
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Meet Groups Manager - Only for coaches with a team */}
      {currentTeam && currentUser?.role === 'coach' && (
        <MeetGroupsManager teamId={currentTeam.id} />
      )}

      {/* Danger Zone Card */}
      <Card className="border-red-500 border-2">
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>These actions are permanent and cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold">Clear All Team Data</p>
              <p className="text-sm text-gray-500">This will delete all imported races, results, and athlete data for your team.</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isClearing}>
                  {isClearing ? 'Clearing...' : 'Clear Data'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete all results and race data for your team. It will not delete the team itself or its members.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearData} disabled={isClearing}>
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
