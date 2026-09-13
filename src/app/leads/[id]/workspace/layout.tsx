'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import GenericLeadWorkspace from '@/components/leads/GenericLeadWorkspace';

export default function LeadWorkspaceLayout({ children }: { children: ReactNode }) {
  const { config, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-sm text-zinc-500" role="status" aria-live="polite">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing workspace…
      </div>
    );
  }

  if (config.workspace.business_type !== 'travel') {
    return <GenericLeadWorkspace />;
  }

  return children;
}
