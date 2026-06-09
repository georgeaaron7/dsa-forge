import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables in .env.local');
}

// The "export" keyword here is the critical part that fixes your error
export const supabase = createClient(supabaseUrl, supabaseAnonKey);