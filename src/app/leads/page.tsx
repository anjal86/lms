'use client';

import { Suspense, useEffect } from 'react';
import ManagerPipeline from '@/components/leads/ManagerPipeline';
import GenericLeadList from '@/components/leads/GenericLeadList';
import { useWorkspace } from '@/lib/platform/WorkspaceContext';
import LeadsLoading from './loading';

function PipelinePageContent() {
  const { config, isLoading, term } = useWorkspace();
  const leadPlural = term('lead_plural', 'Leads');

  useEffect(() => {
    document.title = `${leadPlural} — ${config.workspace.name}`;
  }, [config.workspace.name, leadPlural]);

  if (isLoading) return <LeadsLoading />;
  if (config.workspace.business_type !== 'travel') return <GenericLeadList />;
  return <ManagerPipeline />;
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<LeadsLoading />}>
      <PipelinePageContent />
    </Suspense>
  );
}
