import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { NormalizedAdAttribution } from './ad-attribution';

export async function bufferPendingAdReferral(input: {
  workspaceId: string;
  connectionId: string;
  provider: 'facebook' | 'instagram';
  accountId: string;
  externalContactId: string;
  attribution: NormalizedAdAttribution;
  capturedAt: string;
}) {
  const admin = createSupabaseAdminClient();
  const capturedAt = new Date(input.capturedAt);
  const normalizedCapturedAt = Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt;
  const { error } = await admin.from('pending_ad_referrals').insert({
    workspace_id: input.workspaceId,
    connection_id: input.connectionId,
    provider: input.provider,
    account_id: input.accountId,
    external_contact_id: input.externalContactId,
    attribution: input.attribution,
    captured_at: normalizedCapturedAt.toISOString(),
    expires_at: new Date(normalizedCapturedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
}

export async function claimPendingAdReferral(input: {
  workspaceId: string;
  connectionId: string;
  provider: 'facebook' | 'instagram';
  externalContactId: string;
}): Promise<{ id: string; attribution: NormalizedAdAttribution } | null> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('pending_ad_referrals')
    .select('id,attribution')
    .eq('workspace_id', input.workspaceId)
    .eq('connection_id', input.connectionId)
    .eq('provider', input.provider)
    .eq('external_contact_id', input.externalContactId)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id || !data.attribution) return null;
  return { id: String(data.id), attribution: data.attribution as NormalizedAdAttribution };
}

export async function consumePendingAdReferral(id: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('pending_ad_referrals')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', id)
    .is('consumed_at', null);
  if (error) throw error;
}
