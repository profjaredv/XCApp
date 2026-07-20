import React, { ReactNode, useState, useEffect } from 'react';
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
