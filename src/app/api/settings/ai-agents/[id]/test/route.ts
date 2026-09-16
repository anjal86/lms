import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { decideWithAiProvider } from '@/lib/ai/llm-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a test message.' }, { status: 400 });

  const { id } = await context.params;
  const [{ data: agent, error }, { data: workspace }] = await Promise.all([
    actor.supabase.from('ai_agents').select('id,name,provider_config_id,model,instructions,tone,languages,temperature').eq('workspace_id', actor.profile.workspace_id).eq('id', id).maybeSingle(),
    actor.supabase.from('workspaces').select('name').eq('id', actor.profile.workspace_id).maybeSingle(),
  ]);
  if (error || !agent) return NextResponse.json({ error: 'AI agent not found.' }, { status: 404 });

  try {
    const decision = await decideWithAiProvider(actor.profile.workspace_id, {
      name: agent.name,
      model: agent.model,
      instructions: agent.instructions,
      tone: agent.tone,
      languages: agent.languages || ['auto'],
      temperature: Number(agent.temperature) || 0.3,
      providerConfigId: agent.provider_config_id || null,
    }, {
      workspaceName: workspace?.name || 'Workspace',
      customerName: 'Test customer',
      lifecycle: 'new',
      conversation: [{ direction: 'inbound', body: parsed.data.message, sentAt: new Date().toISOString() }],
    });
    return NextResponse.json({ decision });
  } catch (providerError) {
    console.error('AI agent test failed:', providerError);
    return NextResponse.json({ error: providerError instanceof Error ? providerError.message : 'AI provider test failed.' }, { status: 502 });
  }
}
