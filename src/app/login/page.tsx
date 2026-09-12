'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/store';
import {
  Compass,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  Users,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/leads';

  useEffect(() => {
    document.title = 'Sign In · Operator Access — Wanderlust CRM';
  }, []);

  const { allProfiles, login, currentUser, isAuthenticated, showToast } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDemoCode, setSelectedDemoCode] = useState<string | null>(null);

  // Fast 1-Click Role Profiles
  const adminProfile = allProfiles.find((p) => p.role === 'admin') || allProfiles[0];
  const managerProfile = allProfiles.find((p) => p.role === 'manager') || allProfiles[1];
  const agentProfile = allProfiles.find((p) => p.role === 'agent') || allProfiles[2];

  const handleFastLogin = (targetEmail: string, code: string) => {
    setSelectedDemoCode(code);
    setIsLoading(true);
    setErrorMsg(null);

    setTimeout(() => {
      const res = login(targetEmail);
      setIsLoading(false);
      if (res.success) {
        router.push(returnUrl);
      } else {
        setErrorMsg(res.error || 'Authentication failed');
      }
    }, 250);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Please provide your work email address.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    setTimeout(() => {
      const res = login(email);
      setIsLoading(false);
      if (res.success) {
        router.push(returnUrl);
      } else {
        setErrorMsg(res.error || 'Invalid credentials.');
      }
    }, 300);
  };

  return (
    <div className="min-h-screen w-full bg-zinc-950 flex flex-col justify-between p-4 sm:p-8 text-zinc-100 selection:bg-zinc-800">
      {/* Top Header */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-zinc-100 text-zinc-950 flex items-center justify-center font-bold text-xs tracking-tight shadow-sm">
            W
          </div>
          <div className="flex items-baseline gap-1.5 text-sm font-semibold tracking-tight text-white">
            <span>Wanderlust</span>
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">CRM</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[11px]">Auth Service Online</span>
          </div>
        </div>
      </div>

      {/* Main Authentication Container */}
      <div className="w-full max-w-4xl mx-auto my-auto py-8">
        <div className="text-center mb-8 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Role-Based Access Control Workstation</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Sign in to Travel Operations
          </h1>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Select a verified role credential to inspect role-scoped permissions, or authenticate with your work email.
          </p>
        </div>

        {/* 1-Click Fast Role Sign-in Grid */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2.5 px-1">
            <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-zinc-400">
              Instant 1-Click Role Profiles
            </span>
            <span className="text-[10px] font-mono text-zinc-500">Demo & QA Sandbox</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Admin Card */}
            {adminProfile && (
              <button
                type="button"
                onClick={() => handleFastLogin(adminProfile.email, adminProfile.employee_code!)}
                disabled={isLoading}
                className={`text-left p-3.5 rounded-lg border transition duration-150 flex flex-col justify-between group relative overflow-hidden ${
                  selectedDemoCode === adminProfile.employee_code && isLoading
                    ? 'bg-zinc-900 border-zinc-600 ring-1 ring-zinc-500'
                    : 'bg-zinc-900/70 hover:bg-zinc-900 border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={adminProfile.avatar_url}
                        alt={adminProfile.full_name}
                        className="w-8 h-8 rounded-full object-cover border border-zinc-700"
                      />
                      <div>
                        <div className="text-xs font-semibold text-zinc-100 group-hover:text-white">
                          {adminProfile.full_name}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400">{adminProfile.email}</div>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-red-950/80 text-red-400 border border-red-900/50 uppercase tracking-tight">
                      Super Admin
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Unrestricted control. Edit agency SLAs, manage database backups, commission gates & member roles.
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-mono text-zinc-400 group-hover:text-zinc-200">
                  <span>Sign in as Admin →</span>
                  <span className="text-zinc-500">{adminProfile.employee_code}</span>
                </div>
              </button>
            )}

            {/* Manager Card */}
            {managerProfile && (
              <button
                type="button"
                onClick={() => handleFastLogin(managerProfile.email, managerProfile.employee_code!)}
                disabled={isLoading}
                className={`text-left p-3.5 rounded-lg border transition duration-150 flex flex-col justify-between group relative overflow-hidden ${
                  selectedDemoCode === managerProfile.employee_code && isLoading
                    ? 'bg-zinc-900 border-zinc-600 ring-1 ring-zinc-500'
                    : 'bg-zinc-900/70 hover:bg-zinc-900 border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={managerProfile.avatar_url}
                        alt={managerProfile.full_name}
                        className="w-8 h-8 rounded-full object-cover border border-zinc-700"
                      />
                      <div>
                        <div className="text-xs font-semibold text-zinc-100 group-hover:text-white">
                          {managerProfile.full_name}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400">{managerProfile.email}</div>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-400 border border-blue-900/50 uppercase tracking-tight">
                      Manager
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Operations oversight. Rebalance overdue tasks, configure routing rules & inspect team accountability.
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-mono text-zinc-400 group-hover:text-zinc-200">
                  <span>Sign in as Manager →</span>
                  <span className="text-zinc-500">{managerProfile.employee_code}</span>
                </div>
              </button>
            )}

            {/* Agent Card */}
            {agentProfile && (
              <button
                type="button"
                onClick={() => handleFastLogin(agentProfile.email, agentProfile.employee_code!)}
                disabled={isLoading}
                className={`text-left p-3.5 rounded-lg border transition duration-150 flex flex-col justify-between group relative overflow-hidden ${
                  selectedDemoCode === agentProfile.employee_code && isLoading
                    ? 'bg-zinc-900 border-zinc-600 ring-1 ring-zinc-500'
                    : 'bg-zinc-900/70 hover:bg-zinc-900 border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={agentProfile.avatar_url}
                        alt={agentProfile.full_name}
                        className="w-8 h-8 rounded-full object-cover border border-zinc-700"
                      />
                      <div>
                        <div className="text-xs font-semibold text-zinc-100 group-hover:text-white">
                          {agentProfile.full_name}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400">{agentProfile.email}</div>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-900/50 uppercase tracking-tight">
                      Consultant
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Frontline consultant. Manage assigned inquiries, time-blocked follow-ups & quotes. Settings locked.
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-mono text-zinc-400 group-hover:text-zinc-200">
                  <span>Sign in as Consultant →</span>
                  <span className="text-zinc-500">{agentProfile.employee_code}</span>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Divider with label */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-zinc-950 px-3 text-[10px] font-mono text-zinc-500">
              Or Sign In with Work Credentials
            </span>
          </div>
        </div>

        {/* Manual Sign-in Card */}
        <div className="max-w-md mx-auto bg-zinc-900/90 border border-zinc-800 rounded-lg p-5 shadow-2xl">
          {errorMsg && (
            <div className="mb-4 p-2.5 rounded bg-red-950/60 border border-red-900/50 flex items-center gap-2 text-xs text-red-300 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@travellms.com"
                  className="w-full pl-8 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                Workstation Passcode
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter passcode"
                  className="w-full pl-8 pr-8 py-2 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 text-zinc-100 focus:ring-0"
                />
                <span className="text-[11px] text-zinc-400">Remember on this device</span>
              </label>

              <span className="text-[10px] font-mono text-zinc-500">SSO & SAML Ready</span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-2 px-4 bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs rounded-md transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <span>Authenticating Workstation...</span>
              ) : (
                <>
                  <span>Sign In to Workstation</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {isAuthenticated && (
            <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
              <span>Active session: <strong className="text-zinc-200">{currentUser.full_name}</strong></span>
              <button
                type="button"
                onClick={() => router.push(returnUrl)}
                className="text-zinc-300 hover:text-white underline font-mono"
              >
                Go to Pipeline →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="w-full max-w-5xl mx-auto py-3 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-zinc-600 gap-2">
        <div>Wanderlust Travel CRM Operating System • High-Density Architecture</div>
        <div className="flex items-center gap-4">
          <span>Security Protocol v2.4</span>
          <span>Role Scoping Matrix Active</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <LoginContent />
    </Suspense>
  );
}
