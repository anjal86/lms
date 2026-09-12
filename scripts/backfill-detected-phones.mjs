import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function extractPhoneNumbers(text) {
  if (!text) return [];
  const regex = /(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,5}\b/g;
  const matches = text.match(regex) || [];
  const valid = [];
  for (const m of matches) {
    const cleaned = m.trim();
    const digitOnly = cleaned.replace(/\D/g, '');
    if (digitOnly.length >= 8 && digitOnly.length <= 15) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned) && !valid.includes(cleaned)) {
        valid.push(cleaned);
      }
    }
  }
  return valid;
}

async function run() {
  console.log('Fetching all inbound messages...');
  const { data: messages, error: msgError } = await supabase
    .from('lead_messages')
    .select('id, conversation_id, direction, body, sent_at')
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false });

  if (msgError) {
    console.error('Failed to fetch messages:', msgError);
    process.exit(1);
  }

  console.log(`Analyzing ${messages.length} inbound messages for phone numbers...`);
  const conversationPhones = new Map();

  for (const msg of messages) {
    const nums = extractPhoneNumbers(msg.body);
    if (nums.length > 0) {
      if (!conversationPhones.has(msg.conversation_id)) {
        conversationPhones.set(msg.conversation_id, {
          latestPhone: nums[0],
          allPhones: new Set(nums),
          snippet: msg.body.slice(0, 160),
          sentAt: msg.sent_at,
        });
      } else {
        const entry = conversationPhones.get(msg.conversation_id);
        nums.forEach((n) => entry.allPhones.add(n));
      }
    }
  }

  console.log(`Found ${conversationPhones.size} conversations with valid phone numbers.`);

  let updatedCount = 0;
  for (const [convId, data] of conversationPhones.entries()) {
    const { data: conv } = await supabase
      .from('lead_conversations')
      .select('id, customer_phone, metadata, provider')
      .eq('id', convId)
      .maybeSingle();

    if (!conv) continue;

    const existingMetadata = (conv.metadata || {});
    const detectedPhone = data.latestPhone;
    const detectedPhones = Array.from(data.allPhones);

    const patch = {
      metadata: {
        ...existingMetadata,
        detected_phone: detectedPhone,
        detected_phones: detectedPhones,
        detected_phone_snippet: data.snippet,
        detected_phone_at: data.sentAt,
      },
    };

    // If customer_phone is empty or just a provider ID, also update customer_phone
    if (!conv.customer_phone || conv.customer_phone.startsWith(`${conv.provider}:`)) {
      patch.customer_phone = detectedPhone;
    }

    const { error: updateError } = await supabase
      .from('lead_conversations')
      .update(patch)
      .eq('id', convId);

    if (updateError) {
      console.error(`Error updating conversation ${convId}:`, updateError.message);
    } else {
      updatedCount++;
    }
  }

  console.log(`Successfully backfilled ${updatedCount} conversations with detected phone numbers!`);
}

run().catch(console.error);
