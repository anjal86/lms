import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/integrations/catalog';
import { buildIntegrationSetup, integrationCatalogWithEnvStatus, publicAppUrl } from '@/lib/integrations/environment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ManualConnectionSchema = z.object({
  provider: z.enum(['email', 'website', 'api']),
  display_name: z.string().trim().min(2).max(120),
  external_account_id: z.string().trim().max(240).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const PatchSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['pause', 'resume', 'disconnect']),
});

async function getActor() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) } as const;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_active) return { error: NextResponse.json({ error: 'Account disabled.' }, { status: 403 }) } as const;
  return { supabase, user, profile } as const;
}

export async function GET(request: Request) {
  const actor = await getActor();
  if ('error' in actor) return actor.error;

  const { data, error } = await actor.supabase
    .from('integration_connections')
    .select('id,provider,display_name,external_account_id,status,capabilities,config,last_sync_at,last_event_at,last_error,created_at,updated_at')
    .order('created_at', { ascending: true });

  const appUrl = publicAppUrl(request.url);
  const catalog = integrationCatalogWithEnvStatus();
  const setup = buildIntegrationSetup(appUrl);

  if (error) {
    if (error.code === '42P01' || error.message.toLowerCase().includes('integration_connections')) {
      return NextResponse.json({
        connections: [],
        catalog,
        setup,
        migrationRequired: true,
        message: 'Apply the omnichannel database migration to enable connections.',
      });
    }
    console.error('Integration connection read failed:', error.message);
    return NextResponse.json({ error: 'Unable to load connections.' }, { status: 500 });
  }

  return NextResponse.json({ connections: data || [], catalog, setup, migrationRequired: false });
}

export async function POST(request: Request) {
  const actor = await getActor();
  if ('error' in actor) return actor.error;
  if (!['admin', 'manager'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Manager access is required.' }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = ManualConnectionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const provider = getProvider(parsed.data.provider);
  if (!provider) return NextResponse.json({ error: 'Unsupported provider.' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('integration_connections')
    .insert({
      provider: parsed.data.provider,
      display_name: parsed.data.display_name,
      external_account_id: parsed.data.external_account_id || null,
      status: 'connected',
      capabilities: provider.capabilities,
      config: parsed.data.config || {},
      connected_by: actor.user.id,
      last_sync_at: new Date().toISOString(),
    })
    .select('id,provider,display_name,external_account_id,status,capabilities,config,last_sync_at,last_event_at,last_error,created_at,updated_at')
    .single();

  if (error) {
    console.error('Manual integration connection failed:', error.message);
    return NextResponse.json({ error: 'Unable to save this connection.' }, { status: 500 });
  }

  return NextResponse.json({ connection: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const actor = await getActor();
  if ('error' in actor) return actor.error;
  if (!['admin', 'manager'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Manager access is required.' }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid connection action.' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const status = parsed.data.action === 'pause' ? 'paused' : parsed.data.action === 'resume' ? 'connected' : 'disconnected';
  const { data, error } = await admin
    .from('integration_connections')
    .update({ status, last_error: null })
    .eq('id', parsed.data.id)
    .select('id,provider,display_name,status,updated_at')
    .single();

  if (error) {
    console.error('Integration connection update failed:', error.message);
    return NextResponse.json({ error: 'Unable to update this connection.' }, { status: 500 });
  }

  if (parsed.data.action === 'disconnect') {
    await admin.from('integration_secrets').delete().eq('connection_id', parsed.data.id);
  }

  return NextResponse.json({ connection: data });
}
