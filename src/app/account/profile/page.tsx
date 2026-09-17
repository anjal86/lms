'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/store';
import { FormField, SettingsSection, StickySaveBar } from '@/components/settings/SettingsPrimitives';

type Profile = { full_name: string; phone: string; avatar_url: string; bio: string; office_location: string };

export default function AccountProfilePage() {
  const { currentUser, updateProfile, showToast } = useApp();
  const saved: Profile = {
    full_name: currentUser.full_name || '', phone: currentUser.phone || '',
    avatar_url: currentUser.avatar_url || '', bio: currentUser.bio || '',
    office_location: currentUser.office_location || '',
  };
  const [draft, setDraft] = useState<Profile>(saved);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(saved); setError(''); }, [currentUser.id, currentUser.full_name, currentUser.phone, currentUser.avatar_url, currentUser.bio, currentUser.office_location]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const change = (field: keyof Profile, value: string) => setDraft((previous) => ({ ...previous, [field]: value }));
  const save = () => {
    if (!draft.full_name.trim()) { setError('Enter your full name.'); return; }
    if (!currentUser.id) return;
    updateProfile(currentUser.id, Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])) as Profile);
    setError('');
    showToast('Profile saved.', 'success');
  };

  return <div className="surface-flat p-5">
    <SettingsSection id="account-profile" title="Profile" description="Your personal identity and contact details.">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Full name"><input className="field" value={draft.full_name} onChange={(event) => change('full_name', event.target.value)} aria-invalid={!!error} aria-describedby={error ? 'profile-name-error' : undefined} /></FormField>
        <FormField label="Email" help="Managed by your login account."><input className="field bg-zinc-50 text-zinc-600" value={currentUser.email || ''} readOnly /></FormField>
        {error && <p id="profile-name-error" role="alert" className="text-[13px] text-red-700 sm:col-span-2">{error}</p>}
        <FormField label="Phone"><input className="field font-mono" type="tel" value={draft.phone} onChange={(event) => change('phone', event.target.value)} /></FormField>
        <FormField label="Office location"><input className="field" value={draft.office_location} onChange={(event) => change('office_location', event.target.value)} /></FormField>
        <FormField label="Avatar URL" className="sm:col-span-2"><input className="field" type="url" value={draft.avatar_url} onChange={(event) => change('avatar_url', event.target.value)} placeholder="https://…" /></FormField>
        <FormField label="Bio" className="sm:col-span-2"><textarea className="textarea-field min-h-28" value={draft.bio} onChange={(event) => change('bio', event.target.value)} /></FormField>
      </div>
    </SettingsSection>
    {dirty && <StickySaveBar saving={false} onSave={save} onDiscard={() => { setDraft(saved); setError(''); }} />}
  </div>;
}
