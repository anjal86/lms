import { describe, expect, it } from 'vitest';
import type { FollowUp, Lead } from './types';
import {
  buildConfiguredQualificationSummary,
  buildQualificationSummary,
  getCanonicalNextAction,
  inferIndustryPack,
} from './opportunity-workspace';

const baseLead: Lead = {
  id: 'lead-1',
  lead_code: 'OPP-001',
  customer_name: 'Aarav Sharma',
  customer_phone: '+9779800000000',
  customer_country: 'Nepal',
  destination: 'Japan',
  travel_dates: 'October 2026',
  duration_days: 8,
  pax_adults: 2,
  pax_children: 0,
  pax_infants: 0,
  travel_type: 'custom',
  budget_range: 'NPR 500,000',
  hotel_category: '4 star',
  flight_required: false,
  visa_required: true,
  source: 'website',
  stage: 'contacted',
  priority: 'high',
  assigned_to: 'agent-1',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

describe('opportunity workspace domain', () => {
  it('uses the travel pack by default and mirrors the default travel qualification schema', () => {
    expect(inferIndustryPack(baseLead)).toBe('travel');

    const summary = buildQualificationSummary(baseLead);

    expect(summary.pack).toBe('travel');
    expect(summary.total).toBe(6);
    expect(summary.completed).toBe(6);
    expect(summary.missing).toEqual([]);
    expect(summary.percent).toBe(100);
    expect(summary.items.map((item) => item.key)).toEqual([
      'destination',
      'travel_dates',
      'pax_adults',
      'budget_range',
      'travel_type',
      'hotel_category',
    ]);
  });

  it('maps consultancy configuration to the education qualification schema', () => {
    const lead: Lead = {
      ...baseLead,
      custom_data: {
        study_destination: 'Japan',
        intake: 'April 2027',
        qualification: "Bachelor's degree",
        language_test: 'JLPT',
        language_score: 'N4',
        course: 'Business Management',
      },
    };

    const summary = buildQualificationSummary(lead, 'consultancy');

    expect(summary.pack).toBe('education');
    expect(summary.completed).toBe(6);
    expect(summary.total).toBe(6);
    expect(summary.percent).toBe(100);
    expect(summary.missing).toEqual([]);
  });

  it('maps agency configuration to the service qualification schema', () => {
    const lead: Lead = {
      ...baseLead,
      custom_data: {
        service_interest: 'Brand strategy',
        project_budget: 7500,
        project_deadline: '2026-11-30',
        brief: 'Reposition the company for a new market.',
      },
    };

    const summary = buildQualificationSummary(lead, 'agency');

    expect(summary.pack).toBe('services');
    expect(summary.completed).toBe(4);
    expect(summary.total).toBe(4);
    expect(summary.percent).toBe(100);
    expect(summary.missing).toEqual([]);
  });

  it('limits configured workspace qualification to fields included in the business qualification schema', () => {
    const lead: Lead = {
      ...baseLead,
      custom_data: {
        qualification: "Bachelor's degree",
        intake: 'April 2027',
        language_score: 'N4',
      },
    };

    const summary = buildConfiguredQualificationSummary(lead, 'consultancy', [
      { key: 'qualification', label: 'Academic Qualification' },
      { key: 'intake', label: 'Intake' },
      { key: 'language_score', label: 'Language Score / Level' },
      { key: 'gpa', label: 'GPA / Percentage' },
    ]);

    expect(summary.pack).toBe('education');
    expect(summary.total).toBe(3);
    expect(summary.completed).toBe(3);
    expect(summary.missing).toEqual([]);
    expect(summary.percent).toBe(100);
  });

  it('selects the earliest open follow-up as the canonical next action', () => {
    const followUps: FollowUp[] = [
      {
        id: 'later',
        lead_id: baseLead.id,
        title: 'Send hotel shortlist',
        scheduled_at: '2026-09-18T08:00:00.000Z',
        channel: 'whatsapp',
        status: 'pending',
        created_at: '2026-09-10T00:00:00.000Z',
      },
      {
        id: 'earlier',
        lead_id: baseLead.id,
        title: 'Confirm travel month',
        scheduled_at: '2026-09-16T08:00:00.000Z',
        channel: 'call',
        status: 'pending',
        created_at: '2026-09-10T00:00:00.000Z',
      },
      {
        id: 'done',
        lead_id: baseLead.id,
        title: 'Completed action',
        scheduled_at: '2026-09-15T08:00:00.000Z',
        channel: 'email',
        status: 'completed',
        created_at: '2026-09-10T00:00:00.000Z',
      },
      {
        id: 'cancelled',
        lead_id: baseLead.id,
        title: 'Cancelled action',
        scheduled_at: '2026-09-14T08:00:00.000Z',
        channel: 'call',
        status: 'cancelled',
        created_at: '2026-09-10T00:00:00.000Z',
      },
    ];

    expect(getCanonicalNextAction(baseLead, followUps)).toMatchObject({
      id: 'earlier',
      title: 'Confirm travel month',
      scheduledAt: '2026-09-16T08:00:00.000Z',
      channel: 'call',
      source: 'follow_up',
    });
  });

  it('falls back to the lead follow-up timestamp when no open task exists', () => {
    const lead = { ...baseLead, next_follow_up_at: '2026-09-17T10:30:00.000Z' };

    expect(getCanonicalNextAction(lead, [])).toMatchObject({
      title: 'Follow up with customer',
      scheduledAt: '2026-09-17T10:30:00.000Z',
      source: 'lead',
    });
  });

  it('ignores stale follow-ups after an opportunity reaches a terminal stage', () => {
    const wonLead = { ...baseLead, stage: 'won' as const, next_follow_up_at: '2026-09-17T10:30:00.000Z' };
    const followUp: FollowUp = {
      id: 'stale',
      lead_id: wonLead.id,
      title: 'Old sales callback',
      scheduled_at: '2026-09-16T08:00:00.000Z',
      channel: 'call',
      status: 'pending',
      created_at: '2026-09-10T00:00:00.000Z',
    };

    expect(getCanonicalNextAction(wonLead, [followUp])).toMatchObject({
      title: 'Start post-sale handoff',
      scheduledAt: null,
      source: 'suggested',
    });
  });

  it('uses a configured pipeline stage when suggesting the next action', () => {
    expect(getCanonicalNextAction(baseLead, [], 'Proposal')).toMatchObject({
      title: 'Follow up on proposal',
      source: 'suggested',
    });
  });
});
