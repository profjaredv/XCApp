import React, { ReactNode, useState, useEffect } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { User } from '../types';
import { api } from '../api/axios';
import { supabase } from '../lib/supabase';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUserData = async (token: string): Promise<User | null> => {
    try {
      console.log('🔄 Fetching user data from /users/me...');
      console.log('📍 API base URL:', api.defaults.baseURL);
      console.log('🔑 Token (first 20 chars):', token.substring(0, 20));
      
      // Note: The api instance already has an interceptor that adds the auth token
      // But we'll set it explicitly here to be safe
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      console.log('📤 About to make API request...');
      const response = await api.get('/users/me');
      console.log('📥 Response received:', response.status);
      
      const userData = response.data;
      console.log('✅ User data fetched:', userData);
      if (userData) {
        return {
          uid: userData.id || userData.uid,
          email: userData.email,
          name: userData.name,
          role: userData.role,
          team: userData.team
        };
      }
      return null;
    } catch (err) {
      console.error('❌ Error fetching user data:', err);
      if (err instanceof Error) {
        console.error('❌ Error message:', err.message);
        console.error('❌ Error stack:', err.stack);
      }
      // Don't throw - just return null and let Supabase session data be used
      return null;
    }
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const initAuth = async () => {
      try {
        console.log('🔄 Initializing auth...');
        
        // Set a timeout to force loading to false after 5 seconds
        timeoutId = setTimeout(() => {
          console.warn('⚠️ Auth initialization timeout - forcing loading to false');
          setLoading(false);
        }, 5000);
        
        // Check for existing session first
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          console.log('✅ Found existing session');
          const userData = await fetchUserData(session.access_token);
          if (userData) {
            setCurrentUser(userData);
          } else {
            setCurrentUser({
              uid: session.user.id,
              email: session.user.email || '',
              name: session.user.user_metadata?.name || '',
              role: 'athlete',
            });
          }
        } else {
          console.log('ℹ️ No existing session');
        }
        
        clearTimeout(timeoutId);
        setLoading(false);
        console.log('✅ Auth initialized');
      } catch (err) {
        console.error('❌ Auth init error:', err);
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        console.log('🔄 Auth state changed:', _event);
        if (session?.user) {
          const userData = await fetchUserData(session.access_token);
          if (userData) {
            setCurrentUser(userData);
          } else {
            setCurrentUser({
              uid: session.user.id,
              email: session.user.email || '',
              name: session.user.user_metadata?.name || '',
              role: 'athlete',
            });
          }
        } else {
          setCurrentUser(null);
        }
      } catch (err) {
        console.error('❌ Error in auth state change handler:', err);
      } finally {
        setLoading(false);
        console.log('✅ Loading set to false');
      }
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const getFreshToken = async (): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token ?? null;
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

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
