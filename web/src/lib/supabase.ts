import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nxlatotemxoryjsuouak.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bGF0b3RlbXhvcnlqc3VvdWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNjc5MDAsImV4cCI6MjA3NDg0MzkwMH0.EPqTphL-6N1kzNaAj6QnKnXGc4W2qEHbXNvv6cZ73Aw';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

