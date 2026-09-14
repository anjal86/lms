export type MessageMedia = {
  kind: 'image' | 'video' | 'audio' | 'file' | 'media';
  url: string | null;
  previewUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function rows(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is UnknownRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function url(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function messageMedia(messageType: string, metadataValue: unknown): MessageMedia | null {
  const metadata = record(metadataValue);
  const attachments = record(metadata.attachments);
  const first = rows(attachments.data)[0] || {};
  const imageData = record(first.image_data);
  const videoData = record(first.video_data);

  const directUrl = url(metadata.attachment_url);
  const directPreview = url(metadata.preview_url);
  const nestedImageUrl = url(imageData.url);
  const nestedImagePreview = url(imageData.preview_url);
  const nestedVideoUrl = url(videoData.url);
  const nestedFileUrl = url(first.file_url);

  const mimeType = typeof metadata.mime_type === 'string'
    ? metadata.mime_type
    : typeof first.mime_type === 'string'
      ? first.mime_type
      : null;
  const fileName = typeof metadata.file_name === 'string'
    ? metadata.file_name
    : typeof first.name === 'string'
      ? first.name
      : null;

  const normalizedType = messageType.toLowerCase();
  let kind: MessageMedia['kind'] = 'media';
  if (normalizedType === 'image' || mimeType?.startsWith('image/') || nestedImageUrl || nestedImagePreview) kind = 'image';
  else if (normalizedType === 'video' || mimeType?.startsWith('video/') || nestedVideoUrl) kind = 'video';
  else if (normalizedType === 'audio' || mimeType?.startsWith('audio/') || fileName?.toLowerCase().includes('audioclip')) kind = 'audio';
  else if (normalizedType === 'file' || nestedFileUrl || fileName) kind = 'file';

  const resolvedUrl = directUrl || nestedImageUrl || nestedVideoUrl || nestedFileUrl;
  const previewUrl = directPreview || nestedImagePreview || (kind === 'image' ? resolvedUrl : null);
  if (!resolvedUrl && !previewUrl && normalizedType === 'text') return null;
  if (!resolvedUrl && !previewUrl && !['image', 'video', 'audio', 'file', 'media'].includes(normalizedType)) return null;

  return {
    kind,
    url: resolvedUrl,
    previewUrl,
    fileName,
    mimeType,
  };
}

export function isMediaPlaceholder(body: string | null | undefined) {
  if (!body) return true;
  return /^\[(?:photo|video|voice message|media attachment|file(?::[^\]]*)?)\]$/i.test(body.trim());
}
