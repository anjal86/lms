/**
 * In @supabase/ssr, the default cookie storageKey is derived from the hostname
 * of the supabaseUrl passed to createClient (`sb-${hostname.split('.')[0]}-auth-token`).
 *
 * When the server reaches Supabase via an internal Docker DNS name (such as
 * http://supabase-kong:8000), it would default to looking for
 * `sb-supabase-kong-auth-token`, while the browser client sets `sb-localhost-auth-token`.
 *
 * This helper resolves a consistent auth cookie name based on NEXT_PUBLIC_SUPABASE_URL
 * so both the browser and server always agree on the session cookie name.
 */
export function authCookieName(): string {
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'http://localhost:8000';
  try {
    const hostname = new URL(publicUrl).hostname.split('.')[0] || 'localhost';
    return `sb-${hostname}-auth-token`;
  } catch {
    return 'sb-localhost-auth-token';
  }
}
