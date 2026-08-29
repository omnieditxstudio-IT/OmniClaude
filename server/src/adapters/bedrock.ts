import { ProviderAdapter, ProviderAdapterContext, TranslatedRequest, TranslatedResponse, StreamChunk, ProviderCapabilities } from './base';
import { AnthropicMessagesRequest, AnthropicMessagesResponse, AnthropicContentBlock, AnthropicStreamEvent } from '@gateway/shared';

export class BedrockAdapter implements ProviderAdapter {
  readonly name = 'bedrock';
  readonly capabilities: ProviderCapabilities = {
    supportsToolCalling: true,
    supportsReasoning: true,
    supportsImages: true,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    maxContextLength: 200000,
    defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  };

  translateRequest(request: AnthropicMessagesRequest, context: ProviderAdapterContext): TranslatedRequest {
    const modelConfig = context.config;
    const upstreamModelId = modelConfig.upstreamModelId || context.modelId;
    
    // Build Bedrock-native request format
    const systemPrompt = this.extractSystemPrompt(request.system);
    const messages = this.convertMessages(request.messages);
    
    const body: any = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: request.max_tokens || modelConfig.maxOutputTokens || 4096,
      messages,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.top_p !== undefined) body.top_p = request.top_p;
    if (request.stop_sequences) body.stop_sequences = request.stop_sequences;

    if (request.tools) {
      body.tools = request.tools;
    }

    if (request.tool_choice) {
      body.tool_choice = request.tool_choice;
    }

    return {
      url: this.buildUrl(context, upstreamModelId),
      headers: this.buildHeaders(context, { 'Content-Type': 'application/json' }),
      body,
      method: 'POST',
    };
  }

  translateResponse(response: any, context: ProviderAdapterContext): AnthropicMessagesResponse {
    return {
      id: response.message?.id || `response-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: response.message?.content || [],
      model: context.modelId,
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
            model: context.modelId,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
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
        return { type: 'message_stop' };
      
      default:
        return null;
    }
  }

  supportsModel(modelId: string): boolean {
    return modelId.includes('anthropic.claude') || 
           modelId.includes('amazon.titan') ||
           modelId.includes('ai21') ||
           modelId.includes('cohere');
  }

  getDefaultModel(): string {
    return this.capabilities.defaultModel || 'anthropic.claude-3-5-sonnet-20240620-v1:0';
  }

  normalizeModelId(modelId: string): string {
    return modelId.replace(/^bedrock\//, '');
  }

  buildUrl(context: ProviderAdapterContext, modelId: string): string {
    // AWS Bedrock uses IAM auth, not API keys in URL
    const region = context.config.region || 'us-east-1';
    return `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/invoke-with-response-stream`;
  }

  buildHeaders(context: ProviderAdapterContext, extraHeaders: Record<string, string> = {}): Record<string, string> {
    // AWS SigV4 signing would happen at the HTTP client level
    return {
      'Content-Type': 'application/json',
      'X-Amz-Target': 'AWSShineFrontendService_20250501.InvokeModelWithResponseStream',
      ...extraHeaders,
    };
  }

  private extractSystemPrompt(system: string | any[] | undefined): string {
    if (!system) return '';
    if (typeof system === 'string') return system;
    if (Array.isArray(system)) {
      return system.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    }
    return '';
  }

  private convertMessages(messages: any[]): any[] {
    return messages.map(msg => {
      if (msg.role === 'user') {
        const content = typeof msg.content === 'string' ? msg.content : 
          msg.content?.map((b: any) => b.text || '').join('\n') || '';
        return { role: 'user', content };
      }
      
      if (msg.role === 'assistant') {
        const result: any = { role: 'assistant' };
        
        if (msg.content) {
          result.content = typeof msg.content === 'string' ? msg.content : 
            msg.content?.map((b: any) => b.text || '').join('\n') || '';
        }
        
        if (msg.tool_uses) {
          result.tool_uses = msg.tool_uses.map((tool: any) => ({
            id: tool.id,
            type: 'tool_use',
            name: tool.name,
            input: typeof tool.input === 'string' ? JSON.parse(tool.input) : tool.input,
          }));
        }
        
        return result;
      }
      
      if (msg.role === 'tool_result') {
        return {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.tool_use_id,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          }],
        };
      }
      
      return msg;
    });
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

export const bedrockAdapter = new BedrockAdapter();
