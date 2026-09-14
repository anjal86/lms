'use client';

import { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CheckCircle2, Sparkles, Zap } from 'lucide-react';
import type { WorkflowGraphDefinition, WorkflowNodeKind } from '@/lib/automation/workflow-graph';

type WorkflowNodeData = {
  kind: WorkflowNodeKind;
  label: string;
  summary: string;
};

type WorkflowFlowNode = Node<WorkflowNodeData, 'workflow'>;

const KIND_STYLES: Record<WorkflowNodeKind, { border: string; icon: string; eyebrow: string }> = {
  trigger: { border: 'border-blue-200', icon: 'bg-blue-50 text-blue-700', eyebrow: 'text-blue-700' },
  condition: { border: 'border-zinc-200', icon: 'bg-zinc-100 text-zinc-700', eyebrow: 'text-zinc-600' },
  action: { border: 'border-emerald-200', icon: 'bg-emerald-50 text-emerald-700', eyebrow: 'text-emerald-700' },
};

function StepIcon({ kind }: { kind: WorkflowNodeKind }) {
  if (kind === 'trigger') return <Zap className="h-4 w-4" aria-hidden="true" />;
  if (kind === 'condition') return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
  return <Sparkles className="h-4 w-4" aria-hidden="true" />;
}

function WorkflowStepNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const style = KIND_STYLES[data.kind];
  return (
    <div className={`w-[260px] rounded-xl border bg-white px-4 py-3.5 shadow-[0_10px_30px_rgba(24,24,27,0.06)] transition ${style.border} ${selected ? 'ring-2 ring-zinc-900/10 shadow-[0_16px_40px_rgba(24,24,27,0.10)]' : 'hover:shadow-[0_14px_36px_rgba(24,24,27,0.08)]'}`}>
      {data.kind !== 'trigger' && <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-zinc-400" />}
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.icon}`}><StepIcon kind={data.kind} /></span>
        <div className="min-w-0">
          <div className={`text-[9px] font-bold uppercase tracking-[0.16em] ${style.eyebrow}`}>{data.kind}</div>
          <div className="mt-0.5 truncate text-[13px] font-semibold capitalize text-zinc-950">{data.label}</div>
          <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-zinc-500">{data.summary}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-zinc-500" />
    </div>
  );
}

const nodeTypes: NodeTypes = { workflow: WorkflowStepNode };

function summarize(kind: WorkflowNodeKind, config: Record<string, unknown>) {
  if (kind === 'trigger') return `Starts on ${String(config.trigger_key || 'an event').replaceAll('_', ' ')}`;
  if (kind === 'condition') {
    const entries = Object.entries(config);
    if (!entries.length) return 'Runs for every matching event';
    return entries.slice(0, 3).map(([key, value]) => `${key.replaceAll('_', ' ')} = ${String(value)}`).join(' · ');
  }
  const type = String(config.type || 'action').replaceAll('_', ' ');
  if (config.value != null && config.value !== '') return `${type} → ${String(config.value)}`;
  if (config.strategy != null) return `${type} → ${String(config.strategy).replaceAll('_', ' ')}`;
  if (config.minutes != null) return `${type} · ${String(config.minutes)} min`;
  return type;
}

function toFlowNodes(graph: WorkflowGraphDefinition, selectedNodeId: string | null): WorkflowFlowNode[] {
  return graph.nodes.map((node, index) => ({
    id: node.id,
    type: 'workflow',
    position: { x: 72, y: 56 + index * 150 },
    selected: node.id === selectedNodeId,
    data: { kind: node.kind, label: node.label, summary: summarize(node.kind, node.config) },
    draggable: true,
    selectable: true,
  }));
}

export default function WorkflowCanvas({
  graph,
  selectedNodeId,
  onSelectNode,
}: {
  graph: WorkflowGraphDefinition;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}) {
  const initialNodes = useMemo(() => toFlowNodes(graph, selectedNodeId), [graph, selectedNodeId]);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>(initialNodes);

  useEffect(() => {
    setNodes((current) => {
      const positions = new Map(current.map((node) => [node.id, node.position]));
      return toFlowNodes(graph, selectedNodeId).map((node) => ({ ...node, position: positions.get(node.id) || node.position }));
    });
  }, [graph, selectedNodeId, setNodes]);

  const edges = useMemo<Edge[]>(() => graph.edges.map((edge) => ({
    ...edge,
    type: 'smoothstep',
    animated: false,
    style: { strokeWidth: 1.5 },
  })), [graph.edges]);

  return (
    <div className="h-[430px] min-h-[360px] w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm" aria-label="Visual workflow canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(null)}
        nodesConnectable={false}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 0.95 }}
        minZoom={0.4}
        maxZoom={1.4}
        aria-label="Automation workflow"
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
