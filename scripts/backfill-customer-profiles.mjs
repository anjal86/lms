import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const WRITE = process.argv.includes('--write');
const PAGE_SIZE = 250;

function loadEnv() {
  const env = { ...process.env };
  if (!fs.existsSync('.env.local')) return env;
  const envContent = fs.readFileSync('.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !env[match[1].trim()]) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function run() {
  console.log(WRITE
    ? 'WRITE MODE: only missing location fields will be copied between existing conversation profiles and linked leads.'
    : 'DRY RUN: no data will be changed. Re-run with --write after reviewing the output.');

  let offset = 0;
  let inspected = 0;
  let conversationUpdates = 0;
  let leadUpdates = 0;
  let conflicts = 0;

  while (true) {
    const { data: conversations, error } = await supabase
      .from('lead_conversations')
      .select('id,lead_id,customer_name,metadata')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    if (!conversations?.length) break;

    const leadIds = Array.from(new Set(conversations.map((row) => row.lead_id).filter(Boolean)));
    const leadMap = new Map();
    if (leadIds.length > 0) {
      const { data: leads, error: leadError } = await supabase
        .from('leads')
        .select('id,customer_city,customer_country')
        .in('id', leadIds);
      if (leadError) throw leadError;
      for (const lead of leads || []) leadMap.set(lead.id, lead);
    }

    for (const conversation of conversations) {
      inspected += 1;
      const metadata = conversation.metadata && typeof conversation.metadata === 'object'
        ? conversation.metadata
        : {};
      const profile = metadata.customer_profile && typeof metadata.customer_profile === 'object'
        ? metadata.customer_profile
        : {};
      const lead = conversation.lead_id ? leadMap.get(conversation.lead_id) : null;

      const profileCity = clean(profile.city);
      const profileCountry = clean(profile.country);
      const leadCity = clean(lead?.customer_city);
      const leadCountry = clean(lead?.customer_country);

      if ((profileCity && leadCity && profileCity !== leadCity) ||
          (profileCountry && leadCountry && profileCountry !== leadCountry)) {
        conflicts += 1;
        console.warn(`CONFLICT ${conversation.id} (${conversation.customer_name || 'Traveler'}): profile=${profileCity || '—'}, ${profileCountry || '—'} lead=${leadCity || '—'}, ${leadCountry || '—'}. Left unchanged.`);
        continue;
      }

      const nextProfile = { ...profile };
      let shouldUpdateConversation = false;
      if (!profileCity && leadCity) {
        nextProfile.city = leadCity;
        shouldUpdateConversation = true;
      }
      if (!profileCountry && leadCountry) {
        nextProfile.country = leadCountry;
        shouldUpdateConversation = true;
      }
      if (shouldUpdateConversation) {
        nextProfile.locationSource = nextProfile.locationSource || 'existing_lead';
        console.log(`${WRITE ? 'UPDATE' : 'WOULD UPDATE'} conversation ${conversation.id}: ${clean(nextProfile.city) || '—'}, ${clean(nextProfile.country) || '—'}`);
        if (WRITE) {
          const { error: updateError } = await supabase
            .from('lead_conversations')
            .update({ metadata: { ...metadata, customer_profile: nextProfile } })
            .eq('id', conversation.id);
          if (updateError) throw updateError;
        }
        conversationUpdates += 1;
      }

      if (lead) {
        const leadPatch = {};
        if (!leadCity && profileCity) leadPatch.customer_city = profileCity;
        if (!leadCountry && profileCountry) leadPatch.customer_country = profileCountry;
        if (Object.keys(leadPatch).length > 0) {
          console.log(`${WRITE ? 'UPDATE' : 'WOULD UPDATE'} lead ${lead.id}: ${leadPatch.customer_city || leadCity || '—'}, ${leadPatch.customer_country || leadCountry || '—'}`);
          if (WRITE) {
            const { error: leadUpdateError } = await supabase
              .from('leads')
              .update(leadPatch)
              .eq('id', lead.id);
            if (leadUpdateError) throw leadUpdateError;
          }
          leadUpdates += 1;
        }
      }
    }

    if (conversations.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`\nInspected: ${inspected}`);
  console.log(`${WRITE ? 'Updated' : 'Would update'} conversations: ${conversationUpdates}`);
  console.log(`${WRITE ? 'Updated' : 'Would update'} leads: ${leadUpdates}`);
  console.log(`Conflicts left unchanged: ${conflicts}`);
  console.log('No location, locale, language, flag, or timezone was inferred from provider/page identity.');
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
