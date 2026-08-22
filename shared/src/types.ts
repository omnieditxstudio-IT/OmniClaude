// Shared types for the Model Translation Gateway

export type ProviderType = 
  | 'openrouter' 
  | 'vertex' 
  | 'ollama' 
  | 'custom' 
  | 'anthropic';

export type OAuthProvider = 'google' | 'github';

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  defaultProvider?: string;
  requestTimeout: number;
}

export interface User {
  _id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: OAuthProvider;
  providerId: string;
  createdAt: Date;
  updatedAt: Date;
  settings: UserSettings;
}

export interface ApiKey {
  _id: string;
  userId: string;
  name: string;
  provider: ProviderType;
  keyEncrypted: string;
  keyHash: string;
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
}

export interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
  currency: 'USD';
}

export interface EndpointModel {
  id: string;
  name: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
  pricing?: ModelPricing;
}

export interface EndpointConfig {
  timeout: number;
  maxRetries: number;
  headers?: Record<string, string>;
  ollamaOptions?: {
    numCtx?: number;
    temperature?: number;
  };
}

export interface Endpoint {
  _id: string;
  userId: string;
  name: string;
  provider: ProviderType;
  baseUrl: string;
  apiKeyId: string;
  models: EndpointModel[];
  config: EndpointConfig;
  isActive: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FallbackEntry {
  endpointId: string;
  providerModelId: string;
  priority: number;
}

export interface MappingOverride {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: ToolConfig[];
}

export interface ToolConfig {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ModelMappingEntry {
  claudeModelId: string;
  endpointId: string;
  providerModelId: string;
  overrides?: MappingOverride;
  fallbacks?: FallbackEntry[];
}

export interface ModelMapping {
  _id: string;
  userId: string;
  name: string;
  description?: string;
  mappings: ModelMappingEntry[];
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequestLog {
  _id: string;
  userId: string;
  mappingId?: string;
  claudeModelId: string;
  providerModelId: string;
  endpointId: string;
  requestType: 'messages' | 'completions' | 'embeddings';
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  statusCode: number;
  error?: string;
  createdAt: Date;
}

// API Request/Response Types

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface AnthropicContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | AnthropicContentBlock[];
  is_error?: boolean;
}

export interface AnthropicMessagesRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string | AnthropicContentBlock[];
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  tools?: AnthropicTool[];
  tool_choice?: AnthropicToolChoice;
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export type AnthropicToolChoice = 
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string }
  | { type: 'none' };

export interface AnthropicMessagesResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicStreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop';
  message?: AnthropicMessagesResponse;
  index?: number;
  delta?: {
    type: 'text_delta' | 'input_json_delta';
    text?: string;
    partial_json?: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// OpenAI-compatible types (for OpenRouter, custom endpoints)
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
  tools?: OpenAITool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  response_format?: { type: 'json_object' | 'text' };
  user?: string;
}

export interface OpenAIChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<OpenAIMessage>;
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }>;
}

// Ollama types
export interface OllamaOptions {
  num_ctx?: number;
  num_predict?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop?: string[];
  seed?: number;
}

export interface OllamaRequest {
  model: string;
  messages: OpenAIMessage[];
  options?: OllamaOptions;
  stream?: boolean;
  tools?: OpenAITool[];
}

// Vertex AI / Gemini types
export interface VertexContent {
  role: 'user' | 'model';
  parts: Array<{ text: string } | { functionCall: VertexFunctionCall } | { functionResponse: VertexFunctionResponse }>;
}

export interface VertexFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface VertexFunctionResponse {
  name: string;
  response: Record<string, unknown>;
}

export interface VertexRequest {
  contents: VertexContent[];
  systemInstruction?: { parts: Array<{ text: string }> };
  tools?: Array<{ functionDeclarations: VertexFunctionDeclaration[] }>;
  toolConfig?: { functionCallingConfig: { mode: 'AUTO' | 'ANY' | 'NONE' } };
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    stopSequences?: string[];
  };
}

export interface VertexFunctionDeclaration {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export interface VertexResponse {
  candidates: Array<{
    content: VertexContent;
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
    index: number;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

// Provider configuration
export interface ProviderConfig {
  type: ProviderType;
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  modelPrefix?: string;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  maxContextWindow: number;
}

export const PROVIDER_CONFIGS: Record<ProviderType, ProviderConfig> = {
  openrouter: {
    type: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://gateway.local',
      'X-Title': 'Model Translation Gateway',
    },
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    maxContextWindow: 128000,
  },
  vertex: {
    type: 'vertex',
    baseUrl: 'https://{region}-aiplatform.googleapis.com/v1/projects/{project}/locations/{region}/publishers/google/models',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    maxContextWindow: 1048576,
  },
  ollama: {
    type: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    maxContextWindow: 32768,
  },
  custom: {
    type: 'custom',
    baseUrl: '',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    maxContextWindow: 32768,
  },
  anthropic: {
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    maxContextWindow: 200000,
  },
};

// Zod schemas for validation
import { z } from 'zod';

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(['openrouter', 'vertex', 'ollama', 'custom', 'anthropic']),
  key: z.string().min(1),
});

export const CreateEndpointSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(['openrouter', 'vertex', 'ollama', 'custom', 'anthropic']),
  baseUrl: z.string().url(),
  apiKeyId: z.string(),
  config: z.object({
    timeout: z.number().min(1000).max(300000).default(60000),
    maxRetries: z.number().min(0).max(10).default(3),
    headers: z.record(z.string()).optional(),
    ollamaOptions: z.object({
      numCtx: z.number().optional(),
      temperature: z.number().optional(),
    }).optional(),
  }).default({}),
  priority: z.number().min(0).default(0),
});

export const CreateMappingSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  mappings: z.array(z.object({
    claudeModelId: z.string().min(1),
    endpointId: z.string(),
    providerModelId: z.string().min(1),
    overrides: z.object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).max(100000).optional(),
      systemPrompt: z.string().optional(),
      tools: z.array(z.object({
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          description: z.string(),
          parameters: z.record(z.unknown()),
        }),
      })).optional(),
    }).optional(),
    fallbacks: z.array(z.object({
      endpointId: z.string(),
      providerModelId: z.string(),
      priority: z.number().min(0),
    })).optional(),
  })).min(1),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
export type CreateEndpointInput = z.infer<typeof CreateEndpointSchema>;
export type CreateMappingInput = z.infer<typeof CreateMappingSchema>;