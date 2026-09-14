import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ContactRow = {
  id: string;
  display_name: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  lifecycle_key: string;
  owner_id: string | null;
  last_seen_at: string | null;
};

type Suggestion = {
  key: string;
  left: ContactRow;
  right: ContactRow;
  score: number;
  reasons: Set<string>;
};

function phone(value: string | null) {
  return (value || '').replace(/\D/g, '');
}
function email(value: string | null) {
  return (value || '').trim().toLowerCase();
}
function name(value: string | null) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'contacts.view'))) {
    return NextResponse.json({ error: 'Contact access required.' }, { status: 403 });
  }

  const { data, error } = await actor.supabase
    .from('contacts')
    .select('id,display_name,primary_phone,primary_email,lifecycle_key,owner_id,last_seen_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .order('updated_at', { ascending: false })
    .limit(5000);
  if (error) return NextResponse.json({ error: 'Unable to inspect contacts.' }, { status: 500 });

  const contacts = (data || []) as ContactRow[];
  const suggestions = new Map<string, Suggestion>();
  const byPhone = new Map<string, ContactRow[]>();
  const byEmail = new Map<string, ContactRow[]>();
  const byPhoneTail = new Map<string, ContactRow[]>();

  const add = (a: ContactRow, b: ContactRow, score: number, reason: string) => {
    if (a.id === b.id) return;
    const [left, right] = a.id < b.id ? [a, b] : [b, a];
    const key = `${left.id}:${right.id}`;
    const current = suggestions.get(key) || { key, left, right, score: 0, reasons: new Set<string>() };
    current.score = Math.max(current.score, score);
    current.reasons.add(reason);
    suggestions.set(key, current);
  };

  for (const contact of contacts) {
    const normalizedPhone = phone(contact.primary_phone);
    const normalizedEmail = email(contact.primary_email);
    if (normalizedPhone.length >= 7) byPhone.set(normalizedPhone, [...(byPhone.get(normalizedPhone) || []), contact]);
    if (normalizedEmail.includes('@')) byEmail.set(normalizedEmail, [...(byEmail.get(normalizedEmail) || []), contact]);
    if (normalizedPhone.length >= 9) {
      const tail = normalizedPhone.slice(-8);
      byPhoneTail.set(tail, [...(byPhoneTail.get(tail) || []), contact]);
    }
  }

  for (const group of byPhone.values()) {
    for (let i = 0; i < group.length; i += 1) for (let j = i + 1; j < group.length; j += 1) add(group[i], group[j], 100, 'Same phone number');
  }
  for (const group of byEmail.values()) {
    for (let i = 0; i < group.length; i += 1) for (let j = i + 1; j < group.length; j += 1) add(group[i], group[j], 96, 'Same email address');
  }
  for (const group of byPhoneTail.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const sameName = name(group[i].display_name) && name(group[i].display_name) === name(group[j].display_name);
        add(group[i], group[j], sameName ? 94 : 82, sameName ? 'Same name and matching phone ending' : 'Matching phone ending');
      }
    }
  }

  const rows = [...suggestions.values()]
    .filter((row) => row.score >= 82)
    .sort((a, b) => b.score - a.score || Math.max(new Date(b.left.last_seen_at || 0).getTime(), new Date(b.right.last_seen_at || 0).getTime()) - Math.max(new Date(a.left.last_seen_at || 0).getTime(), new Date(a.right.last_seen_at || 0).getTime()))
    .slice(0, 250)
    .map((row) => ({
      id: row.key,
      score: row.score,
      reasons: [...row.reasons],
      primary_suggestion_id: row.left.last_seen_at && row.right.last_seen_at
        ? (new Date(row.left.last_seen_at) >= new Date(row.right.last_seen_at) ? row.left.id : row.right.id)
        : row.left.id,
      contacts: [row.left, row.right],
    }));

  return NextResponse.json({ suggestions: rows, scanned: contacts.length }, { headers: { 'Cache-Control': 'private, no-store' } });
}
