import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: convs, error } = await supabase.from('lead_conversations').select('*');
  if (error) throw error;

  console.log(`Found ${convs.length} conversations to inspect.`);
  let updatedCount = 0;

  for (const conv of convs) {
    const meta = conv.metadata || {};
    if (meta.customer_profile?.country) {
      console.log(`- Conversation ${conv.customer_name} already has profile (${meta.customer_profile.country}). Skipping.`);
      continue;
    }

    const pageName = String(meta.meta_page_name || '');
    const isNepal = pageName.includes('Nepal') || pageName.includes('AnnaPurna') || pageName.includes('Syourai') || conv.provider === 'facebook';

    let city = null;
    if (pageName.includes('Jawalakhel')) city = 'Lalitpur';
    else if (pageName.includes('Syourai')) city = 'Kathmandu';
    else if (pageName.includes('AnnaPurna')) city = 'Pokhara';

    const customerProfile = {
      country: isNepal ? 'Nepal' : null,
      countryCode: isNepal ? 'NP' : null,
      countryFlag: isNepal ? '🇳🇵' : null,
      city,
      locale: isNepal ? 'ne_NP' : 'en_US',
      language: isNepal ? 'Nepali' : 'English',
      timezoneOffset: isNepal ? 5.75 : 0,
      timezoneLabel: isNepal ? 'UTC+05:45 (Nepal Standard Time)' : 'UTC+00:00 (GMT)',
      gender: null,
    };

    const newMeta = {
      ...meta,
      customer_profile: customerProfile,
    };

    const { error: updateError } = await supabase
      .from('lead_conversations')
      .update({ metadata: newMeta })
      .eq('id', conv.id);

    if (updateError) {
      console.error(`Failed to update ${conv.id}:`, updateError.message);
    } else {
      updatedCount++;
      console.log(`+ Updated ${conv.customer_name}: ${city ? city + ', ' : ''}Nepal 🇳🇵 (UTC+05:45)`);
    }

    // If conversation is linked to a lead without city/country, update the lead too
    if (conv.lead_id) {
      await supabase.from('leads').update({
        customer_city: city,
        customer_country: isNepal ? 'Nepal' : null,
      }).eq('id', conv.lead_id);
    }
  }

  console.log(`\nDone! Successfully backfilled ${updatedCount} conversations with customer profile & location.`);
}

run().catch(console.error);
