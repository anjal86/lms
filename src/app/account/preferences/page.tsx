'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/store';
import type { DateFormat, UserPreferences } from '@/lib/types';
import { FormField, SettingsSection, SettingsToggle, StickySaveBar } from '@/components/settings/SettingsPrimitives';

type Draft = { language: string; timezone: string; date_format: string; default_landing_page: string; default_country_code: string; idle_auto_away_minutes: number; instant_whatsapp_direct: boolean };
const fromPreferences = (preferences: UserPreferences): Draft => ({
  language: preferences.language || 'auto', timezone: preferences.timezone || '',
  date_format: preferences.date_format || '', default_landing_page: preferences.default_landing_page || '/leads',
  default_country_code: preferences.default_country_code || '+977', idle_auto_away_minutes: preferences.idle_auto_away_minutes || 15,
  instant_whatsapp_direct: preferences.instant_whatsapp_direct === true,
});

export default function AccountPreferencesPage() {
  const { currentUser, updateUserPreferences, showToast } = useApp();
  const saved = fromPreferences(currentUser.user_preferences || {} as UserPreferences);
  const [draft, setDraft] = useState<Draft>(saved);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(saved); setError(''); }, [currentUser.id, currentUser.user_preferences]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const save = () => {
    if (!currentUser.id) return;
    if (draft.idle_auto_away_minutes < 5 || draft.idle_auto_away_minutes > 240) { setError('Auto-away must be between 5 and 240 minutes.'); return; }
    updateUserPreferences(currentUser.id, {
      ...draft, language: draft.language.trim() || 'auto', timezone: draft.timezone.trim() || null,
      date_format: (draft.date_format || null) as DateFormat | null,
      default_landing_page: draft.default_landing_page as UserPreferences['default_landing_page'],
      default_country_code: draft.default_country_code.trim() || '+977',
    });
    setError(''); showToast('Preferences saved.', 'success');
  };
  return <div className="surface-flat p-5">
    <SettingsSection id="account-preferences" title="Preferences" description="Personal defaults for how the CRM behaves for you.">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Language"><input className="field" value={draft.language} onChange={(event) => change('language', event.target.value)} placeholder="auto or en" /></FormField>
        <FormField label="Timezone"><input className="field" value={draft.timezone} onChange={(event) => change('timezone', event.target.value)} placeholder="Asia/Kathmandu" /></FormField>
        <FormField label="Date format"><select className="select-field w-full" value={draft.date_format} onChange={(event) => change('date_format', event.target.value)}><option value="">Use workspace default</option><option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option></select></FormField>
        <FormField label="Default landing page"><select className="select-field w-full" value={draft.default_landing_page} onChange={(event) => change('default_landing_page', event.target.value)}><option value="/dashboard">Dashboard</option><option value="/leads">Leads / Work</option><option value="/follow-ups">Follow-ups</option><option value="/analytics">Analytics</option><option value="/team">Team</option></select></FormField>
        <FormField label="Default country code"><input className="field font-mono" value={draft.default_country_code} onChange={(event) => change('default_country_code', event.target.value)} /></FormField>
        <FormField label="Auto-away after (minutes)"><input type="number" min={5} max={240} className="field" value={draft.idle_auto_away_minutes} onChange={(event) => change('idle_auto_away_minutes', Number(event.target.value))} aria-invalid={!!error} aria-describedby={error ? 'away-error' : undefined} /></FormField>
        {error && <p id="away-error" role="alert" className="text-[13px] text-red-700 sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2"><SettingsToggle label="Open WhatsApp directly" description="Skip the quick-message preview for direct WhatsApp actions." checked={draft.instant_whatsapp_direct} onChange={(value) => change('instant_whatsapp_direct', value)} /></div>
      </div>
    </SettingsSection>
    {dirty && <StickySaveBar saving={false} onSave={save} onDiscard={() => { setDraft(saved); setError(''); }} />}
  </div>;
}
