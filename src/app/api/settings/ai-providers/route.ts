import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { encryptIntegrationSecret } from '@/lib/integrations/secrets';
import { AI_PROVIDER_PRESETS, aiProviderPreset } from '@/lib/ai/provider-catalog';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SaveSchema = z.object({
  id: uuidSchema.nullable().optional(),
  name: z.string().trim().min(1).max(120),
  provider: z.enum(['openai','anthropic','google','mistral','openrouter','groq','deepseek','xai','together','fireworks','custom_openai']),
  base_url: z.string().trim().max(1000).optional().default(''),
  api_key: z.string().trim().max(10000).optional().default(''),
  clear_api_key: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
});

function validateCustomUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { return 'Enter a valid custom provider base URL.'; }
  const allowPrivate = process.env.AI_ALLOW_PRIVATE_PROVIDER_NETWORKS?.trim().toLowerCase() === 'true';
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) {
    return 'Custom providers must use HTTPS unless private provider networks are explicitly enabled on the server.';
  }
  if (url.username || url.password || url.hash) return 'Provider URL cannot contain credentials or fragments.';
  return null;
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const { data: configs, error } = await actor.supabase
    .from('ai_provider_configs')
    .select('id,workspace_id,name,provider,api_style,base_url,is_active,created_at,updated_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Unable to load AI providers.' }, { status: 500 });

  const admin = createSupabaseAdminClient();
  const { data: secrets } = await admin
    .from('ai_provider_secrets')
    .select('provider_config_id')
    .eq('workspace_id', actor.profile.workspace_id);
  const secretIds = new Set((secrets || []).map((row) => String(row.provider_config_id)));

  return NextResponse.json({
    providers: (configs || []).map((config) => ({ ...config, has_api_key: secretIds.has(String(config.id)) })),
    presets: AI_PROVIDER_PRESETS,
    legacy_mistral_configured: Boolean(process.env.MISTRAL_API_KEY?.trim()),
    private_provider_networks_enabled: process.env.AI_ALLOW_PRIVATE_PROVIDER_NETWORKS?.trim().toLowerCase() === 'true',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const parsed = SaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid provider configuration.' }, { status: 400 });
  const input = parsed.data;
  const preset = aiProviderPreset(input.provider);
  if (!preset) return NextResponse.json({ error: 'Unsupported AI provider.' }, { status: 400 });

  const baseUrl = input.provider === 'custom_openai' ? input.base_url.trim() : preset.defaultBaseUrl;
  if (input.provider === 'custom_openai') {
    const urlError = validateCustomUrl(baseUrl);
    if (urlError) return NextResponse.json({ error: urlError }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  let hasExistingKey = false;
  if (input.id) {
    const { data: existing } = await admin.from('ai_provider_configs')
      .select('id')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', input.id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'AI provider connection not found.' }, { status: 404 });
    const { data: secret } = await admin.from('ai_provider_secrets')
      .select('provider_config_id')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('provider_config_id', input.id)
      .maybeSingle();
    hasExistingKey = Boolean(secret);
  }

  const needsKey = input.provider !== 'custom_openai';
  const willHaveKey = input.clear_api_key ? false : Boolean(input.api_key || hasExistingKey);
  if (input.is_active && needsKey && !willHaveKey) {
    return NextResponse.json({ error: `${preset.label} requires an API key before it can be enabled.` }, { status: 400 });
  }

  let encryptedKey: string | null = null;
  if (input.api_key && !input.clear_api_key) {
    try { encryptedKey = encryptIntegrationSecret(input.api_key); }
    catch (error) {
      console.error('AI provider key encryption failed:', error);
      return NextResponse.json({ error: 'Server encryption is not configured correctly.' }, { status: 500 });
    }
  }

  const { data: providerId, error } = await actor.supabase.rpc('save_workspace_ai_provider', {
    p_provider_id: input.id ?? null,
    p_name: input.name,
    p_provider: input.provider,
    p_api_style: preset.apiStyle,
    p_base_url: baseUrl,
    p_is_active: input.is_active,
    p_encrypted_api_key: encryptedKey,
    p_clear_api_key: input.clear_api_key,
  });
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === '23505' ? 409 : 400;
    return NextResponse.json({ error: error.message || 'Unable to save AI provider.' }, { status });
  }

  const { data: config } = await actor.supabase
    .from('ai_provider_configs')
    .select('id,workspace_id,name,provider,api_style,base_url,is_active,created_at,updated_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', providerId)
    .single();

  return NextResponse.json({ provider: { ...config, has_api_key: input.clear_api_key ? false : Boolean(input.api_key || hasExistingKey) } }, { status: input.id ? 200 : 201 });
}
