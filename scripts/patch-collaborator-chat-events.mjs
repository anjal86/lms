import fs from 'node:fs';

function patchFile(path, edits) {
  let source = fs.readFileSync(path, 'utf8');
  for (const [label, from, to] of edits) {
    if (!source.includes(from)) throw new Error(`Patch target missing in ${path}: ${label}`);
    source = source.replace(from, to);
  }
  fs.writeFileSync(path, source);
}

patchFile('src/app/api/conversations/[id]/collaborators/route.ts', [
  [
    'admin import',
    "import { getApiActor, isManagement, type ApiActor } from '@/lib/auth/api-actor';\n",
    "import { getApiActor, isManagement, type ApiActor } from '@/lib/auth/api-actor';\nimport { createSupabaseAdminClient } from '@/lib/supabase/admin';\n",
  ],
  [
    'conversation contact id',
    ".select('id,assigned_to')",
    ".select('id,assigned_to,contact_id')",
  ],
  [
    'member profile fields',
    ".select('id')\n    .eq('workspace_id', actor.profile.workspace_id)",
    ".select('id,full_name,email')\n    .eq('workspace_id', actor.profile.workspace_id)",
  ],
  [
    'post collaborator mutation',
    `  const { error } = await actor.supabase.from('conversation_collaborators').upsert({\n    workspace_id: actor.profile.workspace_id,\n    conversation_id: id,\n    user_id: parsed.data.user_id,\n    created_by: actor.user.id,\n  }, { onConflict: 'conversation_id,user_id' });\n  if (error) return NextResponse.json({ error: 'Unable to add collaborator.' }, { status: 500 });\n  return NextResponse.json({ ok: true });`,
    `  const { data: existingCollaborator } = await actor.supabase\n    .from('conversation_collaborators')\n    .select('user_id')\n    .eq('workspace_id', actor.profile.workspace_id)\n    .eq('conversation_id', id)\n    .eq('user_id', parsed.data.user_id)\n    .maybeSingle();\n  if (existingCollaborator) return NextResponse.json({ ok: true, changed: false });\n\n  const { error } = await actor.supabase.from('conversation_collaborators').insert({\n    workspace_id: actor.profile.workspace_id,\n    conversation_id: id,\n    user_id: parsed.data.user_id,\n    created_by: actor.user.id,\n  });\n  if (error) return NextResponse.json({ error: 'Unable to add collaborator.' }, { status: 500 });\n\n  const admin = createSupabaseAdminClient();\n  const { error: eventError } = await admin.from('conversation_events').insert({\n    workspace_id: actor.profile.workspace_id,\n    conversation_id: id,\n    contact_id: conversation.contact_id,\n    event_type: 'collaborator_added',\n    actor_id: actor.user.id,\n    payload: {\n      collaborator_id: member.id,\n      collaborator_name: member.full_name || member.email || 'Team member',\n    },\n  });\n  if (eventError) console.error('Unable to log collaborator addition:', eventError.message);\n  return NextResponse.json({ ok: true, changed: true });`,
  ],
  [
    'delete collaborator mutation',
    `  const { error } = await actor.supabase\n    .from('conversation_collaborators')\n    .delete()\n    .eq('workspace_id', actor.profile.workspace_id)\n    .eq('conversation_id', id)\n    .eq('user_id', userId);\n  if (error) return NextResponse.json({ error: 'Unable to remove collaborator.' }, { status: 500 });\n  return NextResponse.json({ ok: true });`,
    `  const { data: existingCollaborator } = await actor.supabase\n    .from('conversation_collaborators')\n    .select('user_id')\n    .eq('workspace_id', actor.profile.workspace_id)\n    .eq('conversation_id', id)\n    .eq('user_id', userId)\n    .maybeSingle();\n  if (!existingCollaborator) return NextResponse.json({ ok: true, changed: false });\n\n  const { data: member } = await actor.supabase\n    .from('profiles')\n    .select('id,full_name,email')\n    .eq('workspace_id', actor.profile.workspace_id)\n    .eq('id', userId)\n    .maybeSingle();\n\n  const { error } = await actor.supabase\n    .from('conversation_collaborators')\n    .delete()\n    .eq('workspace_id', actor.profile.workspace_id)\n    .eq('conversation_id', id)\n    .eq('user_id', userId);\n  if (error) return NextResponse.json({ error: 'Unable to remove collaborator.' }, { status: 500 });\n\n  const conversation = await conversationExists(actor, id);\n  const admin = createSupabaseAdminClient();\n  const { error: eventError } = await admin.from('conversation_events').insert({\n    workspace_id: actor.profile.workspace_id,\n    conversation_id: id,\n    contact_id: conversation?.contact_id || null,\n    event_type: 'collaborator_removed',\n    actor_id: actor.user.id,\n    payload: {\n      collaborator_id: userId,\n      collaborator_name: member?.full_name || member?.email || 'Team member',\n    },\n  });\n  if (eventError) console.error('Unable to log collaborator removal:', eventError.message);\n  return NextResponse.json({ ok: true, changed: true });`,
  ],
]);

patchFile('src/components/inbox/StableInbox.tsx', [
  [
    'timeline collaborator event types',
    "const EVENT_TYPES = new Set(['state_changed', 'assigned', 'priority_changed', 'lifecycle_changed', 'next_action_changed', 'contact_tag_changed']);",
    "const EVENT_TYPES = new Set(['state_changed', 'assigned', 'priority_changed', 'lifecycle_changed', 'next_action_changed', 'contact_tag_changed', 'collaborator_added', 'collaborator_removed']);",
  ],
]);

patchFile('src/components/inbox/MetaConversationTimeline.tsx', [
  [
    'event actor fields',
    `type ChatEvent = {\n  id: string;\n  event_type: string;\n  payload: Record<string, unknown>;\n  created_at: string;\n};`,
    `type ChatEvent = {\n  id: string;\n  event_type: string;\n  payload: Record<string, unknown>;\n  created_at: string;\n  actor_id?: string | null;\n  actor?: { full_name?: string | null } | null;\n};`,
  ],
  [
    'collaborator event text',
    `function eventText(event: ChatEvent) {\n  if (event.event_type === 'assigned') return \`Assigned to \${String(event.payload.assigned_to_name || 'team member')}\`;`,
    `function eventText(event: ChatEvent) {\n  if (event.event_type === 'collaborator_added' || event.event_type === 'collaborator_removed') {\n    const collaboratorId = typeof event.payload.collaborator_id === 'string' ? event.payload.collaborator_id : null;\n    const collaboratorName = String(event.payload.collaborator_name || 'team member');\n    const actorName = event.actor?.full_name || 'Team member';\n    const selfChange = Boolean(event.actor_id && collaboratorId && event.actor_id === collaboratorId);\n    if (event.event_type === 'collaborator_added') {\n      return selfChange ? \`\${collaboratorName} joined as collaborator\` : \`\${actorName} added \${collaboratorName} as collaborator\`;\n    }\n    return selfChange ? \`\${collaboratorName} left as collaborator\` : \`\${actorName} removed \${collaboratorName} as collaborator\`;\n  }\n  if (event.event_type === 'assigned') return \`Assigned to \${String(event.payload.assigned_to_name || 'team member')}\`;`,
  ],
]);
