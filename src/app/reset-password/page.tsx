'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import AuthShell from '@/components/auth/AuthShell';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  if (success) {
    return (
      <AuthShell
        eyebrow="Password updated"
        title="You’re all set"
        description="Your recovery session has been signed out for security. Sign in again with your new password."
      >
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <p className="mt-3 text-sm leading-6 text-emerald-900">Your password was changed successfully.</p>
        </div>
        <Link href="/login" className="button-primary mt-5 w-full">Return to sign in</Link>
      </AuthShell>
    );
  }

  const passwordLengthOk = password.length >= 12;
  const passwordsMatch = confirm.length > 0 && password === confirm;

  return (
    <AuthShell
      eyebrow="Secure recovery"
      title="Choose a new password"
      description="Create a strong password for your agency account. You’ll sign in again after the update."
      footer={
        !ready ? (
          <Link href="/forgot-password" className="font-medium text-blue-600 transition hover:text-blue-700">Request a new recovery link</Link>
        ) : undefined
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium text-zinc-700">New password</label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field pl-10 pr-11"
              placeholder="At least 12 characters"
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
          <div className={`mt-2 text-xs ${passwordLengthOk ? 'text-emerald-600' : 'text-zinc-400'}`}>
            {passwordLengthOk ? '✓ Password length is good' : 'Use 12 or more characters'}
          </div>
        </div>

        <div>
          <label htmlFor="confirm" className="mb-2 block text-sm font-medium text-zinc-700">Confirm password</label>
          <input
            id="confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={12}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="field"
            placeholder="Repeat your new password"
          />
          {confirm.length > 0 && (
            <div className={`mt-2 text-xs ${passwordsMatch ? 'text-emerald-600' : 'text-red-600'}`}>
              {passwordsMatch ? '✓ Passwords match' : 'Passwords do not match yet'}
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
            {error}
          </div>
        )}

        <button type="submit" disabled={!ready || loading} className="button-primary w-full">
          {loading ? 'Updating password…' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  );
}
