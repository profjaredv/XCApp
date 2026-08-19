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
import { useWalkthrough } from '@/contexts/WalkthroughContext';
import { MeetGroupsManager } from '@/components/settings/MeetGroupsManager';
import { StaffManager } from '@/components/settings/StaffManager';

interface Team {
  id: string;
  name: string;
  athleticTeamId?: string;
  currentSeason?: number;
}

const SimpleSettingsPage: React.FC = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { role: walkthroughRole, open: openWalkthrough } = useWalkthrough();

  // Team settings state
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamName, setTeamName] = useState('');
  const [athleticTeamId, setAthleticTeamId] = useState('');
  const [currentSeason, setCurrentSeason] = useState<number>(new Date().getFullYear());
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Danger zone state
  const [isClearing, setIsClearing] = useState(false);

  // Load team data
  useEffect(() => {
    const fetchTeam = async () => {
      if (authLoading) return; // Wait for authentication to complete
      if (!currentUser) {
        setLoading(false);
        return; // User not logged in, do nothing
      }

      try {
        setLoading(true);
        const response = await api.get('/teams/current');
        if (response.data && typeof response.data === 'object' && 'id' in response.data) {
          const teamData = {
            id: response.data.id,
            name: response.data.name || '',
            athleticTeamId: response.data.athleticTeamId || '',
            currentSeason: response.data.current_season
          };
          setTeam(teamData);
          setTeamName(teamData.name);
          setAthleticTeamId(teamData.athleticTeamId || '');
          setCurrentSeason(teamData.currentSeason || new Date().getFullYear());
        } else {
          setTeam(null);
        }
      } catch (error) {
        console.error('Error fetching team:', error);
        setTeam(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTeam();
  }, [currentUser, authLoading]);

  // Handle save team settings
  const handleSaveTeamSettings = async () => {
    if (!teamName || !athleticTeamId) {
      toast.error('Please provide both Team Name and Athletic.net Team ID.');
      return;
    }

    if (!team?.id) {
      toast.error('No team ID available');
      return;
    }

    setIsSaving(true);
    try {
      // Save to API
      await api.put(`/teams/${team.id}`, {
        name: teamName,
        athleticTeamId,
        current_season: currentSeason
      });
      
      toast.success('Team settings saved successfully');
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving team settings:', error);
      
      // Handle specific error cases
      const isAxiosError = (err: unknown): err is { response?: { status: number } } => {
        return typeof err === 'object' && err !== null && 'response' in err;
      };
      
      if (isAxiosError(error) && error.response?.status === 409) {
        toast.error('Another team is already using this Athletic.net Team ID. Please use a different ID.');
      } else if (isAxiosError(error) && error.response?.status === 403) {
        toast.error('You don\'t have permission to update this team\'s settings.');
      } else {
        toast.error(error instanceof Error ? error.message : 'An unknown error occurred');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Handle clear data
  const handleClearData = async () => {
    if (!team?.athleticTeamId) {
      toast.error('No team selected or team ID is missing.');
      return;
    }

    setIsClearing(true);
    try {
      // Clear data via API
      await api.delete(`/teams/${team.athleticTeamId}/results`);
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
          {loading ? (
            <div className="flex items-center justify-center p-6">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : !team ? (
            <div className="p-4 border border-red-200 rounded-md bg-red-50 text-red-700">
              <p>No team information available. Please contact support.</p>
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
              
              <div className="space-y-2">
                <Label htmlFor="currentSeason">Current Season</Label>
                {isEditing ? (
                  <Input 
                    id="currentSeason" 
                    type="number"
                    value={currentSeason} 
                    onChange={(e) => setCurrentSeason(parseInt(e.target.value) || new Date().getFullYear())} 
                    placeholder="Enter season year (e.g., 2024)"
                  />
                ) : (
                  <div className="p-2 border rounded-md bg-muted/50">{currentSeason || 'Not set'}</div>
                )}
                {!isEditing && (
                  <p className="text-xs text-muted-foreground mt-1">
                    This season is used for Coaches Tools and analytics
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
      
      {/* Feature tour - only when we have a walkthrough for this account's role */}
      {walkthroughRole && (
        <Card>
          <CardHeader>
            <CardTitle>Feature Tour</CardTitle>
            <CardDescription>Revisit the walkthrough you saw (or skipped) the first time you signed in.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={openWalkthrough}>
              Take the Tour Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Staff - Only for coaches with a team */}
      {team && currentUser?.role === 'coach' && <StaffManager />}

      {/* Meet Groups Manager - Only for coaches with a team */}
      {team && currentUser?.role === 'coach' && (
        <MeetGroupsManager teamId={team.id} />
      )}

      {/* Danger Zone Card — backend only ever lets HEAD_COACH (or an
          impersonating super admin) actually clear team data
          (routes/teams.js), so it's hidden entirely for everyone else
          rather than shown and then 403ing on click. */}
      {(currentUser?.isSuperAdmin || currentUser?.teamRole === 'HEAD_COACH') && (
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
      )}
    </div>
  );
};

export default SimpleSettingsPage;
