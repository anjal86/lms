export type AiProviderKind =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'openrouter'
  | 'groq'
  | 'deepseek'
  | 'xai'
  | 'together'
  | 'fireworks'
  | 'custom_openai';

export type AiApiStyle = 'openai_chat' | 'anthropic_messages' | 'google_generate_content';

export type AiProviderPreset = {
  id: AiProviderKind;
  label: string;
  apiStyle: AiApiStyle;
  defaultBaseUrl: string;
  description: string;
  modelPlaceholder: string;
};

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', apiStyle: 'openai_chat', defaultBaseUrl: 'https://api.openai.com/v1', description: 'OpenAI API using the chat-completions compatible interface.', modelPlaceholder: 'gpt-5' },
  { id: 'anthropic', label: 'Anthropic', apiStyle: 'anthropic_messages', defaultBaseUrl: 'https://api.anthropic.com/v1', description: 'Claude models through the native Anthropic Messages API.', modelPlaceholder: 'claude-sonnet-5' },
  { id: 'google', label: 'Google Gemini', apiStyle: 'google_generate_content', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', description: 'Gemini models through Google AI generateContent.', modelPlaceholder: 'gemini-3.5-flash' },
  { id: 'mistral', label: 'Mistral AI', apiStyle: 'openai_chat', defaultBaseUrl: 'https://api.mistral.ai/v1', description: 'Mistral models using its OpenAI-compatible chat API.', modelPlaceholder: 'mistral-medium-latest' },
  { id: 'openrouter', label: 'OpenRouter', apiStyle: 'openai_chat', defaultBaseUrl: 'https://openrouter.ai/api/v1', description: 'Use one OpenRouter key across many hosted model providers.', modelPlaceholder: 'openai/gpt-5' },
  { id: 'groq', label: 'Groq', apiStyle: 'openai_chat', defaultBaseUrl: 'https://api.groq.com/openai/v1', description: 'Groq-hosted models through an OpenAI-compatible endpoint.', modelPlaceholder: 'llama model id' },
  { id: 'deepseek', label: 'DeepSeek', apiStyle: 'openai_chat', defaultBaseUrl: 'https://api.deepseek.com', description: 'DeepSeek API through its OpenAI-compatible interface.', modelPlaceholder: 'deepseek-chat' },
  { id: 'xai', label: 'xAI', apiStyle: 'openai_chat', defaultBaseUrl: 'https://api.x.ai/v1', description: 'Grok models through xAI’s OpenAI-compatible endpoint.', modelPlaceholder: 'grok model id' },
  { id: 'together', label: 'Together AI', apiStyle: 'openai_chat', defaultBaseUrl: 'https://api.together.xyz/v1', description: 'Together-hosted open and proprietary models.', modelPlaceholder: 'provider/model-id' },
  { id: 'fireworks', label: 'Fireworks AI', apiStyle: 'openai_chat', defaultBaseUrl: 'https://api.fireworks.ai/inference/v1', description: 'Fireworks-hosted models using an OpenAI-compatible API.', modelPlaceholder: 'accounts/fireworks/models/...' },
  { id: 'custom_openai', label: 'Custom / OpenAI-compatible', apiStyle: 'openai_chat', defaultBaseUrl: '', description: 'Any OpenAI-compatible gateway such as vLLM, Ollama, LiteLLM, LocalAI, or your own proxy.', modelPlaceholder: 'your-model-id' },
];

export function aiProviderPreset(id: string | null | undefined) {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === id) || null;
}
