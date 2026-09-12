import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const safeInternalPath = (value: string | null, fallback = '/leads') =>
  value && value.startsWith('/') && !value.startsWith('//') ? value : fallback;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = safeInternalPath(requestUrl.searchParams.get('next'));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  const loginUrl = new URL('/login', requestUrl.origin);
  loginUrl.searchParams.set('error', 'Authentication link is invalid or expired.');
  return NextResponse.redirect(loginUrl);
}
