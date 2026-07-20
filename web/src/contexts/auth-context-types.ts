import { User } from '../types';

export type AuthContextType = {
  currentUser: User | null;
  loading: boolean;
  error: string;
  setCurrentUser: (user: User | null) => void;
  setError: (error: string | null) => void;
  getFreshToken: () => Promise<string | null>;
};

export const defaultAuthContext: AuthContextType = {
  currentUser: null,
  loading: true,
  error: '',
  setCurrentUser: () => {},
  setError: () => {},
  getFreshToken: async () => null,
};
