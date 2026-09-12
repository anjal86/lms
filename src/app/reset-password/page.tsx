'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Choose New Password · Wanderlust CRM';
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      setReady(Boolean(data.session));
      if (!data.session) setError('This recovery session is missing or expired. Request a new password reset link.');
    });
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError('Use at least 12 characters for your new password.');
      return;
    }
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      setSuccess(true);
      setPassword('');
      setConfirm('');
    } catch (updateError) {
      console.error('Password update failed:', updateError);
      setError('Unable to update the password. The recovery link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-zinc-100">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-2xl">
        {success ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-400" />
            <h1 className="mt-3 text-xl font-semibold">Password updated</h1>
            <p className="mt-2 text-xs leading-5 text-zinc-400">Your recovery session has been signed out. Sign in again with the new password.</p>
            <Link href="/login" className="mt-5 inline-flex rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950">Return to sign in</Link>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Recovery session
              </div>
              <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
              <p className="mt-1.5 text-xs leading-5 text-zinc-400">Use at least 12 characters. Avoid reusing a password from another service.</p>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="password" className="mb-1.5 block text-[11px] font-medium text-zinc-300">New password</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input id="password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-md border border-zinc-700 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-zinc-500" />
                </div>
              </div>
              <div>
                <label htmlFor="confirm" className="mb-1.5 block text-[11px] font-medium text-zinc-300">Confirm password</label>
                <input id="confirm" type="password" autoComplete="new-password" required minLength={12} value={confirm} onChange={(event) => setConfirm(event.target.value)} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-zinc-500" />
              </div>
              {error && <div role="alert" className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>}
              <button type="submit" disabled={!ready || loading} className="w-full rounded-md bg-white py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-50">
                {loading ? 'Updating…' : 'Update password'}
              </button>
              {!ready && <Link href="/forgot-password" className="block text-center text-xs text-zinc-400 hover:text-white">Request a new recovery link</Link>}
            </form>
          </>
        )}
      </div>
    </main>
  );
}
