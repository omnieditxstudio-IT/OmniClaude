import axios, { AxiosRequestConfig } from 'axios';
import { 
  AnthropicMessagesRequest, 
  AnthropicMessagesResponse, 
  AnthropicStreamEvent,
} from '@gateway/shared';
import { PersonaEnforcer, getPersonaConfig } from './persona.service';
import { createAdapterContext, getAdapter, resolveProviderType } from '../adapters/factory';
import { ProviderConfig } from '../adapters/base';

export interface TranslationContext {
  claudeModelId: string;
  providerModelId: string;
  endpoint: {
    provider: string;
    baseUrl: string;
    config: any;
  };
  apiKey: string;
}

export interface ForwardResult {
  response: AnthropicMessagesResponse | AnthropicStreamEvent[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export class TranslationService {
  private personaEnforcer = new PersonaEnforcer();
  
  /**
   * Main entry point: translate Anthropic request and forward to provider
   * Uses universal adapter system for any provider
   */
  async translateAndForward(context: TranslationContext, request: AnthropicMessagesRequest): Promise<ForwardResult> {
    const providerType = resolveProviderType(context.endpoint.baseUrl, {});
    const adapter = getAdapter(providerType);
    
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${providerType}`);
    }

    const providerConfig: ProviderConfig = {
      type: providerType,
      apiKey: context.apiKey,
      baseUrl: context.endpoint.baseUrl,
      models: context.endpoint.config?.models || {},
      defaultHeaders: context.endpoint.config?.headers || {},
      timeout: 60000,
      retries: 3,
    };
    
    const adapterContext = createAdapterContext(providerConfig, context.providerModelId, context.apiKey);

    // Enforce persona on incoming request
    const enforcedRequest = this.personaEnforcer.enforceRequest(request, context.endpoint.provider, context.providerModelId);
    
    // Translate request to provider format
    const translatedRequest = adapter.translateRequest(enforcedRequest, adapterContext);
    
    // Forward to provider
    const axiosConfig: AxiosRequestConfig = {
      method: translatedRequest.method as any,
      url: translatedRequest.url,
      headers: translatedRequest.headers,
      data: translatedRequest.body,
      timeout: adapterContext.config.timeout || 60000,
      validateStatus: () => true,
    };

    const response = await axios(axiosConfig);
    
    // Translate response back to Anthropic format
    let anthropicResponse: AnthropicMessagesResponse;
    try {
      anthropicResponse = adapter.translateResponse(response.data, adapterContext);
    } catch (error) {
      throw new Error(`Provider error: ${response.status} ${JSON.stringify(response.data)}`);
    }

    // Enforce persona on response
    const responseText = JSON.stringify(anthropicResponse);
    const enforcedResponseText = this.personaEnforcer.enforceResponse(responseText, context.endpoint.provider, context.providerModelId);
    
    const result: ForwardResult = {
      response: JSON.parse(enforcedResponseText),
      usage: {
        inputTokens: anthropicResponse.usage?.input_tokens || 0,
        outputTokens: anthropicResponse.usage?.output_tokens || 0,
      },
    };

    return result;
  }
  
  /**
   * Streaming version using adapters
   */
  async *translateAndForwardStream(context: TranslationContext, request: AnthropicMessagesRequest): AsyncGenerator<AnthropicStreamEvent> {
    const providerType = resolveProviderType(context.endpoint.baseUrl, {});
    const adapter = getAdapter(providerType);
    
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${providerType}`);
    }

    const providerConfig: ProviderConfig = {
      type: providerType,
      apiKey: context.apiKey,
      baseUrl: context.endpoint.baseUrl,
      models: context.endpoint.config?.models || {},
      defaultHeaders: context.endpoint.config?.headers || {},
      timeout: 60000,
      retries: 3,
    };
    
    const adapterContext = createAdapterContext(providerConfig, context.providerModelId, context.apiKey);
    const enforcedRequest = this.personaEnforcer.enforceRequest(request, context.endpoint.provider, context.providerModelId);
    const translatedRequest = adapter.translateRequest(enforcedRequest, adapterContext);

    try {
      const response = await axios({
        method: translatedRequest.method as any,
        url: translatedRequest.url,
        headers: translatedRequest.headers,
        data: translatedRequest.body,
        timeout: adapterContext.config.timeout || 60000,
        responseType: 'stream',
      });

      let messageStarted = false;
      let contentIndex = 0;

      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter((line: string) => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              yield { type: 'message_stop' };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const streamEvent = adapter.translateStream(parsed, adapterContext);
              
              if (streamEvent) {
                // Enforce persona on stream chunks
                if (streamEvent.type === 'content_block_delta' && streamEvent.delta?.text) {
                  const enforcedText = this.personaEnforcer.enforceStreamChunk(
                    streamEvent.delta.text,
                    context.endpoint.provider,
                    context.providerModelId
                  );
                  yield {
                    ...streamEvent,
                    delta: { ...streamEvent.delta, text: enforcedText },
                  };
                } else {
                  yield streamEvent;
                }
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (error: any) {
      throw new Error(`Stream error: ${error.message}`);
    }
  }
  
  // Legacy helper methods kept for backward compatibility
  private anthropicToOpenAI(request: AnthropicMessagesRequest, modelId: string): any {
    const adapter = getAdapter('openai');
    if (!adapter) throw new Error('OpenAI adapter not found');
    
    const context = createAdapterContext({
      type: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      models: {},
    }, modelId);
    
    return adapter.translateRequest(request, context);
  }
  
  private openAIToAnthropic(response: any, modelId: string): AnthropicMessagesResponse {
    const adapter = getAdapter('openai');
    if (!adapter) throw new Error('OpenAI adapter not found');
    
    const context = createAdapterContext({
      type: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      models: {},
    }, modelId);
    
    return adapter.translateResponse(response, context);
  }
  
  private mapFinishReason(finishReason: string): 'end_turn' | 'max_tokens' | 'tool_use' {
    switch (finishReason) {
      case 'stop':
      case 'done':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      case 'tool_calls':
      case 'tool_use':
        return 'tool_use';
      default:
        return 'end_turn';
    }
  }
}
