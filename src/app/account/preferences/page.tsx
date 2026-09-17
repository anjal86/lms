'use client';

import { Save, Settings2 } from 'lucide-react';
import { useApp } from '@/lib/store';
import type { DateFormat, UserPreferences } from '@/lib/types';

export default function AccountPreferencesPage() {
  const { currentUser, updateUserPreferences, showToast } = useApp();
  const preferences = currentUser.user_preferences || {} as UserPreferences;

  const save = (patch: Partial<UserPreferences>) => {
    if (!currentUser.id) return;
    updateUserPreferences(currentUser.id, patch);
    showToast('Preferences saved.', 'success');
  };

  return (
    <section className="surface-flat">
      <div className="panel-header"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Settings2 className="h-4 w-4" /></span><div><h2 className="section-heading">Preferences</h2><p className="section-description">Personal defaults for how the CRM behaves for you.</p></div></div></div>
      <div className="panel-body grid gap-5 sm:grid-cols-2">
        <label className="text-xs font-semibold text-zinc-700">Language<input className="field mt-1.5" defaultValue={preferences.language || 'auto'} onBlur={(event) => save({ language: event.target.value.trim() || 'auto' })} placeholder="auto or en" /></label>
        <label className="text-xs font-semibold text-zinc-700">Timezone<input className="field mt-1.5" defaultValue={preferences.timezone || ''} onBlur={(event) => save({ timezone: event.target.value.trim() || null })} placeholder="Asia/Kathmandu" /></label>
        <label className="text-xs font-semibold text-zinc-700">Date format<select className="select-field mt-1.5 w-full" value={preferences.date_format || ''} onChange={(event) => save({ date_format: (event.target.value || null) as DateFormat | null })}><option value="">Use workspace default</option><option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option></select></label>
        <label className="text-xs font-semibold text-zinc-700">Default landing page<select className="select-field mt-1.5 w-full" value={preferences.default_landing_page || '/leads'} onChange={(event) => save({ default_landing_page: event.target.value as UserPreferences['default_landing_page'] })}><option value="/dashboard">Dashboard</option><option value="/leads">Leads / Work</option><option value="/follow-ups">Follow-ups</option><option value="/analytics">Analytics</option><option value="/team">Team</option></select></label>
        <label className="text-xs font-semibold text-zinc-700">Default country code<input className="field mt-1.5 font-mono" defaultValue={preferences.default_country_code || '+977'} onBlur={(event) => save({ default_country_code: event.target.value.trim() || '+977' })} /></label>
        <label className="text-xs font-semibold text-zinc-700">Auto-away after (minutes)<input type="number" min={5} max={240} className="field mt-1.5" defaultValue={preferences.idle_auto_away_minutes || 15} onBlur={(event) => save({ idle_auto_away_minutes: Math.max(5, Number(event.target.value) || 15) })} /></label>
        <label className="flex items-start gap-3 rounded-lg border border-zinc-200 p-4 sm:col-span-2"><input type="checkbox" checked={preferences.instant_whatsapp_direct === true} onChange={(event) => save({ instant_whatsapp_direct: event.target.checked })} className="mt-0.5" /><span><span className="block text-sm font-medium text-zinc-800">Open WhatsApp directly</span><span className="mt-1 block text-xs leading-5 text-zinc-500">Skip the quick-message preview for direct WhatsApp actions.</span></span></label>
        <div className="sm:col-span-2 flex items-center gap-2 text-xs text-zinc-400"><Save className="h-3.5 w-3.5" /> Changes save as you leave or change each field.</div>
      </div>
    </section>
  );
}
