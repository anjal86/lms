export type BusinessType = 'travel' | 'consultancy' | 'health' | 'agency' | 'generic' | string;

export type WorkspaceTerminology = {
  lead: string;
  lead_plural: string;
  contact: string;
  contact_plural: string;
  deal: string;
  deal_plural: string;
  convert: string;
  workspace_label: string;
  [key: string]: string;
};

export type WorkspaceModule = {
  module_key: string;
  is_enabled: boolean;
  settings: Record<string, unknown>;
  sort_order: number;
};

export type DynamicFieldDefinition = {
  id: string;
  entity_type: 'lead' | 'contact' | 'conversation' | 'deal';
  field_key: string;
  label: string;
  field_type: string;
  section_key: string;
  description: string | null;
  options: unknown[];
  validation: Record<string, unknown>;
  default_value: unknown;
  is_required: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  definition_source?: 'template' | 'custom';
};

export type PipelineStageConfig = {
  id: string;
  stage_key: string;
  name: string;
  stage_type: 'open' | 'won' | 'lost';
  probability: number;
  sort_order: number;
  color_token: string;
};

export type PipelineConfig = {
  id: string;
  pipeline_key: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  definition_source?: 'template' | 'custom';
  stages: PipelineStageConfig[];
};

export type BusinessTemplateSummary = {
  key: string;
  name: string;
  business_type: string;
  description: string | null;
  terminology: WorkspaceTerminology;
};

export type WorkspaceConfig = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    business_type: BusinessType;
    template_key: string | null;
    timezone: string;
    currency: string;
    locale: string;
    terminology: WorkspaceTerminology;
    settings: Record<string, unknown>;
  };
  fields: DynamicFieldDefinition[];
  pipelines: PipelineConfig[];
  modules: WorkspaceModule[];
  templates: BusinessTemplateSummary[];
};

export const DEFAULT_TERMINOLOGY: WorkspaceTerminology = {
  lead: 'Lead',
  lead_plural: 'Leads',
  contact: 'Contact',
  contact_plural: 'Contacts',
  deal: 'Opportunity',
  deal_plural: 'Opportunities',
  convert: 'Convert to Lead',
  workspace_label: 'Business Workspace',
};
