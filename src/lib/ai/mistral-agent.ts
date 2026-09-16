import 'server-only';

import { z } from 'zod';

const DecisionSchema = z.object({
  action: z.enum(['reply', 'handoff', 'noop']),
  reply: z.string().trim().max(4000).nullable().default(null),
  confidence: z.number().min(0).max(1),
  intent: z.string().trim().max(120).default('unknown'),
  handoff_reason: z.string().trim().max(500).nullable().default(null),
  suggested_lifecycle: z.string().trim().max(80).nullable().default(null),
});

export type AiAgentDecision = z.infer<typeof DecisionSchema>;

export type MistralAgentConfig = {
  name: string;
  model: string;
  instructions: string;
  tone: string;
  languages: string[];
  temperature: number;
};

export type MistralConversationContext = {
  workspaceName: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  lifecycle?: string | null;
  opportunity?: Record<string, unknown> | null;
  conversation: Array<{
    direction: 'inbound' | 'outbound' | 'internal';
    body: string | null;
    sentAt: string;
    aiGenerated?: boolean;
  }>;
};

function textContent(value: unknown) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((chunk) => {
      if (!chunk || typeof chunk !== 'object') return '';
      const record = chunk as Record<string, unknown>;
      return record.type === 'text' && typeof record.text === 'string' ? record.text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function transcript(context: MistralConversationContext) {
  return context.conversation
    .slice(-40)
    .map((message) => {
      const author = message.direction === 'inbound'
        ? 'Customer'
        : message.direction === 'internal'
          ? 'Internal note'
          : message.aiGenerated
            ? 'AI agent'
            : 'Human agent';
      return `${author}: ${message.body?.trim() || '[attachment]'}`;
    })
    .join('\n');
}

function systemPrompt(agent: MistralAgentConfig) {
  const languageInstruction = agent.languages.length && !agent.languages.includes('auto')
    ? `Prefer these languages when appropriate: ${agent.languages.join(', ')}.`
    : 'Reply in the customer\'s language when it is clear from the conversation.';

  return [
    `You are ${agent.name}, a customer-facing CRM agent.`,
    agent.instructions || 'Help the customer accurately and concisely using only the supplied CRM context.',
    `Tone: ${agent.tone || 'professional and friendly'}.`,
    languageInstruction,
    'Never invent prices, policies, availability, documents, promises, account status, or business facts that are not explicitly present in the supplied context.',
    'If the customer asks for a human, raises a complaint/payment dispute/refund/legal issue, or the available context is insufficient for a safe answer, choose handoff.',
    'If no response is needed, choose noop.',
    'Return only a JSON object with keys: action, reply, confidence, intent, handoff_reason, suggested_lifecycle.',
    'action must be reply, handoff, or noop. confidence must be between 0 and 1. reply must be null unless action is reply.',
  ].join('\n');
}

export async function decideWithMistral(agent: MistralAgentConfig, context: MistralConversationContext): Promise<AiAgentDecision> {
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) throw new Error('MISTRAL_API_KEY is not configured.');

  const payload = {
    model: agent.model || 'mistral-medium-latest',
    temperature: Math.min(1.5, Math.max(0, Number(agent.temperature) || 0.3)),
    safe_prompt: true,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt(agent) },
      {
        role: 'user',
        content: [
          '# CRM context',
          `Workspace: ${context.workspaceName}`,
          `Customer: ${context.customerName || 'Unknown'}`,
          `Phone: ${context.customerPhone || 'Unknown'}`,
          `Email: ${context.customerEmail || 'Unknown'}`,
          `Lifecycle: ${context.lifecycle || 'Unknown'}`,
          context.opportunity ? `Opportunity: ${JSON.stringify(context.opportunity)}` : 'Opportunity: none',
          '',
          '# Conversation',
          transcript(context),
          '',
          'Decide the safest next action now.',
        ].join('\n'),
      },
    ],
  };

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Mistral returned ${response.status}${detail ? `: ${detail.slice(0, 400)}` : ''}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const raw = textContent(data.choices?.[0]?.message?.content).trim();
  if (!raw) throw new Error('Mistral returned an empty response.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
  } catch {
    throw new Error('Mistral returned invalid JSON.');
  }

  const decision = DecisionSchema.safeParse(parsed);
  if (!decision.success) throw new Error(`Mistral decision failed validation: ${decision.error.issues[0]?.message || 'invalid response'}`);
  if (decision.data.action === 'reply' && !decision.data.reply) {
    throw new Error('Mistral selected reply without reply text.');
  }
  return decision.data;
}
