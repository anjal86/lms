import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SourceType = z.enum(['manual','faq','service','pricing','policy','website','document']);
const SaveSchema = z.object({
  id: uuidSchema.nullable().optional(),
  name: z.string().trim().min(1).max(160),
  source_type: SourceType.default('manual'),
  source_url: z.string().trim().max(1500).nullable().optional(),
  content: z.string().trim().min(1).max(250000),
  is_active: z.boolean().default(true),
});

function chunkText(input: string) {
  const clean = input.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const paragraphs = clean.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  const target = 1400;
  const max = 1900;
  const overlap = 180;

  const push = () => {
    const value = current.trim();
    if (!value) return;
    chunks.push(value);
    current = value.length > overlap ? value.slice(-overlap) : value;
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > max) {
      if (current.trim()) push();
      let start = 0;
      while (start < paragraph.length) {
        const end = Math.min(paragraph.length, start + max);
        chunks.push(paragraph.slice(start, end).trim());
        if (end === paragraph.length) break;
        start = Math.max(start + 1, end - overlap);
      }
      current = '';
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > target && current) push();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
    if (current.length >= max) push();
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((value, index) => value && value !== chunks[index - 1]);
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) return NextResponse.json({ error: 'Valid knowledge source ID required.' }, { status: 400 });
    const [{ data: source, error: sourceError }, { data: chunks, error: chunkError }] = await Promise.all([
      actor.supabase.from('knowledge_sources')
        .select('id,name,source_type,source_url,is_active,metadata,created_at,updated_at')
        .eq('workspace_id', actor.profile.workspace_id).eq('id', parsedId.data).maybeSingle(),
      actor.supabase.from('knowledge_chunks')
        .select('chunk_index,content')
        .eq('workspace_id', actor.profile.workspace_id).eq('source_id', parsedId.data)
        .order('chunk_index', { ascending: true }),
    ]);
    if (sourceError || chunkError) return NextResponse.json({ error: 'Unable to load knowledge source.' }, { status: 500 });
    if (!source) return NextResponse.json({ error: 'Knowledge source not found.' }, { status: 404 });
    return NextResponse.json({ source: { ...source, content: (chunks || []).map((row) => row.content).join('\n\n') } }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const [{ data: sources, error }, { data: chunkRows }] = await Promise.all([
    actor.supabase.from('knowledge_sources')
      .select('id,name,source_type,source_url,is_active,content_hash,created_at,updated_at')
      .eq('workspace_id', actor.profile.workspace_id)
      .order('updated_at', { ascending: false }),
    actor.supabase.from('knowledge_chunks')
      .select('source_id')
      .eq('workspace_id', actor.profile.workspace_id),
  ]);
  if (error) return NextResponse.json({ error: 'Unable to load knowledge sources.' }, { status: 500 });
  const counts = new Map<string, number>();
  for (const row of chunkRows || []) counts.set(String(row.source_id), (counts.get(String(row.source_id)) || 0) + 1);
  return NextResponse.json({
    sources: (sources || []).map((source) => ({ ...source, chunk_count: counts.get(String(source.id)) || 0 })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });
  const parsed = SaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid knowledge source.' }, { status: 400 });

  const input = parsed.data;
  const workspaceId = actor.profile.workspace_id;
  const admin = createSupabaseAdminClient();
  if (input.id) {
    const { data: existing } = await admin.from('knowledge_sources').select('id').eq('workspace_id', workspaceId).eq('id', input.id).maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Knowledge source not found.' }, { status: 404 });
  }

  const chunks = chunkText(input.content);
  if (!chunks.length) return NextResponse.json({ error: 'Knowledge content is empty.' }, { status: 400 });
  if (chunks.length > 250) return NextResponse.json({ error: 'This source is too large. Split it into smaller sources.' }, { status: 400 });
  const contentHash = createHash('sha256').update(input.content).digest('hex');
  const sourcePatch = {
    workspace_id: workspaceId,
    name: input.name,
    source_type: input.source_type,
    source_url: input.source_url || null,
    is_active: input.is_active,
    content_hash: contentHash,
    updated_at: new Date().toISOString(),
  };

  let sourceId = input.id || null;
  if (sourceId) {
    const { error } = await admin.from('knowledge_sources').update(sourcePatch).eq('workspace_id', workspaceId).eq('id', sourceId);
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'A knowledge source with this name already exists.' : 'Unable to update knowledge source.' }, { status: error.code === '23505' ? 409 : 500 });
  } else {
    const { data, error } = await admin.from('knowledge_sources').insert({ ...sourcePatch, created_by: actor.user.id }).select('id').single();
    if (error || !data) return NextResponse.json({ error: error?.code === '23505' ? 'A knowledge source with this name already exists.' : 'Unable to create knowledge source.' }, { status: error?.code === '23505' ? 409 : 500 });
    sourceId = data.id;
  }

  const { error: deleteError } = await admin.from('knowledge_chunks').delete().eq('workspace_id', workspaceId).eq('source_id', sourceId);
  if (deleteError) return NextResponse.json({ error: 'Knowledge source saved, but its search index could not be refreshed.' }, { status: 500 });
  const { error: chunkError } = await admin.from('knowledge_chunks').insert(chunks.map((content, chunkIndex) => ({
    workspace_id: workspaceId,
    source_id: sourceId,
    chunk_index: chunkIndex,
    content,
  })));
  if (chunkError) return NextResponse.json({ error: 'Knowledge source saved, but chunk indexing failed.' }, { status: 500 });

  return NextResponse.json({ source: { id: sourceId, ...sourcePatch, chunk_count: chunks.length } }, { status: input.id ? 200 : 201 });
}

export async function DELETE(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });
  const parsedId = uuidSchema.safeParse(new URL(request.url).searchParams.get('id'));
  if (!parsedId.success) return NextResponse.json({ error: 'Valid knowledge source ID required.' }, { status: 400 });
  const { error } = await actor.supabase.from('knowledge_sources').delete().eq('workspace_id', actor.profile.workspace_id).eq('id', parsedId.data);
  if (error) return NextResponse.json({ error: 'Unable to delete knowledge source.' }, { status: 500 });
  return NextResponse.json({ success: true });
}
