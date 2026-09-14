export type WorkflowNodeKind = 'trigger' | 'condition' | 'action';

export type RuntimeWorkflowDefinition = {
  trigger_key: string;
  conditions: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
};

export type WorkflowGraphNode = {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  config: Record<string, unknown>;
};

export type WorkflowGraphEdge = {
  id: string;
  source: string;
  target: string;
};

export type WorkflowGraphDefinition = {
  version: 1;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};

export type WorkflowGraphIssueCode =
  | 'duplicate_node_id'
  | 'duplicate_edge_id'
  | 'unsupported_node_type'
  | 'dangling_edge'
  | 'self_edge'
  | 'trigger_count'
  | 'trigger_has_incoming_edge'
  | 'unreachable_node'
  | 'cycle'
  | 'branching_not_supported'
  | 'multiple_condition_nodes'
  | 'condition_after_action'
  | 'missing_action';

export type WorkflowGraphIssue = {
  code: WorkflowGraphIssueCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type WorkflowGraphValidation = {
  valid: boolean;
  issues: WorkflowGraphIssue[];
};

const SUPPORTED_NODE_KINDS: WorkflowNodeKind[] = ['trigger', 'condition', 'action'];

function nodeLabel(kind: WorkflowNodeKind, config: Record<string, unknown>, index = 0) {
  if (kind === 'trigger') return String(config.trigger_key || 'Trigger').replaceAll('_', ' ');
  if (kind === 'condition') return Object.keys(config).length ? 'Conditions' : 'Any conditions';
  const type = String(config.type || `Action ${index + 1}`);
  return type.replaceAll('_', ' ');
}

export function runtimeWorkflowToGraph(definition: RuntimeWorkflowDefinition): WorkflowGraphDefinition {
  const nodes: WorkflowGraphNode[] = [
    {
      id: 'trigger',
      kind: 'trigger',
      label: nodeLabel('trigger', { trigger_key: definition.trigger_key }),
      config: { trigger_key: definition.trigger_key },
    },
    {
      id: 'conditions',
      kind: 'condition',
      label: nodeLabel('condition', definition.conditions || {}),
      config: { ...(definition.conditions || {}) },
    },
  ];

  definition.actions.forEach((action, index) => {
    nodes.push({
      id: `action-${index + 1}`,
      kind: 'action',
      label: nodeLabel('action', action, index),
      config: { ...action },
    });
  });

  const edges: WorkflowGraphEdge[] = nodes.slice(0, -1).map((node, index) => ({
    id: `edge-${node.id}-${nodes[index + 1].id}`,
    source: node.id,
    target: nodes[index + 1].id,
  }));

  return { version: 1, nodes, edges };
}

export function validateWorkflowGraph(graph: WorkflowGraphDefinition): WorkflowGraphValidation {
  const issues: WorkflowGraphIssue[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) issues.push({ code: 'duplicate_node_id', message: `Duplicate node id: ${node.id}`, nodeId: node.id });
    nodeIds.add(node.id);
    if (!SUPPORTED_NODE_KINDS.includes(node.kind)) issues.push({ code: 'unsupported_node_type', message: `Unsupported node type: ${String(node.kind)}`, nodeId: node.id });
  }

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const node of graph.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) issues.push({ code: 'duplicate_edge_id', message: `Duplicate edge id: ${edge.id}`, edgeId: edge.id });
    edgeIds.add(edge.id);
    if (edge.source === edge.target) issues.push({ code: 'self_edge', message: 'A workflow step cannot connect to itself.', edgeId: edge.id });
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({ code: 'dangling_edge', message: `Edge ${edge.id} references a missing node.`, edgeId: edge.id });
      continue;
    }
    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
  }

  const triggers = graph.nodes.filter((node) => node.kind === 'trigger');
  if (triggers.length !== 1) issues.push({ code: 'trigger_count', message: 'A workflow must contain exactly one trigger.' });

  const trigger = triggers[0];
  if (trigger && (incoming.get(trigger.id)?.length || 0) > 0) {
    issues.push({ code: 'trigger_has_incoming_edge', message: 'The trigger must be the first workflow step.', nodeId: trigger.id });
  }

  for (const node of graph.nodes) {
    if ((incoming.get(node.id)?.length || 0) > 1 || (outgoing.get(node.id)?.length || 0) > 1) {
      issues.push({ code: 'branching_not_supported', message: 'The current automation runtime supports a single linear path only.', nodeId: node.id });
    }
  }

  const conditionNodes = graph.nodes.filter((node) => node.kind === 'condition');
  if (conditionNodes.length > 1) issues.push({ code: 'multiple_condition_nodes', message: 'The current runtime supports one combined condition step.' });
  if (graph.nodes.every((node) => node.kind !== 'action')) issues.push({ code: 'missing_action', message: 'A workflow must contain at least one action.' });

  if (trigger) {
    const reachable = new Set<string>();
    const visiting = new Set<string>();
    let hasCycle = false;

    const visit = (id: string) => {
      if (visiting.has(id)) {
        hasCycle = true;
        return;
      }
      if (reachable.has(id)) return;
      visiting.add(id);
      reachable.add(id);
      for (const target of outgoing.get(id) || []) visit(target);
      visiting.delete(id);
    };

    visit(trigger.id);
    if (hasCycle) issues.push({ code: 'cycle', message: 'Workflow cycles are not supported.' });
    for (const node of graph.nodes) {
      if (!reachable.has(node.id)) issues.push({ code: 'unreachable_node', message: `Step ${node.label} is not reachable from the trigger.`, nodeId: node.id });
    }

    let cursor: string | undefined = trigger.id;
    let sawAction = false;
    const walked = new Set<string>();
    while (cursor && !walked.has(cursor)) {
      walked.add(cursor);
      const node = graph.nodes.find((candidate) => candidate.id === cursor);
      if (!node) break;
      if (node.kind === 'action') sawAction = true;
      if (node.kind === 'condition' && sawAction) {
        issues.push({ code: 'condition_after_action', message: 'Conditions must run before actions.', nodeId: node.id });
      }
      cursor = (outgoing.get(cursor) || [])[0];
    }
  }

  return { valid: issues.length === 0, issues };
}

export function workflowGraphToRuntime(graph: WorkflowGraphDefinition): RuntimeWorkflowDefinition {
  const validation = validateWorkflowGraph(graph);
  if (!validation.valid) throw new Error(validation.issues[0]?.message || 'Invalid workflow graph.');

  const trigger = graph.nodes.find((node) => node.kind === 'trigger');
  if (!trigger) throw new Error('Workflow trigger is missing.');

  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) outgoing.get(edge.source)?.push(edge.target);

  const ordered: WorkflowGraphNode[] = [];
  let cursor: string | undefined = trigger.id;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const node = graph.nodes.find((candidate) => candidate.id === cursor);
    if (!node) break;
    ordered.push(node);
    cursor = (outgoing.get(cursor) || [])[0];
  }

  const condition = ordered.find((node) => node.kind === 'condition');
  return {
    trigger_key: String(trigger.config.trigger_key || ''),
    conditions: condition ? { ...condition.config } : {},
    actions: ordered.filter((node) => node.kind === 'action').map((node) => ({ ...node.config })),
  };
}
