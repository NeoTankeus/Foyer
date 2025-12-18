import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create client only if URL exists, otherwise use a dummy to prevent build errors
export const supabase: SupabaseClient = supabaseUrl
  ? createClient(supabaseUrl, supabaseKey)
  : createClient('https://placeholder.supabase.co', 'placeholder');

export function isSupabaseReady(): boolean {
  return !!(supabaseUrl && supabaseKey && supabaseKey.startsWith('eyJ'));
}
