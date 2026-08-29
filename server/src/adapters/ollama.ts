import { ProviderAdapter, ProviderAdapterContext, TranslatedRequest, TranslatedResponse, StreamChunk, ProviderCapabilities } from './base';
import { AnthropicMessagesRequest, AnthropicMessagesResponse, AnthropicContentBlock, AnthropicStreamEvent } from '@gateway/shared';

export class OllamaAdapter implements ProviderAdapter {
  readonly name = 'ollama';
  readonly capabilities: ProviderCapabilities = {
    supportsToolCalling: true,
    supportsReasoning: true,
    supportsImages: true,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    maxContextLength: 32000,
    defaultModel: 'llama3.2',
  };

  translateRequest(request: AnthropicMessagesRequest, context: ProviderAdapterContext): TranslatedRequest {
    const modelConfig = context.config;
    const upstreamModelId = modelConfig.upstreamModelId || context.modelId;
    
    const systemPrompt = this.extractSystemPrompt(request.system);
    const messages = this.convertMessages(request.messages, modelConfig.toolMapping);

    const body: any = {
      model: upstreamModelId,
      messages,
      stream: request.stream ?? true,
      options: {
        num_predict: request.max_tokens || modelConfig.maxOutputTokens || 4096,
        temperature: request.temperature ?? 0.7,
        top_p: request.top_p ?? 0.9,
      },
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    // Ollama supports native tool calling via tools parameter
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

    // Apply format for ReAct if needed
    if (modelConfig.useReact) {
      body.format = 'react';
    }

    // Apply extra params
    if (modelConfig.extraParams) {
      Object.assign(body, modelConfig.extraParams);
    }

    return {
      url: this.buildUrl(context, '/api/chat'),
      headers: this.buildHeaders(context, { 'Content-Type': 'application/json' }),
      body,
      method: 'POST',
    };
  }

  translateResponse(response: any, context: ProviderAdapterContext): AnthropicMessagesResponse {
    const message = response.message;
    if (!message) {
      throw new Error('No response from Ollama');
    }

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
          id: toolCall.id || `tool_${Date.now()}`,
          name: toolCall.function?.name || toolCall.name,
          input: this.parseToolInput(toolCall.function?.arguments || toolCall.arguments || '{}'),
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
      stop_sequence: response.done ? null : undefined,
      usage: {
        input_tokens: response.prompt_eval_count || 0,
        output_tokens: response.eval_count || 0,
      },
    };
  }

  translateStream(chunk: any, context: ProviderAdapterContext): AnthropicStreamEvent | null {
    if (!chunk.message) return null;

    if (chunk.done) {
      return {
        type: 'message_stop',
      };
    }

    const message = chunk.message;
    
    if (message.content) {
      return {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: message.content,
        },
      };
    }

    return null;
  }

  supportsModel(modelId: string): boolean {
    return true; // Ollama supports any model
  }

  getDefaultModel(): string {
    return this.capabilities.defaultModel || 'llama3.2';
  }

  normalizeModelId(modelId: string): string {
    return modelId.replace(/^ollama\//, '').replace(/^llama/, 'llama');
  }

  buildUrl(context: ProviderAdapterContext, path = '/api/chat'): string {
    const baseUrl = context.baseUrl.replace(/\/$/, '');
    return `${baseUrl}${path}`;
  }

  buildHeaders(context: ProviderAdapterContext, extraHeaders: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
  }

  private extractSystemPrompt(system: string | any[] | undefined): string {
    if (!system) return '';
    if (typeof system === 'string') return system;
    if (Array.isArray(system)) {
      return system
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n');
    }
    return '';
  }

  private convertMessages(messages: any[], toolMapping?: Record<string, string>): any[] {
    return messages.map(msg => {
      if (msg.role === 'user') {
        return {
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : 
            msg.content?.map((b: any) => b.text || '').join('\n') || '',
        };
      }
      
      if (msg.role === 'assistant') {
        const result: any = { role: 'assistant' };
        
        if (msg.content) {
          result.content = typeof msg.content === 'string' ? msg.content : 
            msg.content?.map((b: any) => b.text || '').join('\n') || '';
        }
        
        if (msg.tool_calls) {
          result.tool_calls = msg.tool_calls.map((tc: any) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: toolMapping?.[tc.function?.name] || tc.function?.name || tc.name,
              arguments: tc.function?.arguments || tc.arguments || '{}',
            },
          }));
        }
        
        return result;
      }
      
      if (msg.role === 'tool_result') {
        return {
          role: 'tool',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        };
      }
      
      return msg;
    });
  }

  private parseToolInput(args: string): any {
    try {
      return JSON.parse(args);
    } catch {
      return args;
    }
  }
}

export const ollamaAdapter = new OllamaAdapter();
