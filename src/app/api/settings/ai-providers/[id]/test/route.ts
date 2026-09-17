import { NextResponse } from 'next/server';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decideWithAiProviderDetailed } from '@/lib/ai/llm-provider';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });
  const { id } = await context.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: 'Valid provider ID required.' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: provider } = await admin.from('ai_provider_configs')
    .select('id,name,provider,is_active')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsedId.data)
    .maybeSingle();
  if (!provider) return NextResponse.json({ error: 'AI provider not found.' }, { status: 404 });
  if (!provider.is_active) return NextResponse.json({ error: 'Enable the provider before testing it.' }, { status: 400 });

  const { data: agent } = await admin.from('ai_agents')
    .select('id,name,model,tone,languages,temperature')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('provider_config_id', provider.id)
    .not('model', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!agent?.model) {
    return NextResponse.json({ error: 'Bind this provider to an AI agent with a model ID first, then test the connection.' }, { status: 409 });
  }

  try {
    const result = await decideWithAiProviderDetailed(actor.profile.workspace_id, {
      name: agent.name || 'Provider health check',
      model: agent.model,
      instructions: 'This is a provider connectivity test. Return a short safe reply acknowledging the test.',
      tone: agent.tone || 'professional',
      languages: Array.isArray(agent.languages) ? agent.languages : ['auto'],
      temperature: Number(agent.temperature) || 0.1,
      providerConfigId: provider.id,
    }, {
      workspaceName: 'Provider health check',
      customerName: 'Test',
      conversation: [{ direction: 'inbound', body: 'Reply briefly to confirm this model connection is working.', sentAt: new Date().toISOString() }],
    });
    return NextResponse.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      latency_ms: result.latencyMs,
      retries: result.retries,
      usage: result.usage,
      decision: result.decision,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message.slice(0, 800) }, { status: 502 });
  }
}
