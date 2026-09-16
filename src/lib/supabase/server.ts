import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { serverSupabaseUrl } from './server-config';
import { authCookieName } from './cookie-name';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = serverSupabaseUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase server configuration is missing.');
  }

  return createServerClient(url, anonKey, {
    cookieOptions: {
      name: authCookieName(),
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot always mutate cookies. The proxy refreshes sessions.
        }
      },
    },
  });
}
