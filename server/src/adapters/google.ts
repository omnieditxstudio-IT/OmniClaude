import { ProviderAdapter, ProviderAdapterContext, TranslatedRequest, TranslatedResponse, StreamChunk, ProviderCapabilities } from './base';
import { AnthropicMessagesRequest, AnthropicMessagesResponse, AnthropicContentBlock, AnthropicStreamEvent } from '@gateway/shared';

export class GoogleAdapter implements ProviderAdapter {
  readonly name = 'google';
  readonly capabilities: ProviderCapabilities = {
    supportsToolCalling: true,
    supportsReasoning: true,
    supportsImages: true,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    maxContextLength: 1000000,
    defaultModel: 'gemini-2.5-pro',
  };

  translateRequest(request: AnthropicMessagesRequest, context: ProviderAdapterContext): TranslatedRequest {
    const modelConfig = context.config;
    const upstreamModelId = modelConfig.upstreamModelId || context.modelId;
    
    // Convert to Gemini format
    const systemInstruction = this.extractSystemInstruction(request.system);
    const contents = this.convertMessages(request.messages);
    const tools = this.convertTools(request.tools);

    const body: any = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        topP: request.top_p ?? 0.9,
        maxOutputTokens: request.max_tokens || modelConfig.maxOutputTokens || 8192,
        stopSequences: request.stop_sequences || [],
      },
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    if (tools.length > 0) {
      body.tools = tools;
    }

    // Apply reasoning config
    if (modelConfig.reasoning) {
      body.generationConfig.thinkingConfig = {
        thinkingBudget: modelConfig.reasoning.effort === 'high' ? 8192 : 
                       modelConfig.reasoning.effort === 'medium' ? 4096 : 2048,
      };
    }

    return {
      url: this.buildUrl(context, upstreamModelId),
      headers: this.buildHeaders(context, { 'Content-Type': 'application/json' }),
      body,
      method: 'POST',
    };
  }

  translateResponse(response: any, context: ProviderAdapterContext): AnthropicMessagesResponse {
    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw new Error('No response from Google');
    }

    const content = this.extractContent(candidate.content);
    
    return {
      id: response.id || `response-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content,
      model: context.modelId,
      stop_reason: this.mapFinishReason(candidate.finishReason),
      stop_sequence: candidate.finishReason === 'STOP' ? null : candidate.finishReason,
      usage: {
        input_tokens: response.usageMetadata?.promptTokenCount || 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }

  translateStream(chunk: any, context: ProviderAdapterContext): AnthropicStreamEvent | null {
    if (!chunk.candidates || !chunk.candidates[0]) {
      return null;
    }

    const candidate = chunk.candidates[0];
    
    if (candidate.finishReason) {
      return {
        type: 'message_stop',
      };
    }

    const content = candidate.content;
    if (!content || !content.parts) {
      return null;
    }

    const part = content.parts[0];
    if (part.text) {
      return {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: part.text,
        },
      };
    }

    if (part.functionCall) {
      return {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'tool_use_delta',
          id: part.functionCall.id || `tool_${Date.now()}`,
          name: part.functionCall.name,
          input: JSON.stringify(part.functionCall.args || {}),
        },
      };
    }

    return null;
  }

  supportsModel(modelId: string): boolean {
    return modelId.startsWith('gemini') || modelId.includes('google');
  }

  getDefaultModel(): string {
    return this.capabilities.defaultModel || 'gemini-2.5-pro';
  }

  normalizeModelId(modelId: string): string {
    return modelId.replace(/^google\//, '').replace(/^gemini-/, 'gemini-');
  }

  buildUrl(context: ProviderAdapterContext, modelId: string): string {
    const baseUrl = context.baseUrl.replace(/\/$/, '');
    return `${baseUrl}/models/${modelId}:generateContent?key=${context.apiKey}`;
  }

  buildHeaders(context: ProviderAdapterContext, extraHeaders: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
  }

  private extractSystemInstruction(system: string | any[] | undefined): string {
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

  private convertMessages(messages: any[]): any[] {
    return messages.map(msg => {
      if (msg.role === 'user') {
        const parts: any[] = [];
        if (typeof msg.content === 'string') {
          parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              parts.push({ text: block.text });
            } else if (block.type === 'image') {
              parts.push({
                inlineData: {
                  mimeType: block.source?.media_type || 'image/jpeg',
                  data: block.source?.data || block.url,
                },
              });
            }
          }
        }
        return { role: 'user', parts };
      }
      
      if (msg.role === 'assistant') {
        const parts: any[] = [];
        if (msg.content) {
          if (typeof msg.content === 'string') {
            parts.push({ text: msg.content });
          } else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'text') parts.push({ text: block.text });
              else if (block.type === 'tool_use') {
                parts.push({
                  functionCall: {
                    name: block.name,
                    args: typeof block.input === 'string' ? JSON.parse(block.input) : block.input,
                  },
                });
              }
            }
          }
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            parts.push({
              functionCall: {
                id: tc.id,
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments),
              },
            });
          }
        }
        return { role: 'model', parts };
      }
      
      if (msg.role === 'tool_result') {
        return {
          role: 'functionResponse',
          parts: [{
            functionResponse: {
              id: msg.tool_use_id,
              name: msg.tool_use_id,
              response: { result: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) },
            },
          }],
        };
      }
      
      return msg;
    });
  }

  private convertTools(tools: any[] | undefined): any[] {
    if (!tools) return [];
    
    return tools.map(tool => ({
      functionDeclarations: [{
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema || {},
      }],
    }));
  }

  private extractContent(content: any): AnthropicContentBlock[] {
    if (!content || !content.parts) {
      return [{ type: 'text', text: '' }];
    }

    const blocks: AnthropicContentBlock[] = [];
    
    for (const part of content.parts) {
      if (part.text) {
        blocks.push({ type: 'text', text: part.text });
      } else if (part.functionCall) {
        blocks.push({
          type: 'tool_use',
          id: part.functionCall.id || `tool_${Date.now()}`,
          name: part.functionCall.name,
          input: part.functionCall.args || {},
        });
      }
    }

    return blocks.length > 0 ? blocks : [{ type: 'text', text: '' }];
  }

  private mapFinishReason(finishReason: string): 'end_turn' | 'max_tokens' | 'tool_use' {
    switch (finishReason) {
      case 'STOP':
      case 'FINISH_REASON_UNSPECIFIED':
        return 'end_turn';
      case 'MAX_TOKENS':
        return 'max_tokens';
      case 'TOOL_USE':
        return 'tool_use';
      default:
        return 'end_turn';
    }
  }
}

export const googleAdapter = new GoogleAdapter();
