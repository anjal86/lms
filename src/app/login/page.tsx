'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawReturnUrl = searchParams.get('returnUrl') || '/leads';
  const returnUrl = rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//') ? rawReturnUrl : '/leads';
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
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        setErrorMsg('Invalid email or password.');
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
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 w-10 h-10 rounded-lg bg-white text-zinc-950 flex items-center justify-center font-bold">W</div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-800 bg-zinc-900 text-[11px] text-zinc-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Secure operator access
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">Sign in to Wanderlust CRM</h1>
          <p className="mt-1.5 text-xs text-zinc-400">Use your assigned agency account. Demo role switching is disabled in production.</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-2xl space-y-4">
          <div>
            <label htmlFor="email" className="block text-[11px] font-medium text-zinc-300 mb-1.5">Work email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-zinc-500"
                placeholder="you@agency.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-[11px] font-medium text-zinc-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 pl-9 pr-10 py-2.5 text-sm outline-none focus:border-zinc-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div role="alert" className="rounded-md border border-red-900/70 bg-red-950/50 px-3 py-2 text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-white text-zinc-950 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
            {!isLoading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <LoginContent />
    </Suspense>
  );
}
