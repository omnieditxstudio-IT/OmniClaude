import { ProviderAdapter, ProviderAdapterContext, TranslatedRequest, TranslatedResponse, StreamChunk, ProviderCapabilities } from './base';
import { AnthropicMessagesRequest, AnthropicMessagesResponse, AnthropicContentBlock, AnthropicStreamEvent } from '@gateway/shared';

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  readonly defaultModel: string;

  constructor(
    name: string,
    defaultModel: string,
    capabilities: Partial<ProviderCapabilities> = {}
  ) {
    this.name = name;
    this.defaultModel = defaultModel;
    this.capabilities = {
      supportsToolCalling: true,
      supportsReasoning: false,
      supportsImages: true,
      supportsStreaming: true,
      supportsSystemPrompt: true,
      maxContextLength: 32000,
      defaultModel,
      ...capabilities,
    };
  }

  translateRequest(request: AnthropicMessagesRequest, context: ProviderAdapterContext): TranslatedRequest {
    const modelConfig = context.config;
    const upstreamModelId = modelConfig.upstreamModelId || context.modelId;
    
    const messages: any[] = [];
    
    // System prompt
    if (request.system) {
      const systemText = typeof request.system === 'string' 
        ? request.system 
        : request.system.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      messages.push({ role: 'system', content: systemText });
    }

    // Messages
    for (const msg of request.messages) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: this.convertContent(msg.content) });
      } else if (msg.role === 'assistant') {
        const assistantMsg: any = { role: 'assistant' };
        if (msg.content) {
          assistantMsg.content = this.convertContent(msg.content);
        }
        if (msg.tool_uses) {
          assistantMsg.tool_calls = msg.tool_uses.map((tool: any) => ({
            id: tool.id,
            type: 'function',
            function: {
              name: tool.name,
              arguments: typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input || {}),
            },
          }));
        }
        messages.push(assistantMsg);
      } else if (msg.role === 'tool_result') {
        messages.push({
          role: 'tool',
          tool_call_id: msg.tool_use_id,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    }

    const body: any = {
      model: upstreamModelId,
      messages,
      stream: request.stream ?? true,
    };

    if (request.max_tokens) {
      body.max_tokens = request.max_tokens;
    } else if (modelConfig.maxOutputTokens) {
      body.max_tokens = modelConfig.maxOutputTokens;
    }

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.top_p !== undefined) body.top_p = request.top_p;
    if (request.stop_sequences) body.stop = request.stop_sequences;

    if (request.tools && this.capabilities.supportsToolCalling) {
      body.tools = request.tools.map((tool: any) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      }));
    }

    if (request.tool_choice) {
      body.tool_choice = typeof request.tool_choice === 'string' ? request.tool_choice : 
        { type: 'function', function: { name: request.tool_choice.name } };
    }

    if (modelConfig.reasoning) {
      body.reasoning = modelConfig.reasoning;
    }

    if (modelConfig.extraParams) {
      Object.assign(body, modelConfig.extraParams);
    }

    return {
      url: this.buildUrl(context, '/chat/completions'),
      headers: this.buildHeaders(context, { 'Content-Type': 'application/json' }),
      body,
      method: 'POST',
    };
  }

  translateResponse(response: any, context: ProviderAdapterContext): AnthropicMessagesResponse {
    const choice = response.choices?.[0];
    if (!choice) throw new Error('No response from provider');

    const message = choice.message;
    const content: AnthropicContentBlock[] = [];
    let stopReason: 'end_turn' | 'max_tokens' | 'tool_use' = 'end_turn';

    if (message.content) {
      content.push({
        type: 'text',
        text: typeof message.content === 'string' ? message.content : message.content.text || '',
      });
    }

    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      stopReason = 'tool_use';
      for (const toolCall of message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: this.parseToolInput(toolCall.function.arguments),
        });
      }
    }

    return {
      id: response.id || `response-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content,
      model: context.modelId,
      stop_reason: stopReason,
      stop_sequence: choice.finish_reason === 'stop' ? null : choice.finish_reason,
      usage: {
        input_tokens: response.usage?.prompt_tokens || response.usage?.input_tokens || 0,
        output_tokens: response.usage?.completion_tokens || response.usage?.output_tokens || 0,
      },
    };
  }

  translateStream(chunk: any, context: ProviderAdapterContext): AnthropicStreamEvent | null {
    if (!chunk.choices || !chunk.choices[0]) return null;

    const delta = chunk.choices[0].delta;
    const finishReason = chunk.choices[0].finish_reason;

    if (finishReason) {
      return { type: 'message_stop' };
    }

    if (delta.content) {
      return {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: delta.content },
      };
    }

    if (delta.tool_calls && delta.tool_calls[0]) {
      const toolCall = delta.tool_calls[0];
      return {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'tool_use_delta',
          id: toolCall.id || `tool_${Date.now()}`,
          name: toolCall.function?.name || '',
          input: toolCall.function?.arguments || '',
        },
      };
    }

    return null;
  }

  supportsModel(modelId: string): boolean {
    return true;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  normalizeModelId(modelId: string): string {
    return modelId;
  }

  buildUrl(context: ProviderAdapterContext, path = '/chat/completions'): string {
    const baseUrl = context.baseUrl.replace(/\/$/, '');
    return `${baseUrl}${path}`;
  }

  buildHeaders(context: ProviderAdapterContext, extraHeaders: Record<string, string> = {}): Record<string, string> {
    return {
      'Authorization': `Bearer ${context.apiKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
  }

  private convertContent(content: string | any[]): string | any[] {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map((block: any) => {
        if (block.type === 'text') return block.text;
        if (block.type === 'image_url') {
          return { type: 'image_url', image_url: { url: block.source?.data || block.url } };
        }
        return block;
      });
    }
    return content;
  }

  private parseToolInput(args: string): any {
    try {
      return JSON.parse(args);
    } catch {
      return args;
    }
  }
}

// Pre-built adapters for common OpenAI-compatible providers
export const deepSeekAdapter = new OpenAICompatibleAdapter('deepseek', 'deepseek-chat');
export const groqAdapter = new OpenAICompatibleAdapter('groq', 'llama-3.3-70b-versatile');
export const fireworksAdapter = new OpenAICompatibleAdapter('fireworks', 'accounts/fireworks/models/llama-v3-70b-instruct');
export const togetherAdapter = new OpenAICompatibleAdapter('together', 'meta-llama/Llama-3.3-70B-Instruct-Turbo');
export const mistralAdapter = new OpenAICompatibleAdapter('mistral', 'mistral-large-latest', { supportsReasoning: true });
export const vllmAdapter = new OpenAICompatibleAdapter('vllm', 'default');
export const lmstudioAdapter = new OpenAICompatibleAdapter('lmstudio', 'default');
export const zhipuAdapter = new OpenAICompatibleAdapter('zhipu', 'glm-4-plus');
export const cohereAdapter = new OpenAICompatibleAdapter('cohere', 'command-r-plus');
