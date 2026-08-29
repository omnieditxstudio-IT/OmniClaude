import { ProviderAdapter, ProviderAdapterContext, TranslatedRequest, TranslatedResponse, StreamChunk, ProviderCapabilities } from './base';
import { AnthropicMessagesRequest, AnthropicMessagesResponse, AnthropicContentBlock, AnthropicStreamEvent } from '@gateway/shared';

export class AnthropicAdapter implements ProviderAdapter {
  readonly name = 'anthropic';
  readonly capabilities: ProviderCapabilities = {
    supportsToolCalling: true,
    supportsReasoning: true,
    supportsImages: true,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    maxContextLength: 200000,
    defaultModel: 'claude-sonnet-4-20250514',
  };

  translateRequest(request: AnthropicMessagesRequest, context: ProviderAdapterContext): TranslatedRequest {
    const modelConfig = context.config;
    const upstreamModelId = modelConfig.upstreamModelId || context.modelId;
    
    // Anthropic passthrough - minimal transformation needed
    const body: any = {
      model: upstreamModelId,
      messages: request.messages,
      stream: request.stream ?? true,
      max_tokens: request.max_tokens || modelConfig.maxOutputTokens || 4096,
    };

    if (request.system) {
      body.system = request.system;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      body.top_p = request.top_p;
    }
    if (request.stop_sequences) {
      body.stop_sequences = request.stop_sequences;
    }
    if (request.tools) {
      body.tools = request.tools;
    }
    if (request.tool_choice) {
      body.tool_choice = request.tool_choice;
    }

    // Apply system replacements
    if (modelConfig.systemReplacements && body.system) {
      let systemContent = typeof body.system === 'string' ? body.system : 
        body.system.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      for (const [target, replacement] of Object.entries(modelConfig.systemReplacements)) {
        systemContent = systemContent.replace(target, replacement);
      }
      body.system = systemContent;
    }

    return {
      url: this.buildUrl(context, '/messages'),
      headers: this.buildHeaders(context, {
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      }),
      body,
      method: 'POST',
    };
  }

  translateResponse(response: any, context: ProviderAdapterContext): AnthropicMessagesResponse {
    return {
      id: response.id || `response-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: response.content || [],
      model: response.model || context.modelId,
      stop_reason: this.mapStopReason(response.stop_reason),
      stop_sequence: response.stop_sequence,
      usage: {
        input_tokens: response.usage?.input_tokens || 0,
        output_tokens: response.usage?.output_tokens || 0,
      },
    };
  }

  translateStream(chunk: any, context: ProviderAdapterContext): AnthropicStreamEvent | null {
    if (!chunk.type) return null;

    switch (chunk.type) {
      case 'message_start':
        return {
          type: 'message_start',
          message: {
            id: chunk.message.id,
            type: 'message',
            role: 'assistant',
            content: [],
            model: chunk.message.model,
            stop_reason: null,
            stop_sequence: null,
            usage: {
              input_tokens: chunk.message.usage?.input_tokens || 0,
              output_tokens: chunk.message.usage?.output_tokens || 0,
            },
          },
        };
      
      case 'content_block_start':
        return {
          type: 'content_block_start',
          index: chunk.index,
          content_block: chunk.content_block,
        };
      
      case 'content_block_delta':
        return {
          type: 'content_block_delta',
          index: chunk.index,
          delta: chunk.delta,
        };
      
      case 'content_block_stop':
        return {
          type: 'content_block_stop',
          index: chunk.index,
        };
      
      case 'message_delta':
        return {
          type: 'message_delta',
          delta: chunk.delta,
          usage: chunk.usage || { output_tokens: 0 },
        };
      
      case 'message_stop':
        return {
          type: 'message_stop',
        };
      
      case 'ping':
        return null;
      
      default:
        return null;
    }
  }

  supportsModel(modelId: string): boolean {
    return modelId.startsWith('claude') || modelId.includes('anthropic');
  }

  getDefaultModel(): string {
    return this.capabilities.defaultModel || 'claude-sonnet-4-20250514';
  }

  normalizeModelId(modelId: string): string {
    return modelId.replace(/^anthropic\//, '');
  }

  buildUrl(context: ProviderAdapterContext, path = '/messages'): string {
    const baseUrl = context.baseUrl.replace(/\/$/, '');
    return `${baseUrl}${path}`;
  }

  buildHeaders(context: ProviderAdapterContext, extraHeaders: Record<string, string> = {}): Record<string, string> {
    return {
      'x-api-key': context.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
  }

  private mapStopReason(stopReason: string): 'end_turn' | 'max_tokens' | 'tool_use' {
    switch (stopReason) {
      case 'end_turn':
        return 'end_turn';
      case 'max_tokens':
        return 'max_tokens';
      case 'tool_use':
        return 'tool_use';
      default:
        return 'end_turn';
    }
  }
}

export const anthropicAdapter = new AnthropicAdapter();
