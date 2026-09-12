import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ConvertToLeadSchema = z.object({
  customerName: z.string().trim().min(2).max(120).optional(),
  customerPhone: z.string().trim().min(3).max(60).optional(),
  customerEmail: z.string().trim().email().optional().or(z.literal('')),
  customerCity: z.string().trim().max(120).optional().or(z.literal('')),
  customerCountry: z.string().trim().max(120).optional().or(z.literal('')),
  destination: z.string().trim().min(2).max(120),
  travelDates: z.string().trim().max(120).optional().or(z.literal('')),
  budgetRange: z.string().trim().max(120).optional().or(z.literal('')),
  paxAdults: z.number().int().min(1).max(100).default(2),
  paxChildren: z.number().int().min(0).max(50).default(0),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  assignedTo: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

type ConversionResult = {
  lead?: { id: string; customer_name: string; destination: string; [key: string]: unknown };
  conversation_id?: string;
  already_converted?: boolean;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id: conversationId } = await context.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = ConvertToLeadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { data, error } = await actor.supabase.rpc('convert_conversation_to_lead', {
    p_conversation_id: conversationId,
    p_customer_name: parsed.data.customerName || null,
    p_customer_phone: parsed.data.customerPhone || null,
    p_customer_email: parsed.data.customerEmail || null,
    p_destination: parsed.data.destination,
    p_travel_dates: parsed.data.travelDates || null,
    p_budget_range: parsed.data.budgetRange || null,
    p_pax_adults: parsed.data.paxAdults,
    p_pax_children: parsed.data.paxChildren,
    p_priority: parsed.data.priority,
    p_assigned_to: parsed.data.assignedTo ?? null,
    p_notes: parsed.data.notes || null,
  });

  if (error) {
    console.error('Conversation conversion failed:', error.message);
    if (error.code === '42501') return NextResponse.json({ error: 'You do not have access to convert this conversation.' }, { status: 403 });
    if (error.code === 'P0002') return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    if (error.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: 'Failed to convert conversation to lead.' }, { status: 500 });
  }

  const result = (data || {}) as ConversionResult;
  if (!result.lead?.id) return NextResponse.json({ error: 'Conversion did not return a lead.' }, { status: 500 });

  let leadRecord = result.lead;

  if (parsed.data.customerCity || parsed.data.customerCountry) {
    const patch: Record<string, string | null> = {};
    if (parsed.data.customerCity) patch.customer_city = parsed.data.customerCity;
    if (parsed.data.customerCountry) patch.customer_country = parsed.data.customerCountry;

    const { data: updatedLead } = await actor.supabase
      .from('leads')
      .update(patch)
      .eq('id', leadRecord.id)
      .select('*')
      .maybeSingle();

    if (updatedLead) {
      leadRecord = updatedLead;
    }
  }

  return NextResponse.json({
    lead: leadRecord,
    conversationId: result.conversation_id || conversationId,
    workspaceUrl: `/leads/${leadRecord.id}/workspace`,
    alreadyConverted: Boolean(result.already_converted),
  }, { status: result.already_converted ? 200 : 201 });
}
