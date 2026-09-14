export type WorkflowTemplate = {
  key: string;
  name: string;
  description: string;
  trigger: string;
  conditions: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: 'new-enquiry-routing',
    name: 'New enquiry routing',
    description: 'Route a new Inbox enquiry, set normal priority and create a follow-up in one hour.',
    trigger: 'message_received',
    conditions: {},
    actions: [
      { type: 'assign', strategy: 'least_open' },
      { type: 'set_priority', value: 'normal' },
      { type: 'set_next_action', minutes: 60 },
    ],
  },
  {
    key: 'urgent-enquiry',
    name: 'Urgent enquiry follow-up',
    description: 'When an urgent conversation receives a message, route it and create a 15-minute follow-up.',
    trigger: 'message_received',
    conditions: { priority: 'urgent' },
    actions: [
      { type: 'assign', strategy: 'least_open' },
      { type: 'set_next_action', minutes: 15 },
    ],
  },
  {
    key: 'won-handoff',
    name: 'Won opportunity handoff',
    description: 'When an opportunity is won, mark the customer lifecycle and create the next operational action.',
    trigger: 'opportunity.won',
    conditions: {},
    actions: [
      { type: 'set_lifecycle', value: 'customer' },
      { type: 'set_next_action', minutes: 30 },
    ],
  },
];

export function getWorkflowTemplate(key: string | null) {
  if (!key) return null;
  return WORKFLOW_TEMPLATES.find((template) => template.key === key) || null;
}
