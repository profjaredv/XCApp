import { createContext, useContext } from 'react';
import type { User } from '../types';

interface AuthContextType {
    currentUser: User | null;
    loading: boolean;
    error: string | null;
    setCurrentUser: (user: User | null) => void;
    setError: (error: string | null) => void;
    getFreshToken: () => Promise<string | null>;
    acceptInvite: (token: string) => Promise<unknown>;
    acceptStaffInvite: (token: string) => Promise<unknown>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
