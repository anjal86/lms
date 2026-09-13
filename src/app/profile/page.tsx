'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { CheckCircle2, Plus, Save, X } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import type { AgentStatus, Profile } from '@/lib/types';

const COMMON_DESTINATIONS = [
  'Bali', 'Thailand', 'Vietnam', 'Singapore', 'Switzerland', 'Paris', 'Italy', 'Europe',
  'Greece', 'Dubai', 'Maldives', 'Mauritius', 'Egypt', 'Japan', 'Australia', 'USA', 'New Zealand',
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function ProfileForm({ profile }: { profile: Profile }) {
  const { updateProfile, updateUserPreferences } = useApp();
  const { config, term } = useWorkspace();
  const isTravel = config.workspace.business_type === 'travel' || config.workspace.template_key === 'travel';
  const leadPlural = term('lead_plural', 'Leads');
  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone || '');
  const [directExtension, setDirectExtension] = useState(profile.direct_extension || '');
  const [officeLocation, setOfficeLocation] = useState(profile.office_location || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [languages, setLanguages] = useState((profile.languages || ['English']).join(', '));
  // destination_tags is retained as a backwards-compatible storage field. In
  // non-travel workspaces it represents general expertise/specialty tags.
  const [destinationTags, setDestinationTags] = useState<string[]>(profile.destination_tags || []);
  const [newDestination, setNewDestination] = useState('');
  const [status, setStatus] = useState<AgentStatus>(profile.status);
  const [acceptingLeads, setAcceptingLeads] = useState(profile.accepting_leads ?? true);
  const [idleAutoAway, setIdleAutoAway] = useState(profile.user_preferences?.idle_auto_away_minutes ?? 15);
  const [directWhatsApp, setDirectWhatsApp] = useState(profile.user_preferences?.instant_whatsapp_direct ?? false);
  const [countryCode, setCountryCode] = useState(profile.user_preferences?.default_country_code || '+977');
  const [saved, setSaved] = useState(false);

  const addDestination = (value: string) => {
    const clean = value.trim();
    if (!clean || destinationTags.some((tag) => tag.toLowerCase() === clean.toLowerCase())) return;
    setDestinationTags((current) => [...current, clean]);
    setNewDestination('');
  };

  const handleDestinationKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDestination(newDestination);
    }
  };

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    const preferences = {
      kanban_density: profile.user_preferences?.kanban_density || 'compact' as const,
      default_landing_page: profile.user_preferences?.default_landing_page || '/dashboard' as const,
      idle_auto_away_minutes: Number(idleAutoAway) || 15,
      instant_whatsapp_direct: directWhatsApp,
      default_country_code: countryCode.trim() || '+977',
    };

    updateProfile(profile.id, {
      full_name: fullName.trim(),
      phone: phone.trim(),
      direct_extension: directExtension.trim() || undefined,
      office_location: officeLocation.trim() || undefined,
      bio: bio.trim(),
      languages: languages.split(',').map((item) => item.trim()).filter(Boolean),
      destination_tags: destinationTags,
      status,
      accepting_leads: acceptingLeads,
      user_preferences: preferences,
    });
    updateUserPreferences(profile.id, preferences);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <form onSubmit={handleSave} className="app-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Account</p>
          <h1 className="page-title">My profile</h1>
          <p className="page-description">Keep your contact details, availability, specialties, and work preferences current.</p>
        </div>
        <div className="page-actions">
          {saved && <span className="status-line"><span className="status-dot status-dot-success" />Saved</span>}
          <button type="submit" className="button-primary"><Save className="h-4 w-4" /> Save changes</button>
        </div>
      </header>

      <section className="surface-flat p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-sm font-bold text-white">{initials(profile.full_name)}</div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-zinc-950">{profile.full_name}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500"><span>{profile.email}</span><span className="capitalize">{profile.role}</span>{profile.employee_code && <span className="font-mono">{profile.employee_code}</span>}</div>
          </div>
          <span className="status-line"><span className={`status-dot ${status === 'available' ? 'status-dot-success' : status === 'in_call' ? 'status-dot-info' : status === 'on_break' ? 'status-dot-warning' : ''}`} />{status.replace('_', ' ')}</span>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <section className="surface-flat">
            <div className="panel-header"><div><h2 className="section-heading">Contact details</h2><p className="section-description">Information your team uses to reach and identify you.</p></div></div>
            <div className="panel-body grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-zinc-700">Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} className="field mt-1.5" required /></label>
              <label className="text-xs font-semibold text-zinc-700">Email<input value={profile.email} className="field mt-1.5 bg-zinc-50 text-zinc-500" readOnly aria-readonly="true" /><span className="mt-1 block text-[10px] font-normal text-zinc-400">Login email is managed with your account.</span></label>
              <label className="text-xs font-semibold text-zinc-700">Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} className="field mt-1.5 font-mono" placeholder="Phone number" /></label>
              <label className="text-xs font-semibold text-zinc-700">Extension<input value={directExtension} onChange={(event) => setDirectExtension(event.target.value)} className="field mt-1.5 font-mono" placeholder="Optional" /></label>
              <label className="text-xs font-semibold text-zinc-700 sm:col-span-2">Office location<input value={officeLocation} onChange={(event) => setOfficeLocation(event.target.value)} className="field mt-1.5" placeholder="Office or work location" /></label>
              <label className="text-xs font-semibold text-zinc-700 sm:col-span-2">Languages<input value={languages} onChange={(event) => setLanguages(event.target.value)} className="field mt-1.5" placeholder="English, Nepali, Japanese" /><span className="mt-1 block text-[10px] font-normal text-zinc-400">Separate languages with commas.</span></label>
              <label className="text-xs font-semibold text-zinc-700 sm:col-span-2">Short bio<textarea value={bio} onChange={(event) => setBio(event.target.value)} className="textarea-field mt-1.5 min-h-24" placeholder="A short internal profile note" /></label>
            </div>
          </section>

          <section className="surface-flat">
            <div className="panel-header"><div><h2 className="section-heading">{isTravel ? 'Travel specialties' : 'Expertise & specialties'}</h2><p className="section-description">{isTravel ? 'Used by managers when assigning destination-specific inquiries.' : `Used by managers when assigning ${leadPlural.toLowerCase()} that need specific expertise.`}</p></div></div>
            <div className="panel-body">
              <div className="flex flex-wrap gap-2">
                {destinationTags.length === 0 && <span className="text-xs text-zinc-400">No specialties added yet.</span>}
                {destinationTags.map((tag) => (
                  <button key={tag} type="button" onClick={() => setDestinationTags((current) => current.filter((item) => item !== tag))} className="button-secondary button-sm">{tag}<X className="h-3 w-3" /></button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={newDestination} onChange={(event) => setNewDestination(event.target.value)} onKeyDown={handleDestinationKey} className="field" placeholder={isTravel ? 'Add a destination' : 'Add a specialty'} />
                <button type="button" onClick={() => addDestination(newDestination)} className="button-secondary"><Plus className="h-4 w-4" /> Add</button>
              </div>
              {isTravel && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  {COMMON_DESTINATIONS.filter((destination) => !destinationTags.includes(destination)).slice(0, 12).map((destination) => (
                    <button key={destination} type="button" onClick={() => addDestination(destination)} className="button-ghost button-sm">+ {destination}</button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="surface-flat">
            <div className="panel-header"><div><h2 className="section-heading">Availability</h2><p className="section-description">How the CRM should treat your current work state.</p></div></div>
            <div className="panel-body space-y-4">
              <label className="block text-xs font-semibold text-zinc-700">Status<select value={status} onChange={(event) => setStatus(event.target.value as AgentStatus)} className="select-field mt-1.5"><option value="available">Available</option><option value="in_call">In call</option><option value="on_break">On break</option><option value="offline">Offline</option></select></label>
              {profile.role === 'agent' && (
                <label className="flex items-start gap-3 border-t border-line pt-4"><input type="checkbox" checked={acceptingLeads} onChange={(event) => setAcceptingLeads(event.target.checked)} className="mt-0.5" /><span><span className="block text-xs font-semibold text-zinc-800">Accept new {leadPlural.toLowerCase()}</span><span className="mt-1 block text-[11px] leading-5 text-zinc-500">Pause this when you should not receive new assignments.</span></span></label>
              )}
            </div>
          </section>

          <section className="surface-flat">
            <div className="panel-header"><div><h2 className="section-heading">Preferences</h2><p className="section-description">Small defaults for your daily workflow.</p></div></div>
            <div className="panel-body space-y-4">
              <label className="block text-xs font-semibold text-zinc-700">Default country code<input value={countryCode} onChange={(event) => setCountryCode(event.target.value)} className="field mt-1.5 font-mono" /></label>
              <label className="block text-xs font-semibold text-zinc-700">Auto-away after<input type="number" min={5} max={240} value={idleAutoAway} onChange={(event) => setIdleAutoAway(Number(event.target.value))} className="field mt-1.5 font-mono" /><span className="mt-1 block text-[10px] font-normal text-zinc-400">Minutes without activity.</span></label>
              <label className="flex items-start gap-3 border-t border-line pt-4"><input type="checkbox" checked={directWhatsApp} onChange={(event) => setDirectWhatsApp(event.target.checked)} className="mt-0.5" /><span><span className="block text-xs font-semibold text-zinc-800">Open WhatsApp directly</span><span className="mt-1 block text-[11px] leading-5 text-zinc-500">Skip the message preview when using a quick WhatsApp action.</span></span></label>
            </div>
          </section>

          {saved && <div role="status" className="surface-flat flex items-center gap-2 p-3 text-xs font-medium text-zinc-700"><CheckCircle2 className="h-4 w-4 text-success" /> Profile saved.</div>}
        </aside>
      </div>
    </form>
  );
}

export default function ProfilePage() {
  const { currentUser } = useApp();
  return <ProfileForm key={`${currentUser.id}:${currentUser.updated_at || ''}`} profile={currentUser} />;
}
