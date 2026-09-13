'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import AuthShell from '@/components/auth/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Reset Password · CRM Workspace';
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
      setMessage('If that email belongs to an account, a reset link has been sent. Check your inbox and spam folder.');
    } catch (resetError) {
      console.error('Password reset request failed:', resetError);
      setError('Unable to send a reset link right now. Please contact an administrator if the problem continues.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your work email and we’ll send a secure recovery link if the account exists."
      footer={
        <Link href="/login" className="inline-flex items-center gap-1.5 font-medium text-zinc-700 transition hover:text-zinc-950">
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-700">Work email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className="field pl-10"
            />
          </div>
        </div>

        {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm leading-5 text-emerald-800">{message}</div>}
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">{error}</div>}

        <button type="submit" disabled={loading} className="button-primary w-full">
          {loading ? 'Sending…' : 'Send recovery link'}
        </button>
      </form>
    </AuthShell>
  );
}
