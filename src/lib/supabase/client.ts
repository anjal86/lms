import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authCookieName } from './cookie-name';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);

let browserClient: SupabaseClient | null = null;

export async function syncRealtimeAuth(client: SupabaseClient = getSupabaseBrowserClient()): Promise<string | null> {
  try {
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token || null;
    if (token) {
      await client.realtime.setAuth(token);
    }
    return token;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Unable to sync realtime auth:', err);
    }
    return null;
  }
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      cookieOptions: {
        name: authCookieName(),
      },
    });

    if (typeof window !== 'undefined') {
      void syncRealtimeAuth(browserClient);
      browserClient.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token && browserClient) {
          void browserClient.realtime.setAuth(session.access_token);
        }
      });
    }
  }

  return browserClient;
}
