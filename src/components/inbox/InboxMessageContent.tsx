'use client';

import { useMemo, useState } from 'react';
import { Expand, FileText, ImageOff, Loader2, RotateCcw } from 'lucide-react';
import { isMediaPlaceholder, messageMedia } from '@/lib/inbox/message-media';

type InboxMessageContentProps = {
  conversationId: string;
  message: {
    id: string;
    message_type: string;
    body: string | null;
    metadata?: Record<string, unknown> | null;
  };
  onOpenMedia?: () => void;
};

type LazyMediaState = 'idle' | 'loading' | 'error' | 'unavailable';

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export default function InboxMessageContent({ conversationId, message, onOpenMedia }: InboxMessageContentProps) {
  const media = useMemo(() => messageMedia(message.message_type, message.metadata), [message.message_type, message.metadata]);
  const metadata = useMemo(() => metadataRecord(message.metadata), [message.metadata]);
  const [imageFallback, setImageFallback] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [lazyState, setLazyState] = useState<LazyMediaState>(
    metadata.media_recovery_state === 'unavailable' ? 'unavailable' : 'idle'
  );
  const [lazyError, setLazyError] = useState<string | null>(null);
  const showBody = Boolean(message.body && !isMediaPlaceholder(message.body));

  if (!media) {
    return <div className="whitespace-pre-wrap break-words">{message.body || 'Attachment'}</div>;
  }

  const isBaileysMedia = metadata.transport === 'baileys' && metadata.media_available_on_device === true;
  const canLazyLoad = isBaileysMedia && !media.url && !media.previewUrl && lazyState !== 'unavailable';
  const effectiveUrl = resolvedUrl || media.url;
  const effectivePreviewUrl = resolvedUrl || media.previewUrl;
  const imageSrc = imageFallback ? effectiveUrl : effectivePreviewUrl || effectiveUrl;

  const loadWhatsappMedia = async () => {
    if (!canLazyLoad || lazyState === 'loading') return;
    setLazyState('loading');
    setLazyError(null);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 47_000);

    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(message.id)}/media`,
        { method: 'POST', cache: 'no-store', signal: controller.signal }
      );
      const payload = await response.json().catch(() => ({})) as {
        status?: string;
        url?: string;
        error?: string;
        code?: string;
        terminal?: boolean;
      };

      if (response.ok && payload.status === 'ready' && payload.url) {
        setResolvedUrl(payload.url);
        setImageFallback(false);
        setImageFailed(false);
        setLazyState('idle');
        return;
      }

      if (payload.terminal === true || response.status === 410) {
        setLazyState('unavailable');
        setLazyError(payload.error || 'Media no longer available');
        return;
      }

      setLazyState('error');
      setLazyError(
        payload.code === 'media_metadata_refresh_required'
          ? 'Refresh chat history, then tap again.'
          : payload.error || 'Could not retrieve media from WhatsApp.'
      );
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'AbortError';
      setLazyState('error');
      setLazyError(
        timedOut
          ? 'WhatsApp media request timed out. Tap to retry.'
          : 'Could not retrieve media from WhatsApp.'
      );
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const lazyPlaceholder = canLazyLoad || lazyState === 'loading' || lazyState === 'error'
    ? <button
        type="button"
        onClick={() => void loadWhatsappMedia()}
        disabled={lazyState === 'loading'}
        className="flex min-h-24 min-w-44 w-full items-center justify-center gap-2 rounded-md border border-dashed border-current/20 bg-black/[0.03] px-4 py-6 text-xs font-medium opacity-80 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30 disabled:cursor-wait"
      >
        {lazyState === 'loading'
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Retrieving from WhatsApp…</>
          : lazyState === 'error'
            ? <><RotateCcw className="h-4 w-4" /> {lazyError || 'Tap to retry'}</>
            : <><ImageOff className="h-4 w-4" /> Tap to load</>}
      </button>
    : null;

  return <div className="space-y-2">
    {media.kind === 'image' && imageSrc && !imageFailed && (onOpenMedia && !resolvedUrl ? <button type="button" onClick={onOpenMedia} className="block max-w-full overflow-hidden rounded-md bg-zinc-100 text-left" aria-label="Open photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt={media.fileName || 'Photo attachment'}
        loading="lazy"
        className="max-h-[460px] w-auto max-w-full object-contain"
        onError={() => {
          if (!imageFallback && effectiveUrl && effectiveUrl !== imageSrc) setImageFallback(true);
          else setImageFailed(true);
        }}
      />
    </button> : <a href={effectiveUrl || imageSrc} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md bg-zinc-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt={media.fileName || 'Photo attachment'}
        loading="lazy"
        className="max-h-[460px] w-auto max-w-full object-contain"
        onError={() => {
          if (!imageFallback && effectiveUrl && effectiveUrl !== imageSrc) setImageFallback(true);
          else setImageFailed(true);
        }}
      />
    </a>)}

    {media.kind === 'image' && !imageSrc && lazyPlaceholder}
    {media.kind !== 'image' && !effectiveUrl && lazyPlaceholder}

    {lazyState === 'unavailable' && !effectiveUrl && <div className="flex min-h-24 min-w-44 items-center justify-center gap-2 rounded-md border border-dashed border-current/20 bg-black/[0.03] px-4 py-6 text-xs opacity-70">
      <ImageOff className="h-4 w-4" /> Media no longer available
    </div>}

    {media.kind === 'image' && (!imageSrc || imageFailed) && !lazyPlaceholder && lazyState !== 'unavailable' && <div className="flex min-h-24 min-w-44 items-center justify-center gap-2 rounded-md border border-dashed border-current/20 bg-black/[0.03] px-4 py-6 text-xs opacity-70">
      <ImageOff className="h-4 w-4" /> Photo unavailable
    </div>}

    {media.kind === 'video' && effectiveUrl && <div className="relative">
      <video src={effectiveUrl} controls preload="metadata" className="max-h-[460px] max-w-full rounded-md bg-black" />
      {onOpenMedia && !resolvedUrl && <button type="button" aria-label="Open video" onClick={onOpenMedia} className="absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-white hover:bg-black/75"><Expand className="h-3.5 w-3.5" /></button>}
    </div>}

    {media.kind === 'audio' && effectiveUrl && <audio src={effectiveUrl} controls preload="metadata" className="w-full min-w-64" />}

    {(media.kind === 'file' || media.kind === 'media') && effectiveUrl && <a href={effectiveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-current/20 px-3 py-2 text-xs font-semibold underline-offset-2 hover:underline">
      <FileText className="h-4 w-4" /> {media.fileName || 'Open attachment'}
    </a>}

    {showBody && <div className="whitespace-pre-wrap break-words">{message.body}</div>}
  </div>;
}
