'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_TERMINOLOGY, type WorkspaceConfig } from './types';

const FALLBACK_CONFIG: WorkspaceConfig = {
  workspace: {
    id: 'default',
    name: 'Wanderlust',
    slug: 'wanderlust',
    business_type: 'travel',
    template_key: 'travel',
    timezone: 'Asia/Kathmandu',
    currency: 'NPR',
    locale: 'en-NP',
    terminology: {
      ...DEFAULT_TERMINOLOGY,
      lead: 'Inquiry',
      lead_plural: 'Inquiries',
      contact: 'Traveler',
      contact_plural: 'Travelers',
      deal: 'Booking',
      deal_plural: 'Bookings',
      convert: 'Convert to Inquiry',
      workspace_label: 'Travel Workspace',
    },
    settings: {},
  },
  fields: [],
  pipelines: [],
  modules: [],
  templates: [],
};

type WorkspaceContextValue = {
  config: WorkspaceConfig;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  moduleEnabled: (moduleKey: string, fallback?: boolean) => boolean;
  term: (key: string, fallback?: string) => string;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<WorkspaceConfig>(FALLBACK_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/platform/config', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load business configuration.');
      setConfig(payload as WorkspaceConfig);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load business configuration.');
      // Keep the last known/fallback configuration so CRM operations remain usable.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    config,
    isLoading,
    error,
    refresh,
    moduleEnabled: (moduleKey, fallback = false) => {
      const workspaceModule = config.modules.find((item) => item.module_key === moduleKey);
      return workspaceModule ? workspaceModule.is_enabled : fallback;
    },
    term: (key, fallback) => config.workspace.terminology[key] || fallback || key,
  }), [config, error, isLoading, refresh]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider.');
  return context;
}
