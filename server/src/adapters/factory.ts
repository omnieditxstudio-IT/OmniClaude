import { ProviderAdapter, ProviderAdapterContext, ProviderConfig, ProviderType } from './base';

// In-memory adapter registry
const adapters: Map<ProviderType, ProviderAdapter> = new Map();

export function registerAdapter(type: ProviderType, adapter: ProviderAdapter): void {
  adapters.set(type, adapter);
}

export function getAdapter(type: ProviderType): ProviderAdapter | undefined {
  return adapters.get(type);
}

export function createAdapterContext(config: ProviderConfig, modelId: string, apiKey?: string): ProviderAdapterContext {
  const adapter = adapters.get(config.type);
  const normalizedModelId = adapter ? adapter.normalizeModelId(modelId) : modelId;
  const modelConfig = config.models[normalizedModelId] || config.models['*'] || {};
  
  return {
    provider: config.type,
    modelId: normalizedModelId,
    apiKey: apiKey || config.apiKey,
    baseUrl: config.baseUrl,
    config: {
      ...config.defaultHeaders,
      ...modelConfig,
      timeout: config.timeout || 60000,
      retries: config.retries || 3,
    },
  };
}

export function resolveProviderType(baseUrl: string, headers: Record<string, string>): ProviderType {
  const url = baseUrl.toLowerCase();
  
  if (url.includes('openai.com') || url.includes('azure')) return 'openai';
  if (url.includes('anthropic.com')) return 'anthropic';
  if (url.includes('googleapis.com') || url.includes('generativelanguage')) return 'google';
  if (url.includes('ollama')) return 'ollama';
  if (url.includes('vllm')) return 'vllm';
  if (url.includes('lmstudio')) return 'lmstudio';
  if (url.includes('together.xyz')) return 'together';
  if (url.includes('groq.com')) return 'groq';
  if (url.includes('fireworks.ai')) return 'fireworks';
  if (url.includes('mistral.ai')) return 'mistral';
  if (url.includes('deepseek.com')) return 'deepseek';
  if (url.includes('zhipuai.net') || url.includes('open.bigmodel')) return 'zhipu';
  if (url.includes('cohere.com')) return 'cohere';
  if (url.includes('amazonaws.com') || url.includes('bedrock')) return 'bedrock';
  if (url.includes('openai.azure.com')) return 'azure';
  
  // Check headers for clues
  if (headers['anthropic-version']) return 'anthropic';
  if (headers['x-goog-api-key']) return 'google';
  
  return 'custom';
}

export function listSupportedProviders(): ProviderType[] {
  return Array.from(adapters.keys());
}

export function isProviderSupported(type: ProviderType): boolean {
  return adapters.has(type);
}
