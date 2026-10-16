import { useState, useEffect, useCallback } from 'react';
import api from '../api/api';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

interface Team {
  id: string;
  name: string;
  athleticTeamId?: string;
}

const teamService = {
  getCurrentTeam: async (): Promise<Team | null> => {
    try {
      const response = await api.get<Team>('/teams/current');
      if (response.data && typeof response.data === 'object' && 'id' in response.data) {
        return {
          id: response.data.id,
          name: response.data.name || '',
          athleticTeamId: response.data.athleticTeamId || ''
        };
      } else {
        return null; // No team found is a valid case
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null; // Explicitly handle 404 as no team
      }
      console.error('Error fetching current team:', error);
      throw error;
    }
  }
};

export function useTeam() {
  const { currentUser, loading: authLoading } = useAuth();
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTeam = useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      return; // Do not fetch if there is no user.
    }

    setLoading(true);
    setError(null);
    try {
      const team = await teamService.getCurrentTeam();
      setCurrentTeam(team);
    } catch (err) {
      console.error('Error in useTeam hook:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch team data.'));
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    // This effect now depends on the authentication loading state.
    // It will only run once the user is known to be authenticated or not.
    if (!authLoading) {
      fetchTeam();
    }
  }, [authLoading, fetchTeam]);


  return { 
    currentTeam,
    loading,
    error,
    refreshTeam: fetchTeam
  };
}

export default useTeam;
