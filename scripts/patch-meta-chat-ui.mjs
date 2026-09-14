import fs from 'node:fs';

const path = 'src/components/inbox/StableInbox.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceRequired(from, to, label) {
  if (!source.includes(from)) throw new Error(`Patch target missing: ${label}`);
  source = source.replace(from, to);
}

replaceRequired(
  "import InboxMessageContent from '@/components/inbox/InboxMessageContent';",
  "import MetaConversationTimeline from '@/components/inbox/MetaConversationTimeline';",
  'timeline import'
);
replaceRequired('  StickyNote,\n', '', 'remove StickyNote import');
replaceRequired(
  "function eventText(event: TimelineEvent) { if (event.event_type === 'assigned') return `Assigned to ${String(event.payload.assigned_to_name || 'team member')}`; if (event.event_type === 'priority_changed') return `Priority changed to ${String(event.payload.priority || 'updated')}`; if (event.event_type === 'lifecycle_changed') return `Lifecycle changed to ${label(String(event.payload.lifecycle_key || 'updated'))}`; if (event.event_type === 'state_changed') return `Conversation ${String(event.payload.state || event.payload.to || 'updated')}`; if (event.event_type === 'next_action_changed') return 'Next action scheduled'; if (event.event_type === 'contact_tag_changed') return `${String(event.payload.action || 'Tag')} ${String(event.payload.tag || '')}`; return label(event.event_type); }\n",
  '',
  'remove inline event text helper'
);

replaceRequired(
  "<section className={`${selectedId ? 'hidden md:flex' : 'flex'} min-h-0 min-w-0 flex-col border-r border-zinc-200`}>",
  "<section aria-label=\"Inbox conversations\" className={`${selectedId ? 'hidden md:flex' : 'flex'} min-h-0 min-w-0 flex-col border-r border-zinc-200`}>",
  'conversation list section label'
);
replaceRequired(
  '<select value={queue} onChange={(e) => { setActiveSavedView(null); setQueue(e.target.value as QueueKey); }} className="select-field h-9 flex-1 text-xs">',
  '<select aria-label="Inbox view" value={queue} onChange={(e) => { setActiveSavedView(null); setQueue(e.target.value as QueueKey); }} className="select-field h-9 flex-1 text-xs">',
  'queue select label'
);
replaceRequired(
  '<button type="button" onClick={() => void syncProvider()} className="button-secondary button-sm" disabled={syncing}><RefreshCw',
  '<button type="button" aria-label="Sync inbox" onClick={() => void syncProvider()} className="button-secondary button-sm" disabled={syncing}><RefreshCw',
  'mobile sync label'
);
replaceRequired(
  '<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${contactLabel.toLowerCase()} or message`} className="field h-9 pl-8 text-xs" />',
  '<input aria-label="Search conversations" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${contactLabel.toLowerCase()} or message`} className="field h-9 pl-8 text-xs" />',
  'search label'
);
replaceRequired(
  '<button type="button" onClick={() => void syncProvider()} className="button-secondary button-sm hidden lg:inline-flex" disabled={syncing}><RefreshCw',
  '<button type="button" aria-label="Sync inbox" onClick={() => void syncProvider()} className="button-secondary button-sm hidden lg:inline-flex" disabled={syncing}><RefreshCw',
  'desktop sync label'
);
replaceRequired(
  '<select value={provider} onChange={(e) => setProvider(e.target.value)} className="select-field h-8 text-xs">',
  '<select aria-label="Filter by channel" value={provider} onChange={(e) => setProvider(e.target.value)} className="select-field h-8 text-xs">',
  'provider select label'
);
replaceRequired(
  '<select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="select-field h-8 text-xs">',
  '<select aria-label="Sort conversations" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="select-field h-8 text-xs">',
  'sort select label'
);
replaceRequired(
  '<button key={conversation.id} type="button" onClick={() => selectConversation(conversation)} className={`w-full px-3.5 py-3 text-left hover:bg-zinc-50 ${selectedId === conversation.id ? \'bg-zinc-100/90\' : \'\'}`}>',
  '<button key={conversation.id} type="button" data-conversation-item="true" aria-current={selectedId === conversation.id ? \'true\' : undefined} aria-label={`${conversation.customer_name || contactLabel}, ${conversation.unread_count || 0} unread messages`} onClick={() => selectConversation(conversation)} className={`w-full px-3.5 py-3 text-left hover:bg-zinc-50 ${selectedId === conversation.id ? \'bg-zinc-100/90\' : \'\'}`}>',
  'conversation row semantics'
);
replaceRequired(
  '<div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold ring-1 ring-zinc-200">{initials(conversation.customer_name)}</div>',
  '{conversation.customer_avatar_url ? <img src={conversation.customer_avatar_url} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-zinc-200" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold ring-1 ring-zinc-200">{initials(conversation.customer_name)}</div>}',
  'conversation avatar'
);
replaceRequired(
  'conversation.unread_count > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">',
  'conversation.unread_count > 0 && <span data-unread="true" className="rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">',
  'unread marker'
);

replaceRequired(
  "<section className={`${selectedId ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-col bg-zinc-50/50`}>",
  "<section aria-label=\"Conversation thread\" className={`${selectedId ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-col bg-zinc-50/50`}>",
  'thread section label'
);
replaceRequired(
  '<button type="button" onClick={() => { selectedIdRef.current = null; setSelectedId(null); }} className="button-ghost button-sm md:hidden"><ArrowLeft',
  '<button type="button" aria-label="Back to conversations" onClick={() => { selectedIdRef.current = null; setSelectedId(null); }} className="button-ghost button-sm md:hidden"><ArrowLeft',
  'back button label'
);
replaceRequired(
  '<div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold">{initials(selected.customer_name)}</div>',
  '{selected.customer_avatar_url ? <img data-chat-avatar="true" src={selected.customer_avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div data-chat-avatar="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold">{initials(selected.customer_name)}</div>}',
  'thread avatar'
);
replaceRequired(
  '<div className="truncate text-sm font-semibold text-zinc-950">{selected.customer_name || contactLabel}</div>',
  '<div data-chat-name="true" className="truncate text-sm font-semibold text-zinc-950">{selected.customer_name || contactLabel}</div>',
  'thread name marker'
);
replaceRequired(
  '<div className="truncate text-[11px] text-zinc-500">{selected.assigned_profile?.full_name || \'Unassigned\'} · {label(selectedContact?.lifecycle_key || \'new\')}</div>',
  '<div data-chat-subtitle="true" className="truncate text-[11px] text-zinc-500"><span className="capitalize">{selected.provider}</span> · {selected.assigned_profile?.full_name || \'Unassigned\'} · {label(selectedContact?.lifecycle_key || \'new\')}</div>',
  'thread subtitle'
);
replaceRequired(
  '<button type="button" onClick={() => setContextOpen(true)} className="button-secondary button-sm xl:hidden"><PanelRight',
  '<button type="button" aria-label="Open conversation details" onClick={() => setContextOpen(true)} className="button-secondary button-sm xl:hidden"><PanelRight',
  'details button label'
);
replaceRequired(
  '<button type="button" onClick={() => setMoreOpen((value) => !value)} className="button-secondary button-sm"><MoreHorizontal',
  '<button type="button" aria-label="More conversation actions" onClick={() => setMoreOpen((value) => !value)} className="button-secondary button-sm"><MoreHorizontal',
  'more button label'
);

replaceRequired(
  '<div ref={messagePaneRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">',
  '<div ref={messagePaneRef} aria-label="Message history" className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">',
  'message history label'
);

const timelineStart = source.indexOf('              {loadingThread && messages.length === 0 ?');
const timelineEndMarker = '            </div>\n          </div>\n\n          <div className="shrink-0 border-t border-zinc-200 bg-white p-3">';
const timelineEnd = source.indexOf(timelineEndMarker, timelineStart);
if (timelineStart < 0 || timelineEnd < 0) throw new Error('Timeline block not found');
const timelineReplacement = `              {loadingThread && messages.length === 0 ? <div className="space-y-3 py-3" aria-label="Loading conversation"><div className="h-12 w-2/3 animate-pulse rounded-lg bg-zinc-200/70" /><div className="ml-auto h-12 w-1/2 animate-pulse rounded-lg bg-zinc-200/70" /><div className="h-16 w-3/4 animate-pulse rounded-lg bg-zinc-200/70" /></div> : <MetaConversationTimeline timeline={timeline} customerName={selected.customer_name} customerAvatarUrl={selected.customer_avatar_url} />}\n`;
source = source.slice(0, timelineStart) + timelineReplacement + source.slice(timelineEnd);

const composerStart = source.indexOf('          <div className="shrink-0 border-t border-zinc-200 bg-white p-3">');
const composerEndMarker = '        </>}\n      </section>';
const composerEnd = source.indexOf(composerEndMarker, composerStart);
if (composerStart < 0 || composerEnd < 0) throw new Error('Composer block not found');
const composer = `          <footer className="shrink-0 border-t border-zinc-200 bg-white p-3">\n            <div data-chat-composer="true">\n              <div data-composer-tabs="true">\n                <button type="button" aria-pressed={replyMode === 'outbound'} onClick={() => setReplyMode('outbound')} className={replyMode === 'outbound' ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-500 hover:text-zinc-900'}>Reply</button>\n                <button type="button" aria-pressed={replyMode === 'internal'} onClick={() => setReplyMode('internal')} className={replyMode === 'internal' ? 'bg-amber-100 text-amber-950' : 'text-zinc-500 hover:text-zinc-900'}>Internal note</button>\n                {replyMode === 'outbound' && !canReply && <span className="ml-auto text-[10px] font-semibold text-amber-700">Provider reply window closed</span>}\n              </div>\n              <textarea aria-label={replyMode === 'internal' ? 'Internal note' : 'Reply'} ref={composerRef} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} rows={3} disabled={(replyMode === 'outbound' && !canReply) || loadingThread} placeholder={replyMode === 'internal' ? 'Leave context for your team…' : 'Write a reply…'} className="w-full resize-none bg-transparent px-3.5 py-3 text-sm outline-none disabled:bg-zinc-50" />\n              <div data-composer-actions="true" className="flex items-center justify-between px-3 py-1.5">\n                <div className="text-[10px] text-zinc-400">Enter to send · Shift+Enter for a new line</div>\n                <button type="button" onClick={() => void send()} disabled={sending || loadingThread || !replyBody.trim() || (replyMode === 'outbound' && !canReply)} className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-[#0866ff] px-3 text-xs font-semibold text-white hover:bg-[#075ee5] disabled:cursor-not-allowed disabled:opacity-40">{sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{replyMode === 'internal' ? 'Add note' : 'Send'}</button>\n              </div>\n            </div>\n          </footer>\n`;
source = source.slice(0, composerStart) + composer + source.slice(composerEnd);

replaceRequired(
  'const context = selected ? <div className="flex h-full min-h-0 flex-col bg-white">',
  'const context = selected ? <section aria-label="Conversation details" className="flex h-full min-h-0 flex-col bg-white">',
  'context section start'
);
replaceRequired(
  '<div className="grid grid-cols-4 border-b border-zinc-200 bg-zinc-50 p-1.5">{([\'details\',\'history\',\'assist\',\'crm\'] as ContextTab[]).map((tab) => <button key={tab} type="button" onClick={() => setContextTab(tab)} className={`rounded-md px-1 py-2 text-[11px] font-semibold capitalize ${contextTab === tab ? \'bg-white text-zinc-950 shadow-sm\' : \'text-zinc-500 hover:text-zinc-900\'}`}>{tab}</button>)}</div>',
  '<div data-context-tabs="true">{([\'details\',\'history\',\'assist\',\'crm\'] as ContextTab[]).map((tab) => <button key={tab} type="button" aria-selected={contextTab === tab} onClick={() => setContextTab(tab)}>{tab === \'crm\' ? \'CRM\' : label(tab)}</button>)}</div>',
  'context tabs'
);
replaceRequired(
  '<div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold">{initials(selected.customer_name)}</div><div className="min-w-0"><div className="truncate text-base font-semibold text-zinc-950">{selected.customer_name || contactLabel}</div><div className="truncate text-xs text-zinc-500">{selected.customer_phone || selectedContact?.primary_phone || selected.customer_email || selectedContact?.primary_email || \'No direct contact detail\'}</div></div></div>',
  '<div data-customer-summary="true" className="flex items-center gap-3">{selected.customer_avatar_url ? <img data-customer-avatar="true" src={selected.customer_avatar_url} alt="" /> : <div data-customer-avatar="true" className="flex items-center justify-center bg-zinc-100 text-xs font-bold">{initials(selected.customer_name)}</div>}<div className="min-w-0"><div className="truncate text-base font-semibold text-zinc-950">{selected.customer_name || contactLabel}</div><div className="truncate text-xs text-zinc-500">{selected.customer_phone || selectedContact?.primary_phone || selected.customer_email || selectedContact?.primary_email || \'No direct contact detail\'}</div></div></div>',
  'customer summary'
);
replaceRequired(
  'className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold"',
  'className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold"',
  'collaborator chips'
);
replaceRequired(
  '  </div> : null;\n\n  return <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-white">',
  '  </section> : null;\n\n  return <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-white">',
  'context section close'
);
replaceRequired(
  '<aside className="hidden min-h-0 border-l border-zinc-200 xl:block">{context}</aside>',
  '<aside aria-label="Conversation context panel" className="hidden min-h-0 border-l border-zinc-200 xl:block">{context}</aside>',
  'context aside label'
);
replaceRequired(
  '<button type="button" onClick={() => setContextOpen(false)} className="absolute right-2 top-2 rounded bg-white p-2 shadow"><X',
  '<button type="button" aria-label="Close conversation details" onClick={() => setContextOpen(false)} className="absolute right-2 top-2 rounded-md bg-white p-2 shadow"><X',
  'mobile context close label'
);
replaceRequired(
  '<button type="button" onClick={() => setCloseOpen(false)}><X className="h-4 w-4" /></button>',
  '<button type="button" aria-label="Close resolve dialog" onClick={() => setCloseOpen(false)}><X className="h-4 w-4" /></button>',
  'resolve close label'
);

fs.writeFileSync(path, source);
