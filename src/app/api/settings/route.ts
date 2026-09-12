import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const SettingsPatchSchema = z.object({
  frt_minutes: z.number().int().min(1).max(1440).optional(),
  overdue_grace_minutes: z.number().int().min(0).max(10080).optional(),
  escalate_to_manager: z.boolean().optional(),
  auto_reassign_breached_leads: z.boolean().optional(),
  auto_reassign_hours: z.number().min(0.25).max(168).optional(),
  business_hours_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  business_hours_end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  freeze_sla_weekends: z.boolean().optional(),
  timezone: z.string().min(1).max(100).optional(),
  pre_breach_warning_minutes: z.number().int().min(0).max(1440).optional(),
  routing_strategy: z.enum(['round_robin', 'workload_balanced', 'conversion_weighted']).optional(),
  routing_overflow_policy: z.enum(['unassigned_pool', 'overflow_available', 'queue_delay']).optional(),
  vip_high_budget_threshold: z.number().min(0).max(1000000000).optional(),
  vip_route_seniors_only: z.boolean().optional(),
  lead_cooldown_minutes: z.number().int().min(0).max(1440).optional(),
  currency: z.enum(['USD', 'EUR', 'GBP', 'INR', 'AUD', 'AED']).optional(),
  currency_symbol: z.string().max(10).optional(),
  date_format: z.enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']).optional(),
  commission_tds_pct: z.number().min(0).max(100).optional(),
  min_gross_margin_threshold: z.number().min(0).max(100).optional(),
  payout_frequency: z.enum(['monthly', 'bi-weekly', 'weekly']).optional(),
  notification_sound_enabled: z.boolean().optional(),
  notification_sound_preset: z.enum(['chime', 'modern_bell', 'radar', 'subtle', 'off']).optional(),
  notification_volume: z.number().min(0).max(100).optional(),
  mute_sound_in_call: z.boolean().optional(),
  browser_push_enabled: z.boolean().optional(),
  toast_duration_seconds: z.number().int().min(1).max(30).optional(),
  custom_lost_reasons: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  custom_lead_sources: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  auto_archive_days: z.number().int().min(1).max(3650).optional(),
}).strict();

type SettingKey = keyof z.infer<typeof SettingsPatchSchema>;

const MANAGER_KEYS = new Set<SettingKey>([
  'routing_strategy',
  'routing_overflow_policy',
  'vip_high_budget_threshold',
  'vip_route_seniors_only',
  'lead_cooldown_minutes',
  'notification_sound_enabled',
  'notification_sound_preset',
  'notification_volume',
  'mute_sound_in_call',
  'browser_push_enabled',
  'toast_duration_seconds',
  'custom_lost_reasons',
  'custom_lead_sources',
  'auto_archive_days',
]);

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: actor } = await supabase.from('profiles').select('role,is_active').eq('id', user.id).single();
  if (!actor?.is_active || !['admin', 'manager'].includes(actor.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = SettingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const patch = parsed.data;
  if (actor.role === 'manager') {
    const forbidden = Object.keys(patch).some((key) => !MANAGER_KEYS.has(key as SettingKey));
    if (forbidden) return NextResponse.json({ error: 'This setting requires administrator access.' }, { status: 403 });
  }

  if (patch.currency) {
    const symbols = { USD: '$', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', AED: 'AED ' } as const;
    patch.currency_symbol = symbols[patch.currency];
  }

  const admin = createSupabaseAdminClient();
  const { data: row, error: readError } = await admin
    .from('agency_settings')
    .select('settings')
    .eq('id', 'default')
    .single();
  if (readError) {
    console.error('Settings read failed:', readError.message);
    return NextResponse.json({ error: 'Unable to load settings.' }, { status: 500 });
  }

  const settings = { ...((row.settings || {}) as Record<string, unknown>), ...patch };
  const { error: updateError } = await admin
    .from('agency_settings')
    .update({ settings })
    .eq('id', 'default');

  if (updateError) {
    console.error('Settings update failed:', updateError.message);
    return NextResponse.json({ error: 'Unable to save settings.' }, { status: 500 });
  }

  return NextResponse.json({ settings });
}
