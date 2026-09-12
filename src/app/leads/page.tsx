'use client';

import { Suspense, useEffect } from 'react';
import ManagerPipeline from '@/components/leads/ManagerPipeline';
import LeadsLoading from './loading';

function PipelinePageContent() {
  useEffect(() => {
    document.title = 'Leads Pipeline — Wanderlust CRM';
  }, []);

  return <ManagerPipeline />;
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<LeadsLoading />}>
      <PipelinePageContent />
    </Suspense>
  );
}
