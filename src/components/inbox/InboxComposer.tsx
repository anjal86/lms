'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, FileText, Image as ImageIcon, Loader2, Paperclip, Plus, Send, Smile, X } from 'lucide-react';

type ReplyMode = 'outbound' | 'internal';

export type InboxComposerAttachment = {
  storagePath: string;
  url: string;
  providerUrl?: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: string;
};

type QuickReply = { id: string; title: string; body: string };

type Props = {
  workspaceId: string;
  conversationId: string;
  mode: ReplyMode;
  onModeChange: (mode: ReplyMode) => void;
  value: string;
  onChange: (value: string) => void;
  canReply: boolean;
  loading?: boolean;
  sending?: boolean;
  composerRef?: React.RefObject<HTMLTextAreaElement | null>;
  onTyping?: (typing: boolean) => void;
  onSend: (payload: { body: string; attachment?: InboxComposerAttachment | null; mode: ReplyMode }) => Promise<boolean>;
};

const DEFAULT_REPLIES: QuickReply[] = [
  { id: 'thanks', title: 'Acknowledge', body: 'Thanks for reaching out. Let me check this for you.' },
  { id: 'details', title: 'Ask for details', body: 'Could you please share a little more detail so I can help you properly?' },
  { id: 'received', title: 'Received', body: 'We’ve received this. I’ll update you shortly.' },
];
const EMOJIS = ['🙂','😊','👍','🙏','✅','❤️','🎉','📌','📞','✈️','📄','💬','👋','🤝','⭐','⚡'];

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / 1024 / 1024 * 10) / 10} MB`;
}

export default function InboxComposer({ workspaceId, conversationId, mode, onModeChange, value, onChange, canReply, loading, sending, composerRef, onTyping, onSend }: Props) {
  const [attachment, setAttachment] = useState<InboxComposerAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>(DEFAULT_REPLIES);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const draftKey = useMemo(() => `inbox:draft:${workspaceId}:${conversationId}:${mode}`, [conversationId, mode, workspaceId]);
  const quickKey = useMemo(() => `inbox:quick-replies:${workspaceId}`, [workspaceId]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(quickKey);
      if (saved) {
        const parsed = JSON.parse(saved) as QuickReply[];
        if (Array.isArray(parsed) && parsed.length) setQuickReplies(parsed);
      }
    } catch { /* local convenience only */ }
  }, [quickKey]);

  useEffect(() => {
    try { onChange(window.localStorage.getItem(draftKey) || ''); } catch { onChange(''); }
    setAttachment(null);
    setQuickOpen(false);
    setEmojiOpen(false);
  // Loading a different conversation or switching Reply/Internal Note should restore that draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    try {
      if (value) window.localStorage.setItem(draftKey, value);
      else window.localStorage.removeItem(draftKey);
    } catch { /* local convenience only */ }
  }, [draftKey, value]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch(`/api/conversations/${conversationId}/attachments`, { method: 'POST', body: form });
      const payload = await response.json().catch(() => ({})) as { error?: string; attachment?: InboxComposerAttachment };
      if (!response.ok || !payload.attachment) throw new Error(payload.error || 'Unable to upload attachment.');
      setAttachment(payload.attachment);
    } catch (error) {
      window.dispatchEvent(new CustomEvent('inbox-composer-error', { detail: error instanceof Error ? error.message : 'Unable to upload attachment.' }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const send = async () => {
    const body = value.trim();
    if ((!body && !attachment) || loading || sending || uploading) return;
    if (mode === 'outbound' && !canReply) return;

    if (body) {
      const sent = await onSend({ body, mode });
      if (!sent) return;
      onChange('');
      try { window.localStorage.removeItem(draftKey); } catch { /* noop */ }
    }
    if (attachment) {
      const sent = await onSend({ body: '', attachment, mode: 'outbound' });
      if (sent) setAttachment(null);
    }
    onTyping?.(false);
  };

  const addQuickReply = () => {
    const body = value.trim();
    if (!body) return;
    const reply: QuickReply = { id: crypto.randomUUID(), title: body.slice(0, 32), body };
    const next = [...quickReplies, reply].slice(-20);
    setQuickReplies(next);
    try { window.localStorage.setItem(quickKey, JSON.stringify(next)); } catch { /* noop */ }
  };

  const disabled = loading || (mode === 'outbound' && !canReply);

  return <div data-chat-composer="true" className={mode === 'internal' ? 'border-amber-200 bg-amber-50/60' : ''}>
    <div data-composer-tabs="true">
      <button type="button" aria-pressed={mode === 'outbound'} onClick={() => onModeChange('outbound')} className={mode === 'outbound' ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-500 hover:text-zinc-900'}>Reply</button>
      <button type="button" aria-pressed={mode === 'internal'} onClick={() => onModeChange('internal')} className={mode === 'internal' ? 'bg-amber-100 text-amber-950' : 'text-zinc-500 hover:text-zinc-900'}>Internal note</button>
      {mode === 'outbound' && !canReply && <span className="ml-auto text-[10px] font-semibold text-amber-700">Reply unavailable for this channel</span>}
    </div>

    {attachment && <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs">
      {attachment.kind === 'image' ? <ImageIcon className="h-4 w-4 text-blue-600" /> : <FileText className="h-4 w-4 text-zinc-500" />}
      <div className="min-w-0 flex-1"><div className="truncate font-semibold text-zinc-800">{attachment.fileName}</div><div className="text-[10px] text-zinc-400">{sizeLabel(attachment.size)}</div></div>
      <button type="button" aria-label="Remove attachment" onClick={() => setAttachment(null)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"><X className="h-3.5 w-3.5" /></button>
    </div>}

    <textarea
      aria-label={mode === 'internal' ? 'Internal note' : 'Reply'}
      ref={composerRef}
      value={value}
      onChange={(event) => { onChange(event.target.value); onTyping?.(Boolean(event.target.value.trim())); }}
      onBlur={() => onTyping?.(false)}
      onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }}
      rows={3}
      disabled={disabled}
      placeholder={mode === 'internal' ? 'Leave context for your team…' : !canReply ? 'Replies are unavailable for this source. Use an internal note or open a supported messaging channel.' : 'Write a reply…'}
      className="w-full resize-none bg-transparent px-3.5 py-3 text-sm outline-none disabled:bg-zinc-50"
    />

    <div data-composer-actions="true" className="relative flex items-center justify-between gap-2 px-3 py-1.5">
      <div className="flex items-center gap-1">
        {mode === 'outbound' && <>
          <input ref={fileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,audio/mpeg,audio/mp4,audio/ogg,audio/webm,application/pdf,text/plain,.doc,.docx,.xls,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
          <button type="button" aria-label="Attach file" title="Attach file" onClick={() => fileRef.current?.click()} disabled={uploading || disabled} className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}</button>
          <button type="button" aria-label="Emoji" title="Emoji" onClick={() => { setEmojiOpen((open) => !open); setQuickOpen(false); }} disabled={disabled} className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40"><Smile className="h-4 w-4" /></button>
          <button type="button" aria-label="Saved replies" title="Saved replies" onClick={() => { setQuickOpen((open) => !open); setEmojiOpen(false); }} disabled={disabled} className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40"><BookOpen className="h-4 w-4" /></button>
        </>}
        <span className="ml-1 hidden text-[10px] text-zinc-400 sm:inline">Enter to send · Shift+Enter new line</span>
      </div>
      <button type="button" onClick={() => void send()} disabled={Boolean(sending || loading || uploading || (!value.trim() && !attachment) || (mode === 'outbound' && !canReply))} className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${mode === 'internal' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-zinc-950 hover:bg-zinc-800'}`}>{sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{mode === 'internal' ? 'Add note' : 'Send'}</button>

      {emojiOpen && <div className="absolute bottom-11 left-10 z-40 grid w-52 grid-cols-4 gap-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl">{EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => { onChange(`${value}${emoji}`); setEmojiOpen(false); composerRef?.current?.focus(); }} className="rounded-lg p-2 text-lg hover:bg-zinc-100">{emoji}</button>)}</div>}

      {quickOpen && <div className="absolute bottom-11 left-16 z-40 w-72 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2"><div className="text-xs font-semibold">Saved replies</div>{value.trim() && <button type="button" onClick={addQuickReply} className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:underline"><Plus className="h-3 w-3" /> Save current</button>}</div>
        <div className="max-h-60 overflow-y-auto p-1.5">{quickReplies.map((reply) => <button key={reply.id} type="button" onClick={() => { onChange(reply.body); setQuickOpen(false); composerRef?.current?.focus(); }} className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-zinc-50"><div className="text-xs font-semibold text-zinc-800">{reply.title}</div><div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-zinc-500">{reply.body}</div></button>)}</div>
      </div>}
    </div>
  </div>;
}
