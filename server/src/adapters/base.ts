import {
  AnthropicMessagesRequest,
  AnthropicMessagesResponse,
  AnthropicContentBlock,
  AnthropicStreamEvent,
} from '@gateway/shared';

export interface ProviderAdapterContext {
  provider: string;
  modelId: string;
  apiKey: string;
  baseUrl: string;
  config: Record<string, any>;
}

export interface TranslatedRequest {
  url: string;
  headers: Record<string, string>;
  body: any;
  method: string;
}

export interface TranslatedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
}

export interface StreamChunk {
  data: any;
  isDone: boolean;
}

export interface ProviderCapabilities {
  supportsToolCalling: boolean;
  supportsReasoning: boolean;
  supportsImages: boolean;
  supportsStreaming: boolean;
  supportsSystemPrompt: boolean;
  maxContextLength?: number;
  defaultModel?: string;
}

export interface ProviderAdapter {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  translateRequest(request: AnthropicMessagesRequest, context: ProviderAdapterContext): TranslatedRequest;
  translateResponse(response: any, context: ProviderAdapterContext): AnthropicMessagesResponse;
  translateStream(chunk: any, context: ProviderAdapterContext): AnthropicStreamEvent | null;
  
  supportsModel(modelId: string): boolean;
  getDefaultModel(): string;
  normalizeModelId(modelId: string): string;
  
  buildUrl(context: ProviderAdapterContext, path?: string): string;
  buildHeaders(context: ProviderAdapterContext, extraHeaders?: Record<string, string>): Record<string, string>;
}

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  baseUrl: string;
  models: Record<string, ProviderModelConfig>;
  defaultHeaders?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

export type ProviderType = 
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'vllm'
  | 'lmstudio'
  | 'together'
  | 'groq'
  | 'fireworks'
  | 'mistral'
  | 'deepseek'
  | 'zhipu'
  | 'cohere'
  | 'azure'
  | 'bedrock'
  | 'custom';

export interface ProviderModelConfig {
  upstreamModelId?: string;
  name?: string;
  maxOutputTokens?: number;
  supportsToolCalling?: boolean;
  supportsReasoning?: boolean;
  toolMapping?: Record<string, string>;
  systemReplacements?: Record<string, string>;
  reasoning?: {
    effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    summary?: 'auto' | 'none' | 'concise' | 'detailed';
  };
  imageMode?: 'input_image' | 'save_and_ref' | 'strip';
  imageDir?: string;
  extraParams?: Record<string, any>;
}
