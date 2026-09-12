import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (leadError) {
    console.error('Lead access check failed:', leadError.message);
    return NextResponse.json({ error: 'Unable to verify lead access.' }, { status: 500 });
  }
  if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

  const { data, error } = await supabase
    .from('lead_messages')
    .select('id,provider,direction,message_type,body,metadata,sent_at,created_by,connection_id')
    .eq('lead_id', id)
    .order('sent_at', { ascending: false })
    .limit(200);

  if (error) {
    if (error.code === '42P01' || error.message.toLowerCase().includes('lead_messages')) {
      return NextResponse.json({ messages: [], migrationRequired: true });
    }
    console.error('Lead message timeline failed:', error.message);
    return NextResponse.json({ error: 'Unable to load channel messages.' }, { status: 500 });
  }

  return NextResponse.json({ messages: data || [], migrationRequired: false }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
