'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import GenericLeadWorkspace from '@/components/leads/GenericLeadWorkspace';

export default function MyWorkLeadPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;
  const { config, isLoading } = useWorkspace();
  const isTravel = config.workspace.business_type === 'travel';

  useEffect(() => {
    if (!isLoading && isTravel) router.replace(`/leads/${leadId}/workspace`);
  }, [isLoading, isTravel, leadId, router]);

  if (!isLoading && !isTravel) return <GenericLeadWorkspace />;

  return (
    <div className="flex min-h-[45vh] items-center justify-center gap-2 text-sm text-zinc-500">
      <Loader2 className="h-4 w-4 animate-spin" /> Opening opportunity…
    </div>
  );
}
