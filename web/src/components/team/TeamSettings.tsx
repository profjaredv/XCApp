import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useToast } from "../../components/ui/use-toast";
import { useMutation } from '@tanstack/react-query';
import { useTeam } from '../../hooks/useTeam';
import api from '../../api/api';

interface TeamSettingsProps {
  onSaved?: () => void;
}

interface TeamUpdateData {
  name: string;
  athleticTeamId: string;
}

interface TeamResponse {
  message: string;
  team: {
    _id: string;
    name: string;
    athleticTeamId: string;
  };
}

// API service for team operations
const teamService = {
  updateTeam: async (teamId: string, data: TeamUpdateData): Promise<TeamResponse> => {
    try {
      const response = await api.put<TeamResponse>(`/teams/${teamId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating team settings:', error);
      throw error;
    }
  }
};

export function TeamSettings({ onSaved }: TeamSettingsProps) {
  const { toast } = useToast();
  const { currentTeam, loading } = useTeam();
  const [teamName, setTeamName] = useState('');
  const [athleticTeamId, setAthleticTeamId] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Set up the mutation
  const updateTeamMutation = useMutation<TeamResponse, Error, TeamUpdateData>({
    mutationFn: (data: TeamUpdateData) => {
      if (!currentTeam?.id) {
        throw new Error('No team ID available');
      }
      return teamService.updateTeam(currentTeam.id, data);
    }
  });

  // Load current team data
  useEffect(() => {
    if (currentTeam) {
      console.log('Setting team data from currentTeam:', currentTeam);
      setTeamName(currentTeam.name || '');
      setAthleticTeamId(currentTeam.athleticTeamId || '');
    }
  }, [currentTeam]);

  const handleSave = async () => {
    if (!teamName || !athleticTeamId) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please provide both Team Name and Athletic.net Team ID.",
      });
      return;
    }

    try {
      await updateTeamMutation.mutateAsync({
        name: teamName,
        athleticTeamId
      });
      
      setIsEditing(false);
      toast({
        title: "Team Settings Saved",
        description: "Your team settings have been updated successfully.",
      });
      
      if (onSaved) {
        onSaved();
      }
    } catch (error) {
      console.error('Error saving team settings:', error);
      
      // Handle specific error cases
      const isAxiosError = (err: unknown): err is { response?: { status: number } } => {
        return typeof err === 'object' && err !== null && 'response' in err;
      };
      
      if (isAxiosError(error) && error.response?.status === 409) {
        toast({
          variant: "destructive",
          title: "Athletic.net Team ID Already In Use",
          description: "Another team is already using this Athletic.net Team ID. Please use a different ID.",
        });
      } else if (isAxiosError(error) && error.response?.status === 403) {
        toast({
          variant: "destructive",
          title: "Permission Denied",
          description: "You don't have permission to update this team's settings.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error Saving Team Settings",
          description: error instanceof Error ? error.message : 'An unknown error occurred',
        });
      }
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Team Settings</CardTitle>
          <CardDescription>Loading team information...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If there's no team data but we're not loading, create a new team
  if (!currentTeam && !loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Team Settings</CardTitle>
          <CardDescription>Create your team</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
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
              <p className="text-xs text-muted-foreground mt-1">
                This ID is used for importing data from Athletic.net
              </p>
            </div>
            
            <Button 
              onClick={handleSave}
              disabled={updateTeamMutation.isPending || !teamName || !athleticTeamId}
              className="w-full mt-4"
            >
              Create Team
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Team Settings</CardTitle>
        <CardDescription>
          {isEditing 
            ? "Edit your team information below" 
            : "View and manage your team settings"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
      <CardFooter className="flex justify-end space-x-2">
        {isEditing ? (
          <>
            <Button 
              variant="outline" 
              onClick={() => setIsEditing(false)}
              disabled={updateTeamMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={updateTeamMutation.isPending}
              className="relative"
            >
              {updateTeamMutation.isPending && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
              )}
              <span className={updateTeamMutation.isPending ? 'invisible' : ''}>
                Save Changes
              </span>
            </Button>
          </>
        ) : (
          <Button onClick={() => setIsEditing(true)}>
            Edit Settings
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export default TeamSettings;
