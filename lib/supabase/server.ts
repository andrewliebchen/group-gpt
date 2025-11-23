import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceRoleKey || supabaseServiceRoleKey === 'your-service-role-key-here') {
  console.warn('SUPABASE_SERVICE_ROLE_KEY is not set. Server-side operations may fail.');
}

// Use service role key if available, otherwise fall back to anon key
// Note: Service role key bypasses RLS, anon key respects RLS policies
const key = supabaseServiceRoleKey && supabaseServiceRoleKey !== 'your-service-role-key-here'
  ? supabaseServiceRoleKey
  : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

