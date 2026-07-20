import { useEffect, useState, type ReactNode, useCallback } from 'react';
import { auth } from '../firebase';
import { axiosInstance } from '../api/axios';
import type { User } from '../types';
import { AuthContext } from './AuthContext';
import { athleteService } from '@/api/athleteService';
import { supabase } from '../lib/supabase';

interface AuthProviderProps {
    children: ReactNode;
}

interface SupabaseUser {
    id: string;
    email?: string;
    getIdToken: () => Promise<string>;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchUserData = useCallback(async (user: SupabaseUser) => {
        console.log('AuthProvider: Starting user data fetch for', user.id);
        try {
            const token = await user.getIdToken();
            const response = await axiosInstance.get('/users/me', {
                headers: { Authorization: `Bearer ${token}` },
            });
            setCurrentUser(response.data);
            console.log('AuthProvider: User data fetched and set. Role:', response.data.role);
        } catch (err) {
            console.error('AuthProvider: Failed to fetch user data.', err);
            setError('Failed to load user profile.');
            setCurrentUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const initAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const supabaseUser: SupabaseUser = {
                    id: session.user.id,
                    email: session.user.email,
                    getIdToken: async () => session.access_token
                };
                fetchUserData(supabaseUser);
            } else {
                setLoading(false);
            }
        };

        initAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                const supabaseUser: SupabaseUser = {
                    id: session.user.id,
                    email: session.user.email,
                    getIdToken: async () => session.access_token
                };
                fetchUserData(supabaseUser);
            } else {
                setCurrentUser(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, [fetchUserData]);

    const value = {
        currentUser,
        loading,
        error,
        setCurrentUser,
        setError,
        getFreshToken: async () => {
            const { data: { session } } = await supabase.auth.getSession();
            return session?.access_token ?? null;
        },
        acceptInvite: async (token: string) => athleteService.acceptInvite(token),
    };

    // The loading gate now correctly prevents rendering until the initial fetch is done.
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div>Authenticating...</div>
            </div>
        );
    }

    // Once loading is false, we render the children within the provider.
    // The ProtectedRoute will then handle redirection if currentUser is null.
    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};