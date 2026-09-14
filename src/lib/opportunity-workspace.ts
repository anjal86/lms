import type { DynamicFieldDefinition } from './platform/types';
import type { FollowUp, FollowUpChannel, Lead } from './types';

export type IndustryPack = 'education' | 'travel' | 'services';

export type QualificationItem = {
  key: string;
  label: string;
  value: string;
  complete: boolean;
};

export type QualificationSummary = {
  pack: IndustryPack;
  packLabel: string;
  items: QualificationItem[];
  completed: number;
  total: number;
  percent: number;
  missing: string[];
};

export type CanonicalNextAction = {
  id: string | null;
  title: string;
  scheduledAt: string | null;
  channel: FollowUpChannel | null;
  source: 'follow_up' | 'lead' | 'suggested';
};

type FieldDefinition = {
  key: string;
  label: string;
  read: (lead: Lead) => unknown;
};

const customValue = (lead: Lead, ...keys: string[]) => {
  const customData = lead.custom_data || {};
  const key = keys.find((candidate) => Object.prototype.hasOwnProperty.call(customData, candidate));
  return key ? customData[key] : undefined;
};

const hasValue = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const formatValue = (value: unknown) => {
  if (!hasValue(value)) return 'Missing';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') return value.replaceAll('_', ' ');
  return String(value);
};

const configuredFieldValue = (lead: Lead, fieldKey: string) => {
  const legacyValue = (lead as unknown as Record<string, unknown>)[fieldKey];
  if (hasValue(legacyValue)) return legacyValue;
  return lead.custom_data?.[fieldKey];
};

const travelFields: FieldDefinition[] = [
  { key: 'destination', label: 'Destination', read: (lead) => lead.destination },
  { key: 'travel_month', label: 'Travel month', read: (lead) => lead.travel_dates },
  { key: 'nationality', label: 'Nationality', read: (lead) => customValue(lead, 'nationality') ?? lead.customer_country },
  { key: 'pax', label: 'Travelers', read: (lead) => lead.pax_adults + lead.pax_children + lead.pax_infants },
  { key: 'budget', label: 'Budget', read: (lead) => lead.budget_range },
  { key: 'trip_type', label: 'Trip type', read: (lead) => lead.travel_type },
  { key: 'hotel_level', label: 'Hotel level', read: (lead) => lead.hotel_category },
  { key: 'flight_required', label: 'Flight required', read: (lead) => lead.flight_required },
  { key: 'special_requirements', label: 'Special requirements', read: (lead) => lead.special_notes },
];

const educationFields: FieldDefinition[] = [
  { key: 'education_level', label: 'Education level', read: (lead) => customValue(lead, 'education_level', 'qualification') },
  { key: 'graduation_year', label: 'Graduation year', read: (lead) => customValue(lead, 'graduation_year') },
  { key: 'gap_years', label: 'Study gap', read: (lead) => customValue(lead, 'gap_years', 'gap') },
  { key: 'japanese_level', label: 'Japanese level', read: (lead) => customValue(lead, 'japanese_level', 'language_level', 'language_score') },
  { key: 'preferred_intake', label: 'Preferred intake', read: (lead) => customValue(lead, 'preferred_intake', 'intake') },
  { key: 'preferred_city', label: 'Preferred city', read: (lead) => customValue(lead, 'preferred_city', 'city') },
  { key: 'budget', label: 'Budget', read: (lead) => customValue(lead, 'budget') ?? lead.budget_range },
  { key: 'passport_status', label: 'Passport', read: (lead) => customValue(lead, 'passport_status') },
  { key: 'academic_documents_status', label: 'Academic documents', read: (lead) => customValue(lead, 'academic_documents_status', 'academic_docs_status') },
];

const servicesFields: FieldDefinition[] = [
  { key: 'service_required', label: 'Service required', read: (lead) => customValue(lead, 'service_required', 'service', 'service_interest', 'interest') },
  { key: 'budget', label: 'Budget', read: (lead) => customValue(lead, 'budget', 'project_budget') ?? lead.budget_range },
  { key: 'deadline', label: 'Deadline', read: (lead) => customValue(lead, 'deadline', 'project_deadline', 'target_date') },
  { key: 'decision_maker', label: 'Decision maker', read: (lead) => customValue(lead, 'decision_maker') },
  { key: 'scope', label: 'Scope', read: (lead) => customValue(lead, 'scope', 'project_scope', 'brief', 'notes') },
  { key: 'proposal_required', label: 'Proposal required', read: (lead) => customValue(lead, 'proposal_required') },
];

const packFields: Record<IndustryPack, FieldDefinition[]> = {
  education: educationFields,
  travel: travelFields,
  services: servicesFields,
};

const packLabels: Record<IndustryPack, string> = {
  education: 'Education',
  travel: 'Travel',
  services: 'Agency / Services',
};

const suggestedActions: Record<Lead['stage'], string> = {
  new: 'Make first contact',
  contacted: 'Complete qualification',
  quote_sent: 'Follow up on proposal',
  in_negotiation: 'Resolve decision blocker',
  won: 'Start post-sale handoff',
  lost: 'Review loss reason',
  junk: 'No action required',
};

const terminalActions: Partial<Record<Lead['stage'], string>> = {
  won: 'Start post-sale handoff',
  lost: 'No action required',
  junk: 'No action required',
};

function summarizeQualification(pack: IndustryPack, items: QualificationItem[]): QualificationSummary {
  const completed = items.filter((item) => item.complete).length;
  const total = items.length;
  return {
    pack,
    packLabel: packLabels[pack],
    items,
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    missing: items.filter((item) => !item.complete).map((item) => item.label),
  };
}

function suggestedActionForStage(stage: Lead['stage'], stageHint?: string) {
  const hint = stageHint?.trim().toLowerCase() || '';
  if (hint.includes('proposal') || hint.includes('quote')) return 'Follow up on proposal';
  if (hint.includes('negotiat')) return 'Resolve decision blocker';
  if (hint.includes('application') || hint.includes('offer') || hint.includes('coe') || hint.includes('visa')) return 'Advance application';
  if (hint.includes('qualif') || hint.includes('counsel') || hint.includes('document') || hint.includes('assessment')) return 'Complete qualification';
  if (hint.includes('inquiry') || hint.includes('new')) return 'Make first contact';
  return suggestedActions[stage];
}

export function inferIndustryPack(lead: Lead, workspaceBusinessType?: string): IndustryPack {
  const configured = customValue(lead, 'industry_pack', 'business_type') ?? workspaceBusinessType;
  if (configured === 'education' || configured === 'consultancy') return 'education';
  if (configured === 'services' || configured === 'agency' || configured === 'generic' || configured === 'health') return 'services';
  if (configured === 'travel') return 'travel';
  return 'travel';
}

function qualificationFieldsFromSchema(fields?: DynamicFieldDefinition[]) {
  return (fields || [])
    .filter((field) => field.entity_type === 'lead' && field.is_active && field.validation?.qualification === true)
    .sort((left, right) => left.sort_order - right.sort_order);
}

export function buildQualificationSummary(
  lead: Lead,
  workspaceBusinessType?: string,
  workspaceFields?: DynamicFieldDefinition[]
): QualificationSummary {
  const pack = inferIndustryPack(lead, workspaceBusinessType);
  const configuredFields = qualificationFieldsFromSchema(workspaceFields);

  if (configuredFields.length > 0) {
    const items = configuredFields.map((field) => {
      const rawValue = configuredFieldValue(lead, field.field_key);
      return {
        key: field.field_key,
        label: field.label,
        value: formatValue(rawValue),
        complete: hasValue(rawValue),
      };
    });
    return summarizeQualification(pack, items);
  }

  const items = packFields[pack].map((field) => {
    const rawValue = field.read(lead);
    return {
      key: field.key,
      label: field.label,
      value: formatValue(rawValue),
      complete: hasValue(rawValue),
    };
  });
  return summarizeQualification(pack, items);
}

export function buildConfiguredQualificationSummary(
  lead: Lead,
  workspaceBusinessType: string,
  fields: Array<{ key: string; label: string }>
): QualificationSummary {
  const pack = inferIndustryPack(lead, workspaceBusinessType);
  const items = fields.map((field) => {
    const rawValue = configuredFieldValue(lead, field.key);
    return {
      key: field.key,
      label: field.label,
      value: formatValue(rawValue),
      complete: hasValue(rawValue),
    };
  });
  return summarizeQualification(pack, items);
}

export function getCanonicalNextAction(lead: Lead, followUps: FollowUp[], stageHint?: string): CanonicalNextAction {
  const terminalAction = terminalActions[lead.stage];
  if (terminalAction) {
    return { id: null, title: terminalAction, scheduledAt: null, channel: null, source: 'suggested' };
  }

  const nextFollowUp = followUps
    .filter((followUp) => followUp.lead_id === lead.id && (followUp.status === 'pending' || followUp.status === 'missed'))
    .toSorted((left, right) => new Date(left.scheduled_at).getTime() - new Date(right.scheduled_at).getTime())[0];

  if (nextFollowUp) {
    return {
      id: nextFollowUp.id,
      title: nextFollowUp.title,
      scheduledAt: nextFollowUp.scheduled_at,
      channel: nextFollowUp.channel,
      source: 'follow_up',
    };
  }

  // Legacy next_follow_up_at remains a compatibility projection for old data. New
  // scheduled work should be represented by follow_ups and surfaced through Due Work.
  if (lead.next_follow_up_at) {
    return { id: null, title: 'Follow up with customer', scheduledAt: lead.next_follow_up_at, channel: null, source: 'lead' };
  }

  return { id: null, title: suggestedActionForStage(lead.stage, stageHint), scheduledAt: null, channel: null, source: 'suggested' };
}
