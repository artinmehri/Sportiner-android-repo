import { supabase } from '@/context/AuthContext';

export { supabase };

export const isSupabaseConfigured = Boolean(supabase);

export const SUPABASE_SETUP_HINT =
  'Supabase is not configured. Add your Supabase URL and anon key to the mobile app configuration and restart the app.';

export const SUPABASE_BAD_HOST_HINT =
  'Could not resolve the Supabase host. Verify the Supabase URL and your network connection, then restart the app.';
