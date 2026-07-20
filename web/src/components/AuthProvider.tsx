import React, { ReactNode, useState, useEffect } from 'react';
import { useUser } from '@stackframe/react';
import { AuthContext } from '../contexts/AuthContext';
import { User } from '../types';
import { api } from '../api/axios';

// UNVERIFIED against live Stack Auth docs (see stackClientApp.ts and
// MIGRATION_STATUS.md) — in particular `stackUser.getAuthJson()` returning
// `{ accessToken, refreshToken }` is written from documented behavior but
// wasn't exercised against a real project in this session. Confirm this
// against a real sign-in before shipping.
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const stackUser = useUser();
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
      if (!stackUser) {
        if (!cancelled) {
          setCurrentUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const { accessToken } = await stackUser.getAuthJson();
        if (!accessToken) {
          if (!cancelled) {
            setCurrentUser(null);
            setLoading(false);
          }
          return;
        }

        const userData = await fetchUserData(accessToken);
        if (!cancelled) {
          setCurrentUser(
            userData || {
              uid: stackUser.id,
              email: stackUser.primaryEmail || '',
              name: stackUser.displayName || '',
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
  }, [stackUser]);

  const getFreshToken = async (): Promise<string | null> => {
    try {
      if (!stackUser) return null;
      const { accessToken } = await stackUser.getAuthJson();
      return accessToken ?? null;
    } catch (err) {
      console.error('Error getting fresh token:', err);
      setError('Failed to refresh authentication');
      return null;
    }
  };

  const contextSetError = (newError: string | null) => {
    setError(newError || '');
  };

  const acceptInvite = async (token: string) => {
    // TODO: Implement invite acceptance logic
    console.log('Accept invite:', token);
    return Promise.resolve();
  };

  const value = {
    currentUser,
    loading,
    error,
    setCurrentUser,
    setError: contextSetError,
    getFreshToken,
    acceptInvite,
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
