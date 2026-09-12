import type { CustomerDemographics, CustomerLocationSource } from './customer-profile';

const LOCATION_FIELDS: Array<keyof CustomerDemographics> = [
  'city',
  'state',
  'country',
  'countryCode',
  'countryFlag',
  'streetAddress',
  'postalCode',
];

const SOURCE_PRIORITY: Record<CustomerLocationSource, number> = {
  chat_heuristic: 1,
  meta_profile: 2,
  existing_lead: 3,
  lead_form: 4,
  manual: 5,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function inferLocationSource(profile: CustomerDemographics | null | undefined): CustomerLocationSource | null {
  if (!profile) return null;
  if (profile.locationSource) return profile.locationSource;
  if (profile.inferredFromText) return 'chat_heuristic';
  if (profile.formFields?.length) return 'lead_form';
  if (profile.locale || profile.timezoneOffset !== undefined || profile.timezoneLabel) return 'meta_profile';
  return null;
}

function priority(source: CustomerLocationSource | null) {
  return source ? SOURCE_PRIORITY[source] : 0;
}

/**
 * Merge provider enrichment without allowing a lower-confidence source to overwrite
 * customer location that was manually corrected or explicitly submitted in a lead form.
 */
export function mergeCustomerDemographics(
  existing: CustomerDemographics | null | undefined,
  incoming: CustomerDemographics | null | undefined
): CustomerDemographics | null {
  if (!existing && !incoming) return null;
  if (!existing) return incoming ? { ...incoming } : null;
  if (!incoming) return { ...existing };

  const existingSource = inferLocationSource(existing);
  const incomingSource = inferLocationSource(incoming);
  const keepExistingLocation = priority(existingSource) > priority(incomingSource);
  const locationWinner = keepExistingLocation ? existing : incoming;
  const locationSource = keepExistingLocation ? existingSource : incomingSource;

  const merged: CustomerDemographics = { ...existing, ...incoming };
  for (const key of LOCATION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(locationWinner, key)) {
      // TypeScript cannot express assignment across this heterogeneous mapped-key set.
      (merged as Record<string, unknown>)[key] = (locationWinner as Record<string, unknown>)[key];
    } else {
      const fallback = keepExistingLocation ? incoming : existing;
      if (Object.prototype.hasOwnProperty.call(fallback, key)) {
        (merged as Record<string, unknown>)[key] = (fallback as Record<string, unknown>)[key];
      }
    }
  }

  if (locationSource) merged.locationSource = locationSource;
  merged.inferredFromText = locationSource === 'chat_heuristic';

  // Lead-form answers are durable customer-provided data. Do not erase them merely
  // because a later profile lookup does not return form fields.
  if (existing.formFields?.length && !incoming.formFields?.length) merged.formFields = existing.formFields;

  return merged;
}

export function mergeConversationMetadata(
  existingValue: Record<string, unknown> | null | undefined,
  incomingValue: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const existing = record(existingValue);
  const incoming = record(incomingValue);
  const merged: Record<string, unknown> = { ...existing, ...incoming };

  const existingProfile = Object.keys(record(existing.customer_profile)).length
    ? record(existing.customer_profile) as CustomerDemographics
    : null;
  const incomingProfile = Object.keys(record(incoming.customer_profile)).length
    ? record(incoming.customer_profile) as CustomerDemographics
    : null;
  const profile = mergeCustomerDemographics(existingProfile, incomingProfile);
  if (profile) merged.customer_profile = profile;
  else delete merged.customer_profile;

  return merged;
}
