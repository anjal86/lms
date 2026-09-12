import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  return browserClient;
}
