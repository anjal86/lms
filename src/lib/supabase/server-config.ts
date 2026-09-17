import 'server-only';

/**
 * Resolves the Supabase URL used by server-side/admin clients.
 *
 * In the Docker stack the app container must reach Kong via its internal DNS
 * name (http://supabase-kong:8000), whereas the browser bundle is baked with the
 * public host URL (http://localhost:8000) at build time. Server code prefers the
 * dedicated SUPABASE_URL when provided and otherwise falls back to the public
 * NEXT_PUBLIC_SUPABASE_URL so both `npm run dev` on the host and the containerized
 * app keep working.
 */
export function serverSupabaseUrl(): string | null {
  const value = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return value || null;
}

export function serverSupabaseAnonKey(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
}