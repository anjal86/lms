import { describe, expect, it } from 'vitest';
import {
  runtimeWorkflowToGraph,
  validateWorkflowGraph,
  workflowGraphToRuntime,
  type WorkflowGraphDefinition,
} from './workflow-graph';

const runtime = {
  trigger_key: 'opportunity.created',
  conditions: { priority: 'high', has_lead: true },
  actions: [
    { type: 'set_priority', value: 'urgent' },
    { type: 'set_next_action', minutes: 30 },
  ],
};

describe('workflow graph adapter', () => {
  it('round-trips the existing runtime contract through a linear graph', () => {
    const graph = runtimeWorkflowToGraph(runtime);
    expect(validateWorkflowGraph(graph)).toEqual({ valid: true, issues: [] });
    expect(workflowGraphToRuntime(graph)).toEqual(runtime);
  });

  it('keeps an empty optional condition step visible without changing runtime data', () => {
    const definition = { trigger_key: 'message_received', conditions: {}, actions: [{ type: 'assign', strategy: 'least_open' }] };
    const graph = runtimeWorkflowToGraph(definition);
    expect(graph.nodes.map((node) => node.kind)).toEqual(['trigger', 'condition', 'action']);
    expect(validateWorkflowGraph(graph).valid).toBe(true);
    expect(workflowGraphToRuntime(graph)).toEqual(definition);
  });

  it('rejects dangling edges and unreachable nodes', () => {
    const graph: WorkflowGraphDefinition = {
      version: 1,
      nodes: [
        { id: 'trigger', kind: 'trigger', label: 'Trigger', config: { trigger_key: 'message_received' } },
        { id: 'action-1', kind: 'action', label: 'Action', config: { type: 'set_priority', value: 'high' } },
      ],
      edges: [{ id: 'broken', source: 'trigger', target: 'missing' }],
    };
    const result = validateWorkflowGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'dangling_edge')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'unreachable_node' && issue.nodeId === 'action-1')).toBe(true);
  });

  it('rejects cycles and branching because the executor is linear', () => {
    const graph: WorkflowGraphDefinition = {
      version: 1,
      nodes: [
        { id: 'trigger', kind: 'trigger', label: 'Trigger', config: { trigger_key: 'message_received' } },
        { id: 'action-1', kind: 'action', label: 'One', config: { type: 'set_priority', value: 'high' } },
        { id: 'action-2', kind: 'action', label: 'Two', config: { type: 'set_lifecycle', value: 'qualified' } },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'action-1' },
        { id: 'e2', source: 'trigger', target: 'action-2' },
        { id: 'e3', source: 'action-1', target: 'trigger' },
      ],
    };
    const result = validateWorkflowGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'branching_not_supported')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'cycle')).toBe(true);
  });

  it('requires exactly one trigger and at least one action', () => {
    const graph: WorkflowGraphDefinition = { version: 1, nodes: [], edges: [] };
    const result = validateWorkflowGraph(graph);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['trigger_count', 'missing_action']));
  });
});
