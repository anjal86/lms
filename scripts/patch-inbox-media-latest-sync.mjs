import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Patch target missing: ${label}`);
  return source.replace(from, to);
}

const inboxPath = 'src/components/inbox/StableInbox.tsx';
let inbox = fs.readFileSync(inboxPath, 'utf8');
inbox = replaceRequired(
  inbox,
  "import ConvertToLeadDrawer, { type ConversationForConversion } from '@/components/inbox/ConvertToLeadDrawer';",
  "import ConvertToLeadDrawer, { type ConversationForConversion } from '@/components/inbox/ConvertToLeadDrawer';\nimport InboxMessageContent from '@/components/inbox/InboxMessageContent';",
  'Inbox media component import'
);
inbox = replaceRequired(
  inbox,
  "  body: string | null;\n  delivery_status?: string | null;",
  "  body: string | null;\n  metadata?: Record<string, unknown> | null;\n  delivery_status?: string | null;",
  'Message metadata type'
);
inbox = replaceRequired(
  inbox,
  '<div className="whitespace-pre-wrap break-words">{item.message.body || \'Attachment\'}</div>',
  '<InboxMessageContent message={item.message} />',
  'Message body renderer'
);
fs.writeFileSync(inboxPath, inbox);

const syncPath = 'src/lib/integrations/meta-sync.ts';
let sync = fs.readFileSync(syncPath, 'utf8');
sync = replaceRequired(
  sync,
  '  const maxPages = isLive ? 1 : 2;\n',
  "  const maxPages = isLive ? 1 : 2;\n  // Live polling must inspect the provider's current recent window. The stored\n  // connection timestamp is shared by every Page on a connection, so using it\n  // as a per-Page cursor can skip fresh messages on a quieter selected Page.\n  const liveSince = isLive ? null : undefined;\n",
  'Live sync cursor comment'
);
const cursorTarget = '              since: connection.last_external_timestamp,';
const cursorReplacement = '              since: liveSince === null ? null : connection.last_external_timestamp,';
const matches = sync.split(cursorTarget).length - 1;
if (matches !== 2) throw new Error(`Expected 2 Meta cursor targets, found ${matches}`);
sync = sync.split(cursorTarget).join(cursorReplacement);
fs.writeFileSync(syncPath, sync);
