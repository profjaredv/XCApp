import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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
import { PaceZonesManager } from '@/components/settings/PaceZonesManager';
import { DataExportCard } from '@/components/settings/DataExportCard';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { DataPracticesCard } from '@/components/settings/DataPracticesCard';
import { useExpandedSections } from '@/hooks/useExpandedSections';
import { isFullCoach, canDeleteData, isImpersonatingAdmin } from '@/lib/teamRole';
import { Users, UserCog, Gauge, Flag, Download, Compass, AlertTriangle, ShieldCheck } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  athleticTeamId?: string;
  currentSeason?: number;
}

const SimpleSettingsPage: React.FC = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { role: walkthroughRole, open: openWalkthrough } = useWalkthrough();
  const { isOpen, isMounted, toggle } = useExpandedSections('xc_settings_open_sections');
  const canEditTeam = isFullCoach(currentUser) || isImpersonatingAdmin(currentUser);

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
            // camelCase, matching what the API actually returns. Reading
            // current_season here always produced undefined, so the field
            // below silently defaulted to the current calendar year and
            // saving overwrote the team's real season with it.
            currentSeason: response.data.currentSeason
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
        currentSeason
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
      <div>
        <h1 className="text-3xl font-bold md:text-4xl">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Open a section to change it. Everything else stays out of the way.
        </p>
      </div>

      {/* A grid rather than a stack: closed, the whole of Settings fits on
          one screen and reads as a menu. An open section takes the full
          width (see SettingsSection), because the forms inside were built
          for it. */}
      <div className="grid gap-4 md:grid-cols-2">
        <SettingsSection
          id="team"
          title="Team"
          description="Name, Athletic.net ID and current season."
          icon={Users}
          summary={team ? `${team.name}${team.currentSeason ? ` \u00b7 ${team.currentSeason} season` : ''}` : undefined}
          open={isOpen('team')}
          onToggle={() => toggle('team')}
        >
          {isMounted('team') && (
            <div>
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

              {/* PUT /api/teams/:id is requireRole(FULL_COACH), so a
                  volunteer coach who reaches this screen directly gets the
                  read-only view rather than an Edit button that can only
                  403. */}
              <div className="flex justify-end space-x-2 pt-4">
                {!canEditTeam ? null : isEditing ? (
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
            </div>
          )}
        </SettingsSection>

        {team && (isFullCoach(currentUser) || isImpersonatingAdmin(currentUser)) && (
          <SettingsSection
            id="staff"
            title="Staff"
            description="Invite coaches and volunteers, and manage their access."
            icon={UserCog}
            open={isOpen('staff')}
            onToggle={() => toggle('staff')}
          >
            {isMounted('staff') && <StaffManager />}
          </SettingsSection>
        )}

        {team && (
          <SettingsSection
            id="pace-zones"
            title="Training pace zones"
            description="What your team's pace terms mean, and how paces are worked out."
            icon={Gauge}
            open={isOpen('pace-zones')}
            onToggle={() => toggle('pace-zones')}
          >
            {isMounted('pace-zones') && <PaceZonesManager />}
          </SettingsSection>
        )}

        {team && (
          <SettingsSection
            id="data-practices"
            title="Student data & privacy"
            description="What LeadPack stores, who can see it, and what a district needs to know."
            icon={ShieldCheck}
            open={isOpen('data-practices')}
            onToggle={() => toggle('data-practices')}
          >
            {isMounted('data-practices') && <DataPracticesCard />}
          </SettingsSection>
        )}

        {team && (isFullCoach(currentUser) || isImpersonatingAdmin(currentUser)) && (
          <SettingsSection
            id="meet-groups"
            title="Meet groups"
            description="Link the same meet across seasons so it can be compared."
            icon={Flag}
            open={isOpen('meet-groups')}
            onToggle={() => toggle('meet-groups')}
          >
            {isMounted('meet-groups') && <MeetGroupsManager teamId={team.id} />}
          </SettingsSection>
        )}

        {team && (
          <SettingsSection
            id="export"
            title="Export your data"
            description="Download everything, any time, in a format you can keep."
            icon={Download}
            summary="This data is yours"
            open={isOpen('export')}
            onToggle={() => toggle('export')}
          >
            {isMounted('export') && <DataExportCard />}
          </SettingsSection>
        )}

        {walkthroughRole && (
          <SettingsSection
            id="tour"
            title="Feature tour"
            description="Revisit the walkthrough you saw — or skipped — the first time you signed in."
            icon={Compass}
            open={isOpen('tour')}
            onToggle={() => toggle('tour')}
          >
            <Button variant="outline" onClick={openWalkthrough}>
              Take the tour again
            </Button>
          </SettingsSection>
        )}

        {/* Backend only ever lets HEAD_COACH (or an impersonating super
            admin) actually clear team data (routes/teams.js), so this is
            hidden entirely for everyone else rather than shown and then
            403ing on click. Last in the grid, and the only section that
            looks different — it should not read like the others. */}
        {(canDeleteData(currentUser) || isImpersonatingAdmin(currentUser)) && (
          <SettingsSection
            id="danger"
            title="Danger zone"
            description="Permanent, irreversible actions."
            icon={AlertTriangle}
            tone="danger"
            open={isOpen('danger')}
            onToggle={() => toggle('danger')}
          >
            {isMounted('danger') && (
              <div>
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
              </div>
            )}
          </SettingsSection>
        )}
      </div>
    </div>
  );
};

export default SimpleSettingsPage;
