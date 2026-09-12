'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import AuthShell from '@/components/auth/AuthShell';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawReturnUrl = searchParams.get('returnUrl') || '/dashboard';
  const returnUrl = rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//') ? rawReturnUrl : '/dashboard';
  const initialError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    document.title = 'Sign In · Wanderlust CRM';
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('Enter your work email and password.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error || !data.user) {
        setErrorMsg('Invalid email or password.');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!profile?.is_active) {
        await supabase.auth.signOut();
        setErrorMsg('This account is disabled. Contact an administrator.');
        return;
      }

      router.replace(returnUrl);
      router.refresh();
    } catch (error) {
      console.error('Sign-in failed:', error);
      setErrorMsg('Authentication service is unavailable. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Secure workspace"
      title="Welcome back"
      description="Sign in with your agency account to continue to your pipeline and daily action queue."
      footer={<span>Need access? Contact your agency administrator.</span>}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-700">Work email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field pl-10"
              placeholder="you@agency.com"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700">Password</label>
            <Link href="/forgot-password" className="text-sm font-medium text-blue-600 transition hover:text-blue-700">Forgot password?</Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field pl-10 pr-11"
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
            {errorMsg}
          </div>
        )}

        <button type="submit" disabled={isLoading} className="button-primary w-full">
          {isLoading ? 'Signing in…' : 'Sign in'}
          {!isLoading && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f6f7f9]" />}>
      <LoginContent />
    </Suspense>
  );
}
