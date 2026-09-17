import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { serverSupabaseUrl } from './server-config';

export function createSupabaseAdminClient() {
  const url = serverSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service-role configuration is missing.');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
