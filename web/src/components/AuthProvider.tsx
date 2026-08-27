import React, { ReactNode, useState, useEffect, useCallback } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { User } from '../types';
import { api } from '../api/axios';
import { authClient, getJWTToken } from '../lib/auth';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUserData = async (token: string): Promise<User | null> => {
    try {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const response = await api.get('/users/me');
      const userData = response.data;
      if (userData) {
        return {
          uid: userData.id || userData.uid,
          email: userData.email,
          name: userData.name,
          role: userData.role,
          team: userData.team,
          // TeamMember.role — GET /users/me has always returned this; it
          // was just never copied into the object built here, so
          // currentUser.teamRole was silently undefined for every coach
          // account. Layout.tsx's nav spine (Workstream B) keys off this
          // field to decide the coach vs. athlete sidebar, so that bug
          // made every coach's sidebar collapse to just "Today."
          teamRole: userData.teamRole ?? null,
          linkedAthlete: userData.linkedAthlete ?? null,
          isSuperAdmin: userData.isSuperAdmin ?? false,
          isImpersonating: userData.isImpersonating ?? false,
          isPreviewingAthlete: userData.isPreviewingAthlete ?? false,
        };
      }
      return null;
    } catch (err) {
      console.error('Error fetching user data:', err);
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      if (sessionLoading) return;

      if (!session?.user) {
        if (!cancelled) {
          delete api.defaults.headers.common['Authorization'];
          setCurrentUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const token = await getJWTToken();
        if (!token) {
          if (!cancelled) {
            setCurrentUser(null);
            setLoading(false);
          }
          return;
        }

        const userData = await fetchUserData(token);
        if (!cancelled) {
          setCurrentUser(
            userData || {
              uid: session.user.id,
              email: session.user.email || '',
              name: session.user.name || '',
              role: 'athlete',
            }
          );
          setLoading(false);
        }
      } catch (err) {
        console.error('Auth sync error:', err);
        if (!cancelled) setLoading(false);
      }
    };

    sync();

    return () => {
      cancelled = true;
    };
  }, [session, sessionLoading]);

  const getFreshToken = async (): Promise<string | null> => {
    try {
      return await getJWTToken();
    } catch (err) {
      console.error('Error getting fresh token:', err);
      setError('Failed to refresh authentication');
      return null;
    }
  };

  const contextSetError = (newError: string | null) => {
    setError(newError || '');
  };

  const acceptInvite = useCallback(async (token: string) => {
    const response = await api.post('/athletes/accept-invite', { token });
    // The invite just linked this account to an athlete and (re)set its
    // team — currentUser needs to reflect that immediately rather than
    // waiting for the next natural refetch.
    const fresh = await getFreshToken();
    if (fresh) {
      const refreshedUser = await fetchUserData(fresh);
      if (refreshedUser) setCurrentUser(refreshedUser);
    }
    return response.data;
  }, []);

  const acceptStaffInvite = useCallback(async (token: string) => {
    const response = await api.post('/team/accept-staff-invite', { token });
    // Same reasoning as acceptInvite: team/role just changed, refresh now.
    const fresh = await getFreshToken();
    if (fresh) {
      const refreshedUser = await fetchUserData(fresh);
      if (refreshedUser) setCurrentUser(refreshedUser);
    }
    return response.data;
  }, []);

  // F3 (LeadPack Master Build Handoff): claiming an admin-created team —
  // same reasoning as acceptStaffInvite, this just granted HEAD_COACH, so
  // currentUser needs to reflect that immediately.
  const claimTeam = useCallback(async (token: string) => {
    const response = await api.post(`/team-claims/${token}/claim`);
    const fresh = await getFreshToken();
    if (fresh) {
      const refreshedUser = await fetchUserData(fresh);
      if (refreshedUser) setCurrentUser(refreshedUser);
    }
    return response.data;
  }, []);

  const value = {
    currentUser,
    loading,
    error,
    setCurrentUser,
    setError: contextSetError,
    getFreshToken,
    acceptInvite,
    acceptStaffInvite,
    claimTeam,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
