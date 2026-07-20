// Compatibility layer - redirects to Supabase
import { supabase } from './lib/supabase';

// Export a mock auth object for compatibility
export const auth = {
  currentUser: null as any,
  onAuthStateChanged: (callback: (user: any) => void) => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      callback(session?.user || null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null);
    });

    return () => subscription.unsubscribe();
  },
  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
};

export default { auth };
