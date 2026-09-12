import fs from 'node:fs';

function replaceExact(path, from, to, expected = 1) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== expected) {
    throw new Error(`${path}: expected ${expected} occurrence(s), found ${count} for:\n${from.slice(0, 180)}`);
  }
  fs.writeFileSync(path, source.replace(from, to));
}

// Persisted profiles may contain partial preference JSON, but application profiles
// always expose a complete preference object with stable defaults.
replaceExact(
  'src/lib/types.ts',
  '  user_preferences?: Partial<UserPreferences>;',
  '  user_preferences?: UserPreferences;'
);

replaceExact(
  'src/lib/store.tsx',
  `};\n\nconst EMPTY_PROFILE: Profile = {`,
  `};\n\nconst DEFAULT_USER_PREFERENCES: UserPreferences = {\n  idle_auto_away_minutes: 15,\n  default_landing_page: '/leads',\n  kanban_density: 'expanded',\n  instant_whatsapp_direct: false,\n  default_country_code: '+1',\n};\n\nconst EMPTY_PROFILE: Profile = {`
);

replaceExact(
  'src/lib/store.tsx',
  `  certifications: [],\n  created_at: new Date(0).toISOString(),`,
  `  certifications: [],\n  user_preferences: DEFAULT_USER_PREFERENCES,\n  created_at: new Date(0).toISOString(),`
);

replaceExact(
  'src/lib/store.tsx',
  `const normalizeLead = (row: any): Lead => {\n  const quotes = Array.isArray(row.quotes) ? row.quotes : [];\n  return { ...row, quotes, latest_quote: quotes[0] } as Lead;\n};`,
  `const normalizeLead = (row: any): Lead => {\n  const quotes = Array.isArray(row.quotes) ? row.quotes : [];\n  return { ...row, quotes, latest_quote: row.latest_quote || quotes[0] } as Lead;\n};\nconst normalizeProfile = (row: any): Profile => ({\n  ...row,\n  destination_tags: Array.isArray(row.destination_tags) ? row.destination_tags : [],\n  languages: Array.isArray(row.languages) ? row.languages : [],\n  certifications: Array.isArray(row.certifications) ? row.certifications : [],\n  user_preferences: { ...DEFAULT_USER_PREFERENCES, ...(row.user_preferences || {}) },\n}) as Profile;`
);

replaceExact(
  'src/lib/store.tsx',
  `    setProfiles((profileRes.data || []) as Profile[]);`,
  `    setProfiles((profileRes.data || []).map(normalizeProfile));`
);

replaceExact(
  'src/lib/store.tsx',
  `    const user_preferences = { ...(profile.user_preferences || {}), ...prefs };`,
  `    const user_preferences: UserPreferences = { ...DEFAULT_USER_PREFERENCES, ...(profile.user_preferences || {}), ...prefs };`
);

replaceExact(
  'src/lib/store.tsx',
  `  const updateIncentiveTiers = (nextTiers: IncentiveTier[]) => {\n    if (currentUser.role !== 'admin') return showToast('Administrator access required.', 'error');\n    setTiers(nextTiers);\n    showToast('Incentive tier edits require the protected server administration endpoint.', 'warning');\n  };`,
  `  const updateIncentiveTiers = (nextTiers: IncentiveTier[]) => {\n    if (currentUser.role !== 'admin') return showToast('Administrator access required.', 'error');\n    const previous = tiers;\n    setTiers(nextTiers);\n    void fetch('/api/incentives', {\n      method: 'PUT',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ tiers: nextTiers }),\n    }).then(async (response) => {\n      if (!response.ok) throw new Error((await response.json()).error || 'Incentive update failed');\n      showToast('Incentive tiers saved.', 'success');\n    }).catch((error) => {\n      setTiers(previous);\n      handleMutationError('Incentive tier update', error);\n    });\n  };`
);

replaceExact(
  'src/lib/store.tsx',
  `    const followUp: FollowUp = { id: uuid(), lead_id: data.lead_id, assigned_to: assignedTo, title: data.title || 'Scheduled Follow-up', scheduled_at: data.scheduled_at || new Date(Date.now() + 86400000).toISOString(), channel: data.channel || 'call', priority: data.priority || 'normal', status: 'pending', notes: data.notes || '', created_at: now };`,
  `    const followUp: FollowUp = { id: uuid(), lead_id: data.lead_id, assigned_to: assignedTo, title: data.title || 'Scheduled Follow-up', scheduled_at: data.scheduled_at || new Date(Date.now() + 86400000).toISOString(), channel: data.channel || 'call', priority: data.priority || 'normal', status: 'pending', notes: data.notes || '', retry_count: data.retry_count || 0, rescheduled_from_id: data.rescheduled_from_id, created_at: now };`
);

// Correct overdue counts: pending future tasks are not overdue.
for (const path of ['src/components/layout/Header.tsx', 'src/components/layout/Sidebar.tsx']) {
  replaceExact(
    path,
    `    return fu.status === 'pending' || (fu.status === 'missed' && isPast);`,
    `    return (fu.status === 'pending' || fu.status === 'missed') && isPast;`
  );
}

// Never teach users to paste a checked-in secret.
replaceExact(
  'src/app/settings/page.tsx',
  'travel_lms_secret_webhook_key_2026',
  '<YOUR_WEBHOOK_SECRET>'
);

// Team invites are asynchronous and only succeed once the server has created the auth user/profile.
replaceExact(
  'src/components/team/InviteMemberModal.tsx',
  `  const { createProfile, showToast } = useApp();`,
  `  const { createProfile, showToast, currentUser } = useApp();`
);
replaceExact(
  'src/components/team/InviteMemberModal.tsx',
  `  const handleSubmit = (e: React.FormEvent) => {`,
  `  const handleSubmit = async (e: React.FormEvent) => {`
);
replaceExact(
  'src/components/team/InviteMemberModal.tsx',
  `    createProfile({`,
  `    const createdProfile = await createProfile({`
);
replaceExact(
  'src/components/team/InviteMemberModal.tsx',
  `    });\n\n    showToast(\`Team member \${fullName.trim()} created successfully\`, 'success');\n    if (onSuccess) onSuccess();\n    onClose();`,
  `    });\n\n    if (!createdProfile) return;\n    showToast(\`Invitation sent to \${fullName.trim()}\`, 'success');\n    if (onSuccess) onSuccess();\n    onClose();`
);
replaceExact(
  'src/components/team/InviteMemberModal.tsx',
  `                  <option value="agent">Travel Consultant</option>\n                  <option value="manager">Sales Manager</option>\n                  <option value="admin">Super Admin</option>`,
  `                  <option value="agent">Travel Consultant</option>\n                  {currentUser.role === 'admin' && <option value="manager">Sales Manager</option>}\n                  {currentUser.role === 'admin' && <option value="admin">Super Admin</option>}`
);

console.log('Hardening codemod completed successfully.');
