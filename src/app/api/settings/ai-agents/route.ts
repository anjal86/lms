import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SaveSchema = z.object({
  id: uuidSchema.nullable().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600).nullable().optional(),
  model: z.string().trim().min(1).max(120).default('mistral-medium-latest'),
  instructions: z.string().max(12000).default(''),
  tone: z.string().trim().min(1).max(240).default('professional and friendly'),
  languages: z.array(z.string().trim().min(1).max(40)).min(1).max(12).default(['auto']),
  mode: z.enum(['off','assist','auto','auto_handoff']).default('assist'),
  is_active: z.boolean().default(false),
  temperature: z.number().min(0).max(1.5).default(0.3),
  confidence_threshold: z.number().min(0).max(1).default(0.65),
  response_delay_min_seconds: z.number().int().min(0).max(120).default(2),
  response_delay_max_seconds: z.number().int().min(0).max(180).default(8),
  handoff_team_key: z.string().trim().max(80).nullable().optional(),
  handoff_keywords: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  allow_when_human_assigned: z.boolean().default(false),
  connection_ids: z.array(uuidSchema).max(50).default([]),
}).superRefine((value, ctx) => {
  if (value.response_delay_max_seconds < value.response_delay_min_seconds) {
    ctx.addIssue({ code: 'custom', path: ['response_delay_max_seconds'], message: 'Maximum delay must be greater than or equal to minimum delay.' });
  }
});

const AGENT_SELECT = `
  id,workspace_id,name,description,provider,model,mistral_agent_id,instructions,tone,languages,mode,is_active,
  temperature,confidence_threshold,response_delay_min_seconds,response_delay_max_seconds,handoff_team_key,
  handoff_keywords,allow_when_human_assigned,created_by,created_at,updated_at,
  connections:ai_agent_connections(connection_id,is_enabled)
`;

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const { data, error } = await actor.supabase
    .from('ai_agents')
    .select(AGENT_SELECT)
    .eq('workspace_id', actor.profile.workspace_id)
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('Load AI agents failed:', error.message);
    return NextResponse.json({ error: 'Unable to load AI agents.' }, { status: 500 });
  }

  return NextResponse.json({
    agents: data || [],
    provider: {
      name: 'Mistral AI',
      configured: Boolean(process.env.MISTRAL_API_KEY?.trim()),
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const parsed = SaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid AI agent configuration.', details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const { data: agentId, error } = await actor.supabase.rpc('save_workspace_ai_agent', {
    p_agent_id: input.id ?? null,
    p_name: input.name,
    p_description: input.description ?? null,
    p_model: input.model,
    p_instructions: input.instructions,
    p_tone: input.tone,
    p_languages: input.languages,
    p_mode: input.mode,
    p_is_active: input.is_active,
    p_temperature: input.temperature,
    p_confidence_threshold: input.confidence_threshold,
    p_response_delay_min_seconds: input.response_delay_min_seconds,
    p_response_delay_max_seconds: input.response_delay_max_seconds,
    p_handoff_team_key: input.handoff_team_key ?? null,
    p_handoff_keywords: input.handoff_keywords,
    p_allow_when_human_assigned: input.allow_when_human_assigned,
    p_connection_ids: input.connection_ids,
  });

  if (error) {
    console.error('Save AI agent failed:', error.message);
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === '23505' ? 409 : error.code === '22023' || error.code === '23514' ? 400 : 500;
    return NextResponse.json({ error: error.message || 'Unable to save AI agent.' }, { status });
  }

  const { data: agent } = await actor.supabase
    .from('ai_agents')
    .select(AGENT_SELECT)
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', agentId)
    .single();

  return NextResponse.json({ agent }, { status: input.id ? 200 : 201 });
}
