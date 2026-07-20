import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import axiosInstance from '../../api/axios';

interface Race {
  id: string;
  name: string;
  season: number;
  date: string;
}

interface MeetGroup {
  id: string;
  groupName: string;
  description?: string;
  races: Race[];
  seasons: number[];
  isManual?: boolean;
}

interface MeetGroupsManagerProps {
  teamId: string;
}

export function MeetGroupsManager({ teamId }: MeetGroupsManagerProps) {
  const [meetGroups, setMeetGroups] = useState<MeetGroup[]>([]);
  const [ungroupedRaces, setUngroupedRaces] = useState<Race[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchMeetGroups();
    fetchUngroupedRaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const fetchMeetGroups = async () => {
    try {
      const response = await axiosInstance.get(`/meet-groups/${teamId}`);
      setMeetGroups(response.data.data || []);
    } catch (err: any) {
      console.error('Error fetching meet groups:', err);
      setError(err.response?.data?.message || 'Failed to load meet groups');
    }
  };

  const fetchUngroupedRaces = async () => {
    try {
      const response = await axiosInstance.get(`/meet-groups/${teamId}/ungrouped-races`);
      setUngroupedRaces(response.data.data || []);
      setIsLoading(false);
    } catch (err: any) {
      console.error('Error fetching ungrouped races:', err);
      setIsLoading(false);
    }
  };

  const createMeetGroup = async () => {
    if (!newGroupName.trim()) return;

    try {
      await axiosInstance.post(`/meet-groups/${teamId}`, {
        groupName: newGroupName,
        description: newGroupDescription || null
      });

      setNewGroupName('');
      setNewGroupDescription('');
      setIsCreating(false);
      fetchMeetGroups();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create meet group');
    }
  };

  const deleteMeetGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this meet group?')) return;

    try {
      await axiosInstance.delete(`/meet-groups/${teamId}/${groupId}`);
      fetchMeetGroups();
      fetchUngroupedRaces();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete meet group');
    }
  };

  const addRaceToGroup = async (groupId: string, raceId: string) => {
    try {
      await axiosInstance.post(`/meet-groups/${teamId}/${groupId}/races`, {
        raceId
      });
      fetchMeetGroups();
      fetchUngroupedRaces();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add race to group');
    }
  };

  const removeRaceFromGroup = async (groupId: string, raceId: string) => {
    try {
      await axiosInstance.delete(`/meet-groups/${teamId}/${groupId}/races/${raceId}`);
      fetchMeetGroups();
      fetchUngroupedRaces();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to remove race from group');
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading meet groups...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Meet Groups</CardTitle>
          <CardDescription>
            Group races across seasons for comparison in Race Comparison charts. This allows you to manually link races
            like "District Championship" even if they have different names each year.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Create New Group */}
          {isCreating ? (
            <Card className="mb-4 border-2 border-primary">
              <CardHeader>
                <CardTitle className="text-lg">Create New Meet Group</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="groupName">Group Name *</Label>
                  <Input
                    id="groupName"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g., District Championship"
                  />
                </div>
                <div>
                  <Label htmlFor="groupDescription">Description (Optional)</Label>
                  <Input
                    id="groupDescription"
                    value={newGroupDescription}
                    onChange={(e) => setNewGroupDescription(e.target.value)}
                    placeholder="e.g., Annual district meet"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={createMeetGroup} disabled={!newGroupName.trim()}>
                    <Save className="h-4 w-4 mr-2" />
                    Create Group
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsCreating(false);
                      setNewGroupName('');
                      setNewGroupDescription('');
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button onClick={() => setIsCreating(true)} className="mb-4">
              <Plus className="h-4 w-4 mr-2" />
              Create New Meet Group
            </Button>
          )}

          {/* Existing Meet Groups */}
          <div className="space-y-4">
            {meetGroups.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No meet groups yet. Create one to start grouping races across seasons.
                </AlertDescription>
              </Alert>
            ) : (
              meetGroups.map((group) => (
                <Card key={group.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{group.groupName}</CardTitle>
                        {group.description && (
                          <CardDescription>{group.description}</CardDescription>
                        )}
                        <CardDescription className="mt-1">
                          Seasons: {group.seasons.join(', ')} ({group.races.length} races)
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMeetGroup(group.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Races in this group */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Races in this group:</Label>
                      {group.races.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No races added yet</p>
                      ) : (
                        <div className="space-y-1">
                          {group.races.map((race) => (
                            <div
                              key={race.id}
                              className="flex items-center justify-between p-2 bg-muted rounded"
                            >
                              <span className="text-sm">
                                {race.name} ({race.season})
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeRaceFromGroup(group.id, race.id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Add races dropdown */}
                    {ungroupedRaces.length > 0 && (
                      <div className="mt-4">
                        <Label className="text-sm font-semibold">Add race to group:</Label>
                        <select
                          className="w-full mt-1 p-2 border rounded"
                          onChange={(e) => {
                            if (e.target.value) {
                              addRaceToGroup(group.id, e.target.value);
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Select a race...</option>
                          {ungroupedRaces.map((race) => (
                            <option key={race.id} value={race.id}>
                              {race.name} ({race.season})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Ungrouped Races */}
          {ungroupedRaces.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Ungrouped Races</CardTitle>
                <CardDescription>
                  These races haven't been added to any meet group yet
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {ungroupedRaces.map((race) => (
                    <div
                      key={race.id}
                      className="p-2 bg-muted rounded text-sm"
                    >
                      {race.name} ({race.season})
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
