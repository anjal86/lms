'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * `setup` and `whatsapp=open` are navigation commands, not durable page state.
 * Consume them after the target drawer has mounted so reloads/back-navigation do
 * not reopen a modal the user already dismissed.
 */
export default function ConsumeConnectionEntryParams() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const hasSetupCommand = params.has('setup');
    const hasWhatsAppCommand = params.get('whatsapp') === 'open';
    if (!hasSetupCommand && !hasWhatsAppCommand) return;

    const next = new URLSearchParams(params.toString());
    if (hasSetupCommand) next.delete('setup');
    if (hasWhatsAppCommand) next.delete('whatsapp');

    const query = next.toString();
    router.replace(query ? `/connections?${query}` : '/connections', { scroll: false });
  }, [params, router]);

  return null;
}
