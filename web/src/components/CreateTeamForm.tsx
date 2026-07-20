import React, { useState } from 'react';
import axios from 'axios';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { axiosInstance } from '@/api/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const CreateTeamForm: React.FC = () => {
  const [name, setName] = useState('');
  const [athleticTeamId, setAthleticTeamId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setCurrentUser } = useAuth();

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!name.trim() || !athleticTeamId.trim()) {
      setError('Please enter both team name and team ID.');
      setLoading(false);
      return;
    }

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        throw new Error('Authentication token not found.');
      }

      const response = await axiosInstance.post(
        '/teams',
        { name, athleticTeamId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setCurrentUser(response.data.user);

    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.message || 'Failed to create team.');
      } else {
        setError('An unexpected error occurred.');
      }
      console.error(err);
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleCreateTeam} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="team-name">Team Name</Label>
        <Input
          id="team-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Varsity Boys"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="athleticTeamId">Athletic.net Team ID</Label>
        <Input
          id="athleticTeamId"
          type="text"
          value={athleticTeamId}
          onChange={(e) => setAthleticTeamId(e.target.value)}
          placeholder="e.g. 12345"
          required
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Creating...' : 'Create Team'}
      </Button>
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
    </form>
  );
};

export default CreateTeamForm;
