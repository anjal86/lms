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

const MAX_LENGTH = 4000;
const COUNT_WARNING_AT = 3600;
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
  const valueRef = useRef(value);
  const attachmentRef = useRef<InboxComposerAttachment | null>(attachment);
  const draftKey = useMemo(() => `inbox:draft:${workspaceId}:${conversationId}:${mode}`, [conversationId, mode, workspaceId]);
  const quickKey = useMemo(() => `inbox:quick-replies:${workspaceId}`, [workspaceId]);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { attachmentRef.current = attachment; }, [attachment]);

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
  // Loading a different conversation or switching Reply/Private Note should restore that draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    try {
      if (value) window.localStorage.setItem(draftKey, value);
      else window.localStorage.removeItem(draftKey);
    } catch { /* local convenience only */ }
  }, [draftKey, value]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (emojiOpen || quickOpen) {
        event.stopPropagation();
        setEmojiOpen(false);
        setQuickOpen(false);
        composerRef?.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [composerRef, emojiOpen, quickOpen]);

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
    const queuedAttachment = attachment;
    if ((!body && !queuedAttachment) || loading || sending || uploading) return;
    if (mode === 'outbound' && !canReply) return;

    valueRef.current = '';
    attachmentRef.current = null;
    onChange('');
    if (queuedAttachment) setAttachment(null);
    setQuickOpen(false);
    setEmojiOpen(false);
    onTyping?.(false);
    try { window.localStorage.removeItem(draftKey); } catch { /* noop */ }

    let bodySent = !body;
    let attachmentSent = !queuedAttachment;

    if (body) bodySent = await onSend({ body, mode });

    // Keep the existing provider contract: text and media are separate outbound
    // messages, but the composer stays clear while both are delivered.
    if (bodySent && queuedAttachment) {
      attachmentSent = await onSend({ body: '', attachment: queuedAttachment, mode: 'outbound' });
    }

    if (!bodySent || !attachmentSent) {
      if (!bodySent && !valueRef.current.trim() && body) onChange(body);
      if (!attachmentSent && !attachmentRef.current && queuedAttachment) setAttachment(queuedAttachment);
    }

    window.requestAnimationFrame(() => composerRef?.current?.focus());
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
  const hasContent = Boolean(value.trim() || attachment);
  const nearLimit = value.length >= COUNT_WARNING_AT;
  const privateMode = mode === 'internal';

  return <div className="px-3 pb-3 pt-2">
    <div
      data-chat-composer="true"
      data-reply-mode={mode}
      className={`relative overflow-visible rounded-xl border bg-white shadow-sm transition-[border-color,box-shadow,background-color] duration-150 ${privateMode ? 'border-amber-200 bg-amber-50/35 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100' : 'border-zinc-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100'}`}
    >
      <div data-composer-tabs="true" className="flex min-h-10 items-center gap-1 border-b border-zinc-100 px-2.5">
        <button
          type="button"
          aria-pressed={mode === 'outbound'}
          onClick={() => onModeChange('outbound')}
          className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${mode === 'outbound' ? 'bg-blue-50 text-blue-700' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'}`}
        >
          Reply
        </button>
        <button
          type="button"
          aria-pressed={mode === 'internal'}
          onClick={() => onModeChange('internal')}
          className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${mode === 'internal' ? 'bg-amber-100 text-amber-900' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'}`}
        >
          Private note
        </button>
        {privateMode && <span className="ml-1 hidden text-[10px] text-amber-700 sm:inline">Only visible to your team</span>}
        {mode === 'outbound' && !canReply && <span className="ml-auto truncate text-[10px] font-medium text-amber-700">Reply unavailable for this channel</span>}
      </div>

      {attachment && <div className="mx-3 mt-2.5 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs">
        {attachment.kind === 'image' ? <ImageIcon className="h-4 w-4 shrink-0 text-blue-600" /> : <FileText className="h-4 w-4 shrink-0 text-zinc-500" />}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-zinc-800">{attachment.fileName}</div>
          <div className="text-[10px] text-zinc-400">{sizeLabel(attachment.size)}</div>
        </div>
        <button type="button" aria-label="Remove attachment" onClick={() => setAttachment(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-white hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"><X className="h-3.5 w-3.5" /></button>
      </div>}

      <textarea
        aria-label={privateMode ? 'Private note' : 'Reply'}
        ref={composerRef}
        value={value}
        maxLength={MAX_LENGTH}
        onChange={(event) => {
          onChange(event.target.value);
          onTyping?.(Boolean(event.target.value.trim()));
        }}
        onBlur={() => onTyping?.(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void send();
          }
        }}
        rows={3}
        disabled={disabled}
        placeholder={privateMode ? 'Leave a note for your team…' : !canReply ? 'Replies are unavailable for this source.' : 'Type a message…'}
        className={`max-h-44 min-h-[76px] w-full resize-none bg-transparent px-3.5 py-3 text-sm leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-50/80 disabled:text-zinc-400 ${privateMode ? 'placeholder:text-amber-700/50' : ''}`}
      />

      <div data-composer-actions="true" className="relative flex min-h-11 items-center justify-between gap-2 border-t border-zinc-100 px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-0.5">
          {mode === 'outbound' && <>
            <input ref={fileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,audio/mpeg,audio/mp4,audio/ogg,audio/webm,application/pdf,text/plain,.doc,.docx,.xls,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
            <button type="button" aria-label="Attach file" title="Attach file" onClick={() => fileRef.current?.click()} disabled={uploading || disabled} className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-40">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}</button>
            <button type="button" aria-label="Emoji" title="Emoji" aria-expanded={emojiOpen} onClick={() => { setEmojiOpen((open) => !open); setQuickOpen(false); }} disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-40"><Smile className="h-4 w-4" /></button>
            <button type="button" aria-label="Saved replies" title="Saved replies" aria-expanded={quickOpen} onClick={() => { setQuickOpen((open) => !open); setEmojiOpen(false); }} disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-40"><BookOpen className="h-4 w-4" /></button>
          </>}

          {nearLimit ? <span className={`ml-1 text-[10px] tabular-nums ${value.length >= MAX_LENGTH ? 'font-semibold text-rose-600' : 'text-zinc-400'}`}>{value.length}/{MAX_LENGTH}</span> : <span className="ml-1 hidden truncate text-[10px] text-zinc-400 md:inline">Enter to send · Shift+Enter for new line</span>}
        </div>

        <button
          type="button"
          onClick={() => void send()}
          disabled={Boolean(sending || loading || uploading || !hasContent || (mode === 'outbound' && !canReply))}
          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 ${privateMode ? 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500/40' : 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500/40'}`}
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {privateMode ? 'Add note' : 'Send'}
        </button>

        {emojiOpen && <div role="dialog" aria-label="Choose emoji" className="absolute bottom-11 left-8 z-50 grid w-52 grid-cols-4 gap-1 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl">{EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => { onChange(`${value}${emoji}`); setEmojiOpen(false); composerRef?.current?.focus(); }} className="flex h-10 w-10 items-center justify-center rounded-lg text-lg hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30">{emoji}</button>)}</div>}

        {quickOpen && <div role="dialog" aria-label="Saved replies" className="absolute bottom-11 left-16 z-50 w-72 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2.5">
            <div className="text-xs font-semibold text-zinc-900">Saved replies</div>
            {value.trim() && <button type="button" onClick={addQuickReply} className="inline-flex h-8 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"><Plus className="h-3 w-3" /> Save current</button>}
          </div>
          <div className="max-h-60 overflow-y-auto p-1.5">{quickReplies.map((reply) => <button key={reply.id} type="button" onClick={() => { onChange(reply.body); setQuickOpen(false); composerRef?.current?.focus(); }} className="min-h-11 w-full rounded-lg px-2.5 py-2 text-left hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30"><div className="text-xs font-medium text-zinc-800">{reply.title}</div><div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-zinc-500">{reply.body}</div></button>)}</div>
        </div>}
      </div>
    </div>
  </div>;
}
