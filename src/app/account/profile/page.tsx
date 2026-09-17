'use client';

import { useEffect, useState } from 'react';
import { Save, UserRound } from 'lucide-react';
import { useApp } from '@/lib/store';

export default function AccountProfilePage() {
  const { currentUser, updateProfile, showToast } = useApp();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [officeLocation, setOfficeLocation] = useState('');

  useEffect(() => {
    setFullName(currentUser.full_name || '');
    setPhone(currentUser.phone || '');
    setAvatarUrl(currentUser.avatar_url || '');
    setBio(currentUser.bio || '');
    setOfficeLocation(currentUser.office_location || '');
  }, [currentUser.id, currentUser.full_name, currentUser.phone, currentUser.avatar_url, currentUser.bio, currentUser.office_location]);

  const save = () => {
    if (!currentUser.id || !fullName.trim()) return;
    updateProfile(currentUser.id, {
      full_name: fullName.trim(),
      phone: phone.trim(),
      avatar_url: avatarUrl.trim(),
      bio: bio.trim(),
      office_location: officeLocation.trim(),
    });
    showToast('Profile saved.', 'success');
  };

  return (
    <section className="surface-flat">
      <div className="panel-header flex items-center justify-between gap-4">
        <div><h2 className="section-heading">Profile</h2><p className="section-description">Your personal identity and contact details.</p></div>
        <button type="button" onClick={save} className="button-primary"><Save className="h-4 w-4" /> Save</button>
      </div>
      <div className="panel-body grid gap-5 md:grid-cols-[120px_minmax(0,1fr)]">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500"><UserRound className="h-8 w-8" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-zinc-700">Full name<input className="field mt-1.5" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
          <label className="text-xs font-semibold text-zinc-700">Email<input className="field mt-1.5 bg-zinc-50 text-zinc-500" value={currentUser.email || ''} readOnly /></label>
          <label className="text-xs font-semibold text-zinc-700">Phone<input className="field mt-1.5" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          <label className="text-xs font-semibold text-zinc-700">Office location<input className="field mt-1.5" value={officeLocation} onChange={(event) => setOfficeLocation(event.target.value)} /></label>
          <label className="text-xs font-semibold text-zinc-700 sm:col-span-2">Avatar URL<input className="field mt-1.5" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://…" /></label>
          <label className="text-xs font-semibold text-zinc-700 sm:col-span-2">Bio<textarea className="textarea-field mt-1.5 min-h-28" value={bio} onChange={(event) => setBio(event.target.value)} /></label>
        </div>
      </div>
    </section>
  );
}
