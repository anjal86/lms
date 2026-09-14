import fs from 'node:fs';

const path = 'src/components/inbox/StableInbox.tsx';
let src = fs.readFileSync(path, 'utf8');

function exact(oldValue, newValue, label) {
  if (!src.includes(oldValue)) throw new Error(`Missing patch target: ${label}`);
  src = src.replace(oldValue, newValue);
}
function regex(pattern, replacement, label) {
  if (!pattern.test(src)) throw new Error(`Missing patch target: ${label}`);
  src = src.replace(pattern, replacement);
}

// Imports: move richer UI pieces into focused components.
for (const icon of ['  Facebook,\n','  Globe,\n','  Instagram,\n','  Mail,\n','  MessageCircle,\n','  Send,\n']) src = src.replace(icon, '');
exact(
  "import MetaConversationTimeline from '@/components/inbox/MetaConversationTimeline';\n",
  "import MetaConversationTimeline from '@/components/inbox/MetaConversationTimeline';\nimport InboxComposer, { type InboxComposerAttachment } from '@/components/inbox/InboxComposer';\nimport InboxConversationListItem from '@/components/inbox/InboxConversationListItem';\nimport InboxContextExtras from '@/components/inbox/InboxContextExtras';\nimport { useConversationPresence } from '@/lib/inbox/use-conversation-presence';\n",
  'inbox component imports'
);
exact("const PROVIDER_ICONS: Record<string, typeof MessageSquare> = { facebook: Facebook, instagram: Instagram, whatsapp: MessageCircle, email: Mail, website: Globe };\n", '', 'provider icon constant');

exact(
  "type TimelineEvent = { id: string; event_type: string; payload: Record<string, unknown>; created_at: string; actor: { full_name: string | null } | null };",
  "type TimelineEvent = { id: string; event_type: string; payload: Record<string, unknown>; created_at: string; actor_id?: string | null; actor: { full_name: string | null } | null };",
  'timeline actor id'
);

exact(
  "function shortTime(value?: string | null) { if (!value) return '—'; const date = new Date(value); return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' }); }\n",
  "function shortTime(value?: string | null) { if (!value) return '—'; const date = new Date(value); return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' }); }\n",
  'short time helper'
);

// Presence is scoped to the selected conversation and disappears automatically when navigating away.
exact(
  "  const selectedContact = contactOf(selected);\n  const selectedLead = leadOf(selected);\n\n",
  "  const selectedContact = contactOf(selected);\n  const selectedLead = leadOf(selected);\n  const presence = useConversationPresence({\n    workspaceId: config.workspace.id,\n    conversationId: selectedId,\n    user: { id: currentUser.id, full_name: currentUser.full_name, avatar_url: currentUser.avatar_url },\n  });\n\n",
  'presence hook'
);

exact(
  "  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);\n  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 220); return () => window.clearTimeout(timer); }, [search]);\n",
  "  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);\n  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 220); return () => window.clearTimeout(timer); }, [search]);\n  useEffect(() => {\n    const onComposerError = (event) => showToast(event.detail || 'Composer action failed.', 'error');\n    window.addEventListener('inbox-composer-error', onComposerError);\n    return () => window.removeEventListener('inbox-composer-error', onComposerError);\n  }, [showToast]);\n",
  'composer error bridge'
);

// Promote a newly active conversation immediately rather than waiting for the reconciliation fetch.
exact(
`      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_messages', filter: \`workspace_id=eq.\${config.workspace.id}\` }, (payload) => {
        const changed = payload.new as UnknownRecord;
        const conversationId = typeof changed.conversation_id === 'string' ? changed.conversation_id : null;
        scheduleListRefresh();
        if (conversationId && conversationId === selectedIdRef.current) scheduleThreadRefresh(conversationId);
      })`,
`      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_messages', filter: \`workspace_id=eq.\${config.workspace.id}\` }, (payload) => {
        const changed = payload.new as UnknownRecord;
        const conversationId = typeof changed.conversation_id === 'string' ? changed.conversation_id : null;
        if (conversationId && payload.eventType === 'INSERT') {
          setConversations((rows) => {
            const current = rows.find((row) => row.id === conversationId);
            if (!current) return rows;
            const inbound = changed.direction === 'inbound';
            const selectedNow = selectedIdRef.current === conversationId;
            const body = typeof changed.body === 'string' && changed.body.trim() ? changed.body : current.last_message_preview;
            const updated = {
              ...current,
              last_message_at: typeof changed.sent_at === 'string' ? changed.sent_at : new Date().toISOString(),
              last_message_preview: body || current.last_message_preview,
              needs_reply: inbound ? true : current.needs_reply,
              unread_count: inbound && !selectedNow ? current.unread_count + 1 : current.unread_count,
            };
            if (sort === 'newest') return [updated, ...rows.filter((row) => row.id !== conversationId)];
            return rows.map((row) => row.id === conversationId ? updated : row);
          });
        }
        scheduleListRefresh();
        if (conversationId && conversationId === selectedIdRef.current) scheduleThreadRefresh(conversationId);
      })`,
  'lead message realtime callback'
);
exact(
  "  }, [config.workspace.id, loadSecondary, scheduleListRefresh, scheduleThreadRefresh]);",
  "  }, [config.workspace.id, loadSecondary, scheduleListRefresh, scheduleThreadRefresh, sort]);",
  'realtime dependencies'
);

// Replace text-only send with a payload sender that retains failed rows and supports retries/attachments.
regex(
  /  const send = async \(\) => \{[\s\S]*?\n  \};\n\n  const loadOlder = async \(\) => \{/,
`  const sendPayload = async ({ body, attachment, mode }: { body: string; attachment?: InboxComposerAttachment | null; mode: ReplyMode }) => {
    const id = selectedIdRef.current;
    if (!id || sending || (!body.trim() && !attachment)) return false;
    const requestId = \`${'${'}currentUser.id}:${'${'}id}:${'${'}Date.now()}:${'${'}Math.random().toString(36).slice(2)}\`;
    const optimisticBody = attachment
      ? \`[${'${'}attachment.kind === 'image' ? 'Photo' : attachment.kind === 'video' ? 'Video' : attachment.kind === 'audio' ? 'Voice message' : \`File:${'${'}attachment.fileName}\`}]\`
      : body.trim();
    const optimistic: Message = {
      id: \`optimistic:${'${'}requestId}\`,
      conversation_id: id,
      direction: mode,
      message_type: mode === 'internal' ? 'internal_note' : attachment?.kind || 'text',
      body: optimisticBody,
      metadata: attachment ? { attachment_url: attachment.url, storage_path: attachment.storagePath, file_name: attachment.fileName, mime_type: attachment.mimeType, size: attachment.size } : {},
      delivery_status: 'sending',
      sent_at: new Date().toISOString(),
      author_profile: { full_name: currentUser.full_name },
    };
    setSending(true);
    setMessages((rows) => [...rows, optimistic]);
    scrollToBottom();
    try {
      const response = await fetch(\`/api/conversations/${'${'}id}/messages\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
        body: JSON.stringify({ body: body.trim(), direction: mode, clientRequestId: requestId, attachment: attachment ? { storagePath: attachment.storagePath, fileName: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size } : undefined }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.message) setMessages((rows) => rows.map((row) => row.id === optimistic.id ? payload.message as Message : row));
        else setMessages((rows) => rows.map((row) => row.id === optimistic.id ? { ...row, delivery_status: 'failed', failure_message: payload.error || 'Message delivery failed.' } : row));
        throw new Error(payload.error || 'Message delivery failed.');
      }
      if (selectedIdRef.current === id && payload.message) setMessages((rows) => rows.map((row) => row.id === optimistic.id ? payload.message as Message : row));
      threadCache.current.delete(id);
      await loadCoreThread(id, { force: true, quiet: true });
      void loadList(true);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Message delivery failed.', 'error');
      return false;
    } finally { setSending(false); }
  };

  const retryMessage = async (message: Message) => {
    const metadata = asRecord(message.metadata);
    const storagePath = typeof metadata.storage_path === 'string' ? metadata.storage_path : null;
    const fileName = typeof metadata.file_name === 'string' ? metadata.file_name : null;
    const mimeType = typeof metadata.mime_type === 'string' ? metadata.mime_type : null;
    const size = typeof metadata.size === 'number' ? metadata.size : Number(metadata.size || 0);
    const attachment = storagePath && fileName && mimeType && size > 0 ? {
      storagePath,
      url: typeof metadata.attachment_url === 'string' ? metadata.attachment_url : '',
      fileName,
      mimeType,
      size,
      kind: message.message_type,
    } satisfies InboxComposerAttachment : null;
    await sendPayload({ body: attachment ? '' : message.body || '', attachment, mode: 'outbound' });
  };

  const quoteMessage = (message: Message) => {
    const quote = (message.body || 'Attachment').split('\\n').slice(0, 3).join(' ');
    setReplyMode('outbound');
    setReplyBody((current) => \`> ${'${'}quote.slice(0, 180)}\\n\\n${'${'}current}\`);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const noteFromMessage = (message: Message) => {
    setReplyMode('internal');
    setReplyBody(\`Context from message: ${'${'}message.body || 'Attachment'}\`);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const createTaskFromMessage = async (message: Message) => {
    const id = selectedIdRef.current;
    if (!id) return;
    const text = (message.body || 'Conversation attachment').replace(/\\s+/g, ' ').trim();
    try {
      const response = await fetch('/api/work-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: id,
          ownerId: currentUser.id,
          type: 'custom',
          title: \`Follow up: ${'${'}text.slice(0, 90)}\`,
          description: \`Created from Inbox message: ${'${'}text.slice(0, 500)}\`,
          priority: selected?.priority === 'urgent' ? 'urgent' : selected?.priority === 'high' ? 'high' : 'normal',
          metadata: { source_message_id: message.id },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to create task.');
      showToast('Task created from message.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to create task.', 'error'); }
  };

  const loadOlder = async () => {`,
  'send payload block'
);

// Replace bulky row markup with the focused list-row component.
regex(
  /: conversations\.map\(\(conversation\) => \{ const Icon = PROVIDER_ICONS\[conversation\.provider\][\s\S]*?<\/button>; \}\)\}<\/div>/,
`: conversations.map((conversation) => { const info = sla(conversation); return <InboxConversationListItem key={conversation.id} conversation={conversation} selected={selectedId === conversation.id} contactLabel={contactLabel} statusText={info.text} statusDanger={info.danger} onSelect={() => selectConversation(conversation)} />; })}</div>`,
  'conversation list rows'
);

// On tablets, selecting a chat gives the conversation the whole working area.
exact("className={`${selectedId ? 'hidden md:flex' : 'flex'} min-h-0 min-w-0 flex-col border-r border-zinc-200`}", "className={`${selectedId ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col border-r border-zinc-200`}", 'tablet list visibility');
exact("className={`${selectedId ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-col bg-zinc-50/50`}", "className={`${selectedId ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col bg-zinc-50/50`}", 'tablet chat visibility');

// Presence/typing takes over the quiet secondary header line only while relevant.
exact(
  "<div data-chat-subtitle=\"true\" className=\"truncate text-[11px] text-zinc-500\"><span className=\"capitalize\">{selected.provider}</span> · {selected.assigned_profile?.full_name || 'Unassigned'} · {label(selectedContact?.lifecycle_key || 'new')}</div>",
  "<div data-chat-subtitle=\"true\" className={`truncate text-[11px] ${presence.typingMembers.length ? 'font-semibold text-blue-600' : 'text-zinc-500'}`}>{presence.typingMembers.length ? `${presence.typingMembers.map((member) => member.name).join(', ')} typing…` : presence.members.length ? `${presence.members.map((member) => member.name).slice(0, 2).join(', ')} ${presence.members.length === 1 ? 'is' : 'are'} viewing` : <><span className=\"capitalize\">{selected.provider}</span> · {selected.assigned_profile?.full_name || 'Unassigned'} · {label(selectedContact?.lifecycle_key || 'new')}</>}</div>",
  'presence header'
);

// Timeline actions turn a message into a reply, note, task, retry, or lightbox interaction.
exact(
  "<MetaConversationTimeline timeline={timeline} customerName={selected.customer_name} customerAvatarUrl={selected.customer_avatar_url} />",
  "<MetaConversationTimeline timeline={timeline} customerName={selected.customer_name} customerAvatarUrl={selected.customer_avatar_url} onQuote={quoteMessage} onAddNote={noteFromMessage} onCreateTask={(message) => void createTaskFromMessage(message)} onRetry={(message) => void retryMessage(message)} />",
  'timeline actions'
);

// Rich composer: drafts, quick replies, emoji, attachments, reply/note distinction.
regex(
  /          <footer className="shrink-0 border-t border-zinc-200 bg-white p-3">[\s\S]*?          <\/footer>/,
`          <footer className="shrink-0 border-t border-zinc-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <InboxComposer
              workspaceId={config.workspace.id}
              conversationId={selected.id}
              mode={replyMode}
              onModeChange={(mode) => { presence.setTyping(false); setReplyMode(mode); }}
              value={replyBody}
              onChange={setReplyBody}
              canReply={canReply}
              loading={loadingThread}
              sending={sending}
              composerRef={composerRef}
              onTyping={presence.setTyping}
              onSend={sendPayload}
            />
          </footer>`,
  'rich composer'
);

// The context rail should answer "what matters next?" without forcing a second page.
exact(
  "        <Link href={selectedContact ? `/contacts/${selectedContact.id}` : '/contacts'} className=\"button-secondary w-full\">Open contact profile</Link>",
  "        <InboxContextExtras conversationId={selected.id} tags={selectedContact?.tags} nextActionAt={selected.next_action_at} lastInboundAt={selected.last_inbound_at} />\n        <Link href={selectedContact ? `/contacts/${selectedContact.id}` : '/contacts'} className=\"button-secondary w-full\">Open contact profile</Link>",
  'context extras'
);

fs.writeFileSync(path, src);
