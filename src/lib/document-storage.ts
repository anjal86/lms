import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

export function validateTravelDocument(file: File) {
  if (!ALLOWED_TYPES.has(file.type)) {
    return 'Only PDF, JPEG, PNG, and WebP files are allowed.';
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return 'Document must be between 1 byte and 10 MB.';
  }
  return null;
}

export function formatDocumentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function uploadTravelDocument(leadId: string, file: File) {
  const validationError = validateTravelDocument(file);
  if (validationError) throw new Error(validationError);

  const response = await fetch('/api/documents/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id: leadId,
      file_name: file.name,
      content_type: file.type,
      size_bytes: file.size,
    }),
  });
  const signed = await response.json();
  if (!response.ok) throw new Error(signed.error || 'Unable to prepare secure upload.');

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.storage
    .from(signed.bucket)
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
  if (error) throw error;

  return {
    storage_path: signed.path as string,
    file_name: file.name,
    file_size: formatDocumentSize(file.size),
  };
}

export async function getTravelDocumentUrl(leadId: string, storagePath: string) {
  const response = await fetch('/api/documents/download-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: leadId, storage_path: storagePath }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Unable to open document.');
  return payload.url as string;
}

export async function removeTravelDocument(leadId: string, storagePath: string) {
  const response = await fetch('/api/documents/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: leadId, storage_path: storagePath }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Unable to delete document.');
}
