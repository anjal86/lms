import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const webhookSecret = process.env.LEADS_WEBHOOK_SECRET;

    // Enforce webhook secret in production environments
    if (webhookSecret) {
      if (!authHeader || !authHeader.includes(webhookSecret)) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid or missing webhook authorization secret' },
          { status: 401 }
        );
      }
    }

    const body = await req.json();

    if (!body.customer_name || !body.customer_phone || !body.destination) {
      return NextResponse.json(
        { error: 'Validation Error: customer_name, customer_phone, and destination are mandatory fields' },
        { status: 400 }
      );
    }

    const leadCode = `TRV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();
    const frtDue = new Date(now.getTime() + 30 * 60 * 1000); // 30 mins SLA default

    const lead = {
      id: `lead-wh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      lead_code: leadCode,
      customer_name: body.customer_name.trim(),
      customer_phone: body.customer_phone.trim(),
      customer_email: (body.customer_email || '').trim().toLowerCase(),
      destination: body.destination.trim(),
      budget_range: body.budget_range || '$2,000 - $3,000',
      travel_dates: body.travel_dates || 'Flexible',
      pax_adults: body.pax_adults ? Number(body.pax_adults) : 2,
      travel_type: body.travel_type || 'family',
      special_notes: body.special_notes || '',
      source: body.source || 'webhook',
      stage: 'new',
      priority: body.priority || 'high',
      first_response_due_at: frtDue.toISOString(),
      created_at: now.toISOString(),
    };

    return NextResponse.json(
      {
        success: true,
        message: 'Lead ingested successfully into Wanderlust CRM pipeline',
        lead,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error?.message || 'Failed to parse webhook body' },
      { status: 500 }
    );
  }
}
