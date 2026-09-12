'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Reset Password · Wanderlust CRM';
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
      const { error: resetError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo }
      );
      if (resetError) throw resetError;
      setMessage('If that email belongs to an account, a password reset link has been sent.');
    } catch (resetError) {
      console.error('Password reset request failed:', resetError);
      setError('Unable to send a reset link right now. Please contact an administrator if the problem continues.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-zinc-100">
      <div className="w-full max-w-sm">
        <Link href="/login" className="mb-4 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-2xl">
          <div className="mb-5">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-400">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Secure recovery
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
            <p className="mt-1.5 text-xs leading-5 text-zinc-400">Enter your work email. We will send a recovery link if the account exists.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[11px] font-medium text-zinc-300">Work email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@agency.com"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-zinc-500"
                />
              </div>
            </div>
            {message && <div className="rounded-md border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-xs text-emerald-300">{message}</div>}
            {error && <div role="alert" className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>}
            <button type="submit" disabled={loading} className="w-full rounded-md bg-white py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-60">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
