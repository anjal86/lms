import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptIntegrationSecret } from '@/lib/integrations/secrets';
import { aiProviderPreset, type AiApiStyle, type AiProviderKind } from './provider-catalog';

const DecisionSchema = z.object({
  action: z.enum(['reply', 'handoff', 'noop']),
  reply: z.string().trim().max(4000).nullable().default(null),
  confidence: z.number().min(0).max(1),
  intent: z.string().trim().max(120).default('unknown'),
  handoff_reason: z.string().trim().max(500).nullable().default(null),
  suggested_lifecycle: z.string().trim().max(80).nullable().default(null),
});

export type AiAgentDecision = z.infer<typeof DecisionSchema>;

export type AiAgentConfig = {
  name: string;
  model: string;
  instructions: string;
  tone: string;
  languages: string[];
  temperature: number;
  providerConfigId?: string | null;
};

export type AiConversationContext = {
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

type ProviderRuntime = {
  id: string | null;
  provider: AiProviderKind;
  apiStyle: AiApiStyle;
  baseUrl: string;
  apiKey: string | null;
  label: string;
};

function transcript(context: AiConversationContext) {
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

function systemPrompt(agent: AiAgentConfig) {
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

function userPrompt(context: AiConversationContext) {
  return [
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
  ].join('\n');
}

function textFromOpenAiContent(value: unknown) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((part) => {
    if (!part || typeof part !== 'object') return '';
    const row = part as Record<string, unknown>;
    return typeof row.text === 'string' ? row.text : '';
  }).filter(Boolean).join('\n');
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function privateIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a === 0;
}

function privateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:');
}

async function validateCustomBaseUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Custom AI provider base URL is invalid.'); }
  if (url.username || url.password || url.hash) throw new Error('Custom AI provider URL cannot contain credentials or fragments.');

  const allowPrivate = process.env.AI_ALLOW_PRIVATE_PROVIDER_NETWORKS?.trim().toLowerCase() === 'true';
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) {
    throw new Error('Custom AI provider must use HTTPS. Set AI_ALLOW_PRIVATE_PROVIDER_NETWORKS=true only for trusted local/self-hosted endpoints.');
  }

  if (!allowPrivate) {
    const directType = isIP(url.hostname);
    const addresses = directType
      ? [{ address: url.hostname, family: directType }]
      : await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length) throw new Error('Custom AI provider hostname could not be resolved.');
    for (const entry of addresses) {
      if ((entry.family === 4 && privateIpv4(entry.address)) || (entry.family === 6 && privateIpv6(entry.address))) {
        throw new Error('Custom AI provider resolves to a private network address. Enable private provider networks only for a trusted local deployment.');
      }
    }
  }
  return trimSlash(url.toString());
}

export async function resolveAiProviderRuntime(workspaceId: string, providerConfigId?: string | null): Promise<ProviderRuntime> {
  if (!providerConfigId) {
    const apiKey = process.env.MISTRAL_API_KEY?.trim() || null;
    if (!apiKey) throw new Error('This legacy agent uses the server Mistral provider, but MISTRAL_API_KEY is not configured. Select a workspace BYOK provider or configure the legacy key.');
    return {
      id: null,
      provider: 'mistral',
      apiStyle: 'openai_chat',
      baseUrl: 'https://api.mistral.ai/v1',
      apiKey,
      label: 'Server Mistral',
    };
  }

  const admin = createSupabaseAdminClient();
  const [{ data: config, error }, { data: secret }] = await Promise.all([
    admin.from('ai_provider_configs')
      .select('id,workspace_id,name,provider,api_style,base_url,is_active')
      .eq('workspace_id', workspaceId)
      .eq('id', providerConfigId)
      .maybeSingle(),
    admin.from('ai_provider_secrets')
      .select('encrypted_api_key')
      .eq('workspace_id', workspaceId)
      .eq('provider_config_id', providerConfigId)
      .maybeSingle(),
  ]);
  if (error || !config) throw new Error('AI provider connection was not found in this workspace.');
  if (!config.is_active) throw new Error('AI provider connection is disabled.');

  const preset = aiProviderPreset(config.provider);
  if (!preset) throw new Error(`Unsupported AI provider: ${config.provider}`);
  const baseUrl = config.provider === 'custom_openai'
    ? await validateCustomBaseUrl(config.base_url)
    : preset.defaultBaseUrl;
  const apiKey = decryptIntegrationSecret(secret?.encrypted_api_key) || null;
  if (!apiKey && config.provider !== 'custom_openai') throw new Error(`${preset.label} API key is not configured for this workspace.`);

  return {
    id: config.id,
    provider: config.provider as AiProviderKind,
    apiStyle: config.api_style as AiApiStyle,
    baseUrl: trimSlash(baseUrl),
    apiKey,
    label: config.name || preset.label,
  };
}

async function requestOpenAiCompatible(runtime: ProviderRuntime, agent: AiAgentConfig, system: string, user: string) {
  const url = `${runtime.baseUrl}/chat/completions`;
  const basePayload: Record<string, unknown> = {
    model: agent.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (runtime.apiKey) headers.Authorization = `Bearer ${runtime.apiKey}`;

  const run = async (includeTemperature: boolean) => fetch(url, {
    method: 'POST',
    headers,
    redirect: 'error',
    body: JSON.stringify(includeTemperature
      ? { ...basePayload, temperature: Math.min(1.5, Math.max(0, Number(agent.temperature) || 0.3)) }
      : basePayload),
    signal: AbortSignal.timeout(35_000),
  });

  let response = await run(true);
  if (response.status === 400) response = await run(false);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${runtime.label} returned ${response.status}${detail ? `: ${detail.slice(0, 400)}` : ''}`);
  }
  const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  return textFromOpenAiContent(data.choices?.[0]?.message?.content).trim();
}

async function requestAnthropic(runtime: ProviderRuntime, agent: AiAgentConfig, system: string, user: string) {
  if (!runtime.apiKey) throw new Error('Anthropic API key is required.');
  const response = await fetch(`${runtime.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': runtime.apiKey,
      'anthropic-version': '2023-06-01',
    },
    redirect: 'error',
    body: JSON.stringify({
      model: agent.model,
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${runtime.label} returned ${response.status}${detail ? `: ${detail.slice(0, 400)}` : ''}`);
  }
  const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  return (data.content || []).filter((part) => part.type === 'text').map((part) => part.text || '').join('\n').trim();
}

async function requestGoogle(runtime: ProviderRuntime, agent: AiAgentConfig, system: string, user: string) {
  if (!runtime.apiKey) throw new Error('Google Gemini API key is required.');
  const model = agent.model.replace(/^models\//, '');
  const url = `${runtime.baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': runtime.apiKey,
    },
    redirect: 'error',
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: Math.min(1.5, Math.max(0, Number(agent.temperature) || 0.3)),
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${runtime.label} returned ${response.status}${detail ? `: ${detail.slice(0, 400)}` : ''}`);
  }
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('\n').trim();
}

export async function decideWithAiProvider(
  workspaceId: string,
  agent: AiAgentConfig,
  context: AiConversationContext,
): Promise<AiAgentDecision> {
  if (!agent.model.trim()) throw new Error('AI model ID is required.');
  const runtime = await resolveAiProviderRuntime(workspaceId, agent.providerConfigId);
  const system = systemPrompt(agent);
  const user = userPrompt(context);

  const raw = runtime.apiStyle === 'anthropic_messages'
    ? await requestAnthropic(runtime, agent, system, user)
    : runtime.apiStyle === 'google_generate_content'
      ? await requestGoogle(runtime, agent, system, user)
      : await requestOpenAiCompatible(runtime, agent, system, user);

  if (!raw) throw new Error(`${runtime.label} returned an empty response.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
  } catch {
    throw new Error(`${runtime.label} returned invalid JSON.`);
  }

  const decision = DecisionSchema.safeParse(parsed);
  if (!decision.success) throw new Error(`${runtime.label} decision failed validation: ${decision.error.issues[0]?.message || 'invalid response'}`);
  if (decision.data.action === 'reply' && !decision.data.reply) throw new Error(`${runtime.label} selected reply without reply text.`);
  return decision.data;
}
