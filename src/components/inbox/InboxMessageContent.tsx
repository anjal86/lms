'use client';

import { useMemo, useState } from 'react';
import { FileText, ImageOff } from 'lucide-react';
import { isMediaPlaceholder, messageMedia } from '@/lib/inbox/message-media';

type InboxMessageContentProps = {
  message: {
    message_type: string;
    body: string | null;
    metadata?: Record<string, unknown> | null;
  };
};

export default function InboxMessageContent({ message }: InboxMessageContentProps) {
  const media = useMemo(() => messageMedia(message.message_type, message.metadata), [message.message_type, message.metadata]);
  const [imageFallback, setImageFallback] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const showBody = Boolean(message.body && !isMediaPlaceholder(message.body));

  if (!media) {
    return <div className="whitespace-pre-wrap break-words">{message.body || 'Attachment'}</div>;
  }

  const imageSrc = imageFallback ? media.url : media.previewUrl || media.url;

  return <div className="space-y-2">
    {media.kind === 'image' && imageSrc && !imageFailed && <a href={media.url || imageSrc} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md bg-zinc-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt={media.fileName || 'Photo attachment'}
        loading="lazy"
        className="max-h-[460px] w-auto max-w-full object-contain"
        onError={() => {
          if (!imageFallback && media.url && media.url !== imageSrc) setImageFallback(true);
          else setImageFailed(true);
        }}
      />
    </a>}

    {media.kind === 'image' && (!imageSrc || imageFailed) && <div className="flex min-h-24 min-w-44 items-center justify-center gap-2 rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-xs text-zinc-500">
      <ImageOff className="h-4 w-4" /> Photo unavailable
    </div>}

    {media.kind === 'video' && media.url && <video src={media.url} controls preload="metadata" className="max-h-[460px] max-w-full rounded-md bg-black" />}

    {media.kind === 'audio' && media.url && <audio src={media.url} controls preload="metadata" className="w-full min-w-64" />}

    {(media.kind === 'file' || media.kind === 'media') && media.url && <a href={media.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-current/20 px-3 py-2 text-xs font-semibold underline-offset-2 hover:underline">
      <FileText className="h-4 w-4" /> {media.fileName || 'Open attachment'}
    </a>}

    {showBody && <div className="whitespace-pre-wrap break-words">{message.body}</div>}
  </div>;
}
