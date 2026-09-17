'use client';

import { useEffect, useMemo, useState } from 'react';
import { Contact, UserRound } from 'lucide-react';
import { useApp } from '@/lib/store';
import { DirtySaveBar, FieldLabel, SettingsSection, StatusBadge, useUnsavedChangesGuard } from '@/components/settings/SettingsPrimitives';

type ProfileDraft = {
  fullName: string;
  phone: string;
  avatarUrl: string;
  bio: string;
  officeLocation: string;
};

export default function AccountProfilePage() {
  const { currentUser, updateProfile, showToast } = useApp();
  const fromUser = useMemo<ProfileDraft>(() => ({
    fullName: currentUser.full_name || '',
    phone: currentUser.phone || '',
    avatarUrl: currentUser.avatar_url || '',
    bio: currentUser.bio || '',
    officeLocation: currentUser.office_location || '',
  }), [currentUser.full_name, currentUser.phone, currentUser.avatar_url, currentUser.bio, currentUser.office_location]);
  const [draft, setDraft] = useState<ProfileDraft>(fromUser);
  const [baseline, setBaseline] = useState<ProfileDraft>(fromUser);

  useEffect(() => {
    setDraft(fromUser);
    setBaseline(fromUser);
  }, [currentUser.id, fromUser]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useUnsavedChangesGuard(dirty);

  const save = () => {
    if (!currentUser.id || !draft.fullName.trim()) {
      showToast('Full name is required.', 'error');
      return;
    }
    const next = {
      full_name: draft.fullName.trim(),
      phone: draft.phone.trim(),
      avatar_url: draft.avatarUrl.trim(),
      bio: draft.bio.trim(),
      office_location: draft.officeLocation.trim(),
    };
    updateProfile(currentUser.id, next);
    const clean = { fullName: next.full_name, phone: next.phone, avatarUrl: next.avatar_url, bio: next.bio, officeLocation: next.office_location };
    setDraft(clean);
    setBaseline(clean);
    showToast('Profile saved.', 'success');
  };

  return (
    <div className="space-y-4">
      <SettingsSection title="Profile" description="Your personal identity and contact details. These follow you across workspaces." icon={UserRound} actions={<StatusBadge tone="neutral">Personal</StatusBadge>}>
        <div className="grid gap-5 md:grid-cols-[112px_minmax(0,1fr)]">
          <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-400"><UserRound className="h-8 w-8" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Full name"><input className="field mt-1.5" value={draft.fullName} onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))} /></FieldLabel>
            <FieldLabel label="Email" hint="Your login identity is managed under Security."><input className="field mt-1.5 bg-zinc-50 text-zinc-500" value={currentUser.email || ''} readOnly /></FieldLabel>
            <FieldLabel label="Phone"><input className="field mt-1.5" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} /></FieldLabel>
            <FieldLabel label="Office location"><input className="field mt-1.5" value={draft.officeLocation} onChange={(event) => setDraft((current) => ({ ...current, officeLocation: event.target.value }))} /></FieldLabel>
            <div className="sm:col-span-2"><FieldLabel label="Avatar URL" hint="Use a secure image URL. File upload can be added later without changing your profile data model."><input className="field mt-1.5" value={draft.avatarUrl} onChange={(event) => setDraft((current) => ({ ...current, avatarUrl: event.target.value }))} placeholder="https://…" /></FieldLabel></div>
            <div className="sm:col-span-2"><FieldLabel label="Bio"><textarea className="textarea-field mt-1.5 min-h-28" value={draft.bio} onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} /></FieldLabel></div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Workspace membership" description="Your workspace access is administered separately from personal profile details." icon={Contact}>
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600"><span>Current role</span><StatusBadge tone="info">{currentUser.workspace_role || currentUser.role}</StatusBadge></div>
      </SettingsSection>

      <DirtySaveBar dirty={dirty} saving={false} onSave={save} onDiscard={() => setDraft(baseline)} label="Save profile" />
    </div>
  );
}
