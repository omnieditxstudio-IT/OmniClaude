import axios, { AxiosRequestConfig } from 'axios';
import { 
  AnthropicMessagesRequest, 
  AnthropicMessagesResponse, 
  AnthropicStreamEvent,
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIMessage,
  OpenAITool,
  OllamaRequest,
  VertexRequest,
  VertexContent,
} from '@gateway/shared';

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
  /**
   * Main entry point: translate Anthropic request and forward to provider
   */
  async translateAndForward(context: TranslationContext, request: AnthropicMessagesRequest): Promise<ForwardResult> {
    const { provider } = context.endpoint;
    
    switch (provider) {
      case 'openrouter':
      case 'custom':
        return this.forwardToOpenAICompatible(context, request);
      case 'ollama':
        return this.forwardToOllama(context, request);
      case 'vertex':
        return this.forwardToVertex(context, request);
      case 'anthropic':
        return this.forwardToAnthropic(context, request);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
  
  /**
   * Streaming version
   */
  async *translateAndForwardStream(context: TranslationContext, request: AnthropicMessagesRequest): AsyncGenerator<AnthropicStreamEvent> {
    const { provider } = context.endpoint;
    
    switch (provider) {
      case 'openrouter':
      case 'custom':
        yield* this.forwardToOpenAICompatibleStream(context, request);
        break;
      case 'ollama':
        yield* this.forwardToOllamaStream(context, request);
        break;
      case 'vertex':
        yield* this.forwardToVertexStream(context, request);
        break;
      case 'anthropic':
        yield* this.forwardToAnthropicStream(context, request);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
  
  // ============================================
  // Anthropic -> OpenAI-compatible (OpenRouter, Custom)
  // ============================================
  private async forwardToOpenAICompatible(context: TranslationContext, request: AnthropicMessagesRequest): Promise<ForwardResult> {
    const openaiRequest = this.anthropicToOpenAI(request, context.providerModelId);
    const response = await this.postOpenAI(context, openaiRequest);
    return this.openAIToAnthropic(response, context.claudeModelId);
  }
  
  private async *forwardToOpenAICompatibleStream(context: TranslationContext, request: AnthropicMessagesRequest): AsyncGenerator<AnthropicStreamEvent> {
    const openaiRequest = this.anthropicToOpenAI(request, context.providerModelId);
    openaiRequest.stream = true;
    
    const response = await this.postOpenAIStream(context, openaiRequest);
    
    let messageStarted = false;
    let contentIndex = 0;
    
    for await (const chunk of response) {
      if (!chunk.choices || chunk.choices.length === 0) continue;
      
      const choice = chunk.choices[0];
      
      if (!messageStarted) {
        // message_start
        yield {
          type: 'message_start',
          message: {
            id: `msg_${Date.now()}`,
            type: 'message',
            role: 'assistant',
            content: [],
            model: context.claudeModelId,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        };
        messageStarted = true;
        
        // content_block_start (text)
        yield {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        };
      }
      
      if (choice.delta?.content) {
        // content_block_delta
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: choice.delta.content },
        };
      }
      
      if (choice.delta?.tool_calls) {
        // Handle tool calls
        for (const toolCall of choice.delta.tool_calls) {
          if (toolCall.index !== undefined && toolCall.index > contentIndex) {
            contentIndex = toolCall.index;
            yield {
              type: 'content_block_start',
              index: contentIndex,
              content_block: { type: 'tool_use', id: toolCall.id, name: toolCall.function?.name, input: {} },
            };
          }
          
          if (toolCall.function?.arguments) {
            yield {
              type: 'content_block_delta',
              index: contentIndex,
              delta: { type: 'input_json_delta', partial_json: toolCall.function.arguments },
            };
          }
        }
      }
      
      if (choice.finish_reason) {
        // content_block_stop
        yield { type: 'content_block_stop', index: contentIndex };
        
        // message_delta
        yield {
          type: 'message_delta',
          delta: { stop_reason: this.mapFinishReason(choice.finish_reason) },
          usage: { input_tokens: 0, output_tokens: 0 },
        };
        
        // message_stop
        yield { type: 'message_stop' };
      }
    }
  }
  
  // ============================================
  // Anthropic -> Ollama
  // ============================================
  private async forwardToOllama(context: TranslationContext, request: AnthropicMessagesRequest): Promise<ForwardResult> {
    const ollamaRequest = this.anthropicToOllama(request, context.providerModelId, context.endpoint.config);
    const response = await this.postOllama(context, ollamaRequest);
    return this.ollamaToAnthropic(response, context.claudeModelId);
  }
  
  private async *forwardToOllamaStream(context: TranslationContext, request: AnthropicMessagesRequest): AsyncGenerator<AnthropicStreamEvent> {
    const ollamaRequest = this.anthropicToOllama(request, context.providerModelId, context.endpoint.config);
    ollamaRequest.stream = true;
    
    const response = await this.postOllamaStream(context, ollamaRequest);
    
    let messageStarted = false;
    
    for await (const chunk of response) {
      if (!messageStarted) {
        yield {
          type: 'message_start',
          message: {
            id: `msg_${Date.now()}`,
            type: 'message',
            role: 'assistant',
            content: [],
            model: context.claudeModelId,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        };
        messageStarted = true;
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
      }
      
      if (chunk.message?.content) {
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: chunk.message.content },
        };
      }
      
      if (chunk.done) {
        yield { type: 'content_block_stop', index: 0 };
        yield { 
          type: 'message_delta', 
          delta: { stop_reason: 'end_turn' },
          usage: { input_tokens: chunk.prompt_eval_count || 0, output_tokens: chunk.eval_count || 0 },
        };
        yield { type: 'message_stop' };
      }
    }
  }
  
  // ============================================
  // Anthropic -> Vertex AI (Gemini)
  // ============================================
  private async forwardToVertex(context: TranslationContext, request: AnthropicMessagesRequest): Promise<ForwardResult> {
    const vertexRequest = this.anthropicToVertex(request, context.providerModelId);
    const response = await this.postVertex(context, vertexRequest);
    return this.vertexToAnthropic(response, context.claudeModelId);
  }
  
  private async *forwardToVertexStream(context: TranslationContext, request: AnthropicMessagesRequest): AsyncGenerator<AnthropicStreamEvent> {
    const vertexRequest = this.anthropicToVertex(request, context.providerModelId);
    vertexRequest.generationConfig = { ...vertexRequest.generationConfig, stream: true };
    
    const response = await this.postVertexStream(context, vertexRequest);
    
    let messageStarted = false;
    
    for await (const chunk of response) {
      if (!messageStarted) {
        yield {
          type: 'message_start',
          message: {
            id: `msg_${Date.now()}`,
            type: 'message',
            role: 'assistant',
            content: [],
            model: context.claudeModelId,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        };
        messageStarted = true;
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
      }
      
      if (chunk.candidates?.[0]?.content?.parts) {
        for (const part of chunk.candidates[0].content.parts) {
          if (part.text) {
            yield {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: part.text },
            };
          }
        }
      }
      
      if (chunk.candidates?.[0]?.finishReason) {
        yield { type: 'content_block_stop', index: 0 };
        yield {
          type: 'message_delta',
          delta: { stop_reason: this.mapVertexFinishReason(chunk.candidates[0].finishReason) },
          usage: { 
            input_tokens: chunk.usageMetadata?.promptTokenCount || 0, 
            output_tokens: chunk.usageMetadata?.candidatesTokenCount || 0 
          },
        };
        yield { type: 'message_stop' };
      }
    }
  }
  
  // ============================================
  // Anthropic -> Anthropic (passthrough)
  // ============================================
  private async forwardToAnthropic(context: TranslationContext, request: AnthropicMessagesRequest): Promise<ForwardResult> {
    const response = await this.postAnthropic(context, request);
    return response;
  }
  
  private async *forwardToAnthropicStream(context: TranslationContext, request: AnthropicMessagesRequest): AsyncGenerator<AnthropicStreamEvent> {
    const streamRequest = { ...request, stream: true };
    const response = await this.postAnthropicStream(context, streamRequest);
    
    for await (const chunk of response) {
      yield chunk;
    }
  }
  
  // ============================================
  // HTTP Helpers
  // ============================================
  private getHeaders(context: TranslationContext): Record<string, string> {
    const { provider, baseUrl, config } = context.endpoint;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    switch (provider) {
      case 'openrouter':
        headers['Authorization'] = `Bearer ${context.apiKey}`;
        headers['HTTP-Referer'] = 'https://gateway.local';
        headers['X-Title'] = 'Model Translation Gateway';
        break;
      case 'anthropic':
        headers['x-api-key'] = context.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        break;
      case 'vertex':
        // Vertex uses Bearer token from service account
        headers['Authorization'] = `Bearer ${context.apiKey}`;
        break;
      case 'ollama':
        // Ollama typically doesn't need auth
        break;
      case 'custom':
        if (config.headers) {
          Object.assign(headers, config.headers);
        }
        if (context.apiKey) {
          headers['Authorization'] = `Bearer ${context.apiKey}`;
        }
        break;
    }
    
    return headers;
  }
  
  private getBaseUrl(context: TranslationContext): string {
    const { provider, baseUrl } = context.endpoint;
    
    switch (provider) {
      case 'vertex':
        // Vertex URL format: https://{region}-aiplatform.googleapis.com/v1/projects/{project}/locations/{region}/publishers/google/models/{model}:streamGenerateContent
        return baseUrl;
      default:
        return baseUrl;
    }
  }
  
  private async postOpenAI(context: TranslationContext, request: OpenAIChatRequest): Promise<OpenAIChatResponse> {
    const url = `${this.getBaseUrl(context)}/chat/completions`;
    const response = await axios.post(url, request, { 
      headers: this.getHeaders(context),
      timeout: context.endpoint.config?.timeout || 60000,
    });
    return response.data;
  }
  
  private async postOpenAIStream(context: TranslationContext, request: OpenAIChatRequest): Promise<AsyncGenerator<OpenAIChatResponse>> {
    const url = `${this.getBaseUrl(context)}/chat/completions`;
    const response = await axios.post(url, request, { 
      headers: this.getHeaders(context),
      timeout: context.endpoint.config?.timeout || 60000,
      responseType: 'stream',
    });
    
    return this.parseSSEStream(response.data);
  }
  
  private async postOllama(context: TranslationContext, request: OllamaRequest): Promise<any> {
    const baseUrl = context.endpoint.baseUrl.replace('/v1', '');
    const url = `${baseUrl}/api/chat`;
    const response = await axios.post(url, request, { 
      headers: this.getHeaders(context),
      timeout: context.endpoint.config?.timeout || 60000,
    });
    return response.data;
  }
  
  private async postOllamaStream(context: TranslationContext, request: OllamaRequest): Promise<AsyncGenerator<any>> {
    const baseUrl = context.endpoint.baseUrl.replace('/v1', '');
    const url = `${baseUrl}/api/chat`;
    const response = await axios.post(url, request, { 
      headers: this.getHeaders(context),
      timeout: context.endpoint.config?.timeout || 60000,
      responseType: 'stream',
    });
    
    return this.parseNDJSONStream(response.data);
  }
  
  private async postVertex(context: TranslationContext, request: VertexRequest): Promise<any> {
    const url = `${context.endpoint.baseUrl}/${context.providerModelId}:generateContent`;
    const response = await axios.post(url, request, { 
      headers: this.getHeaders(context),
      timeout: context.endpoint.config?.timeout || 60000,
    });
    return response.data;
  }
  
  private async postVertexStream(context: TranslationContext, request: VertexRequest): Promise<AsyncGenerator<any>> {
    const url = `${context.endpoint.baseUrl}/${context.providerModelId}:streamGenerateContent?alt=sse`;
    const response = await axios.post(url, request, { 
      headers: this.getHeaders(context),
      timeout: context.endpoint.config?.timeout || 60000,
      responseType: 'stream',
    });
    
    return this.parseSSEStream(response.data);
  }
  
  private async postAnthropic(context: TranslationContext, request: AnthropicMessagesRequest): Promise<AnthropicMessagesResponse> {
    const url = `${this.getBaseUrl(context)}/messages`;
    const response = await axios.post(url, request, { 
      headers: this.getHeaders(context),
      timeout: context.endpoint.config?.timeout || 60000,
    });
    return response.data;
  }
  
  private async postAnthropicStream(context: TranslationContext, request: AnthropicMessagesRequest): Promise<AsyncGenerator<AnthropicStreamEvent>> {
    const url = `${this.getBaseUrl(context)}/messages`;
    const response = await axios.post(url, request, { 
      headers: this.getHeaders(context),
      timeout: context.endpoint.config?.timeout || 60000,
      responseType: 'stream',
    });
    
    return this.parseSSEStream(response.data);
  }
  
  // ============================================
  // Stream Parsers
  // ============================================
  private async *parseSSEStream(stream: any): AsyncGenerator<any> {
    let buffer = '';
    
    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            yield JSON.parse(data);
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }
  
  private async *parseNDJSONStream(stream: any): AsyncGenerator<any> {
    let buffer = '';
    
    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            yield JSON.parse(line);
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }
  
  // ============================================
  // Format Conversions
  // ============================================
  private anthropicToOpenAI(request: AnthropicMessagesRequest, model: string): OpenAIChatRequest {
    const messages: OpenAIMessage[] = [];
    
    // System message
    if (request.system) {
      const systemText = typeof request.system === 'string' 
        ? request.system 
        : request.system.map(b => b.type === 'text' ? b.text : '').join('\n');
      messages.push({ role: 'system', content: systemText });
    }
    
    // Convert messages
    for (const msg of request.messages) {
      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role, content: msg.content });
      } else {
        // Handle content blocks
        for (const block of msg.content) {
          if (block.type === 'text') {
            messages.push({ role: msg.role, content: block.text });
          } else if (block.type === 'tool_use') {
            messages.push({ 
              role: 'assistant', 
              content: null,
              tool_calls: [{
                id: block.id,
                type: 'function',
                function: { name: block.name, arguments: JSON.stringify(block.input) },
              }],
            });
          } else if (block.type === 'tool_result') {
            messages.push({ 
              role: 'tool', 
              content: block.content || '', 
              tool_call_id: block.tool_use_id 
            });
          }
        }
      }
    }
    
    return {
      model,
      messages,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      top_p: request.top_p,
      stop: request.stop_sequences,
      stream: request.stream,
      tools: request.tools?.map(this.anthropicToolToOpenAI),
      tool_choice: this.anthropicToolChoiceToOpenAI(request.tool_choice),
    };
  }
  
  private anthropicToOllama(request: AnthropicMessagesRequest, model: string, config: any): OllamaRequest {
    const messages: OpenAIMessage[] = [];
    
    if (request.system) {
      const systemText = typeof request.system === 'string' 
        ? request.system 
        : request.system.map(b => b.type === 'text' ? b.text : '').join('\n');
      messages.push({ role: 'system', content: systemText });
    }
    
    for (const msg of request.messages) {
      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role, content: msg.content });
      } else {
        for (const block of msg.content) {
          if (block.type === 'text') {
            messages.push({ role: msg.role, content: block.text });
          }
        }
      }
    }
    
    return {
      model,
      messages,
      options: {
        num_ctx: config?.ollamaOptions?.numCtx || 32768,
        temperature: config?.ollamaOptions?.temperature ?? request.temperature,
        num_predict: request.max_tokens,
      },
      stream: request.stream,
    };
  }
  
  private anthropicToVertex(request: AnthropicMessagesRequest, model: string): VertexRequest {
    const contents: VertexContent[] = [];
    
    for (const msg of request.messages) {
      if (typeof msg.content === 'string') {
        contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] });
      } else {
        for (const block of msg.content) {
          if (block.type === 'text') {
            contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: block.text }] });
          } else if (block.type === 'tool_use') {
            contents.push({ 
              role: 'model', 
              parts: [{ functionCall: { name: block.name, args: block.input as Record<string, unknown> } }] 
            });
          } else if (block.type === 'tool_result') {
            contents.push({ 
              role: 'user', 
              parts: [{ functionResponse: { name: block.name || '', response: { content: block.content } } }] 
            });
          }
        }
      }
    }
    
    return {
      contents,
      systemInstruction: request.system ? { 
        parts: [{ text: typeof request.system === 'string' ? request.system : request.system.map(b => b.type === 'text' ? b.text : '').join('\n') }] 
      } : undefined,
      tools: request.tools?.map(this.anthropicToolToVertex),
      toolConfig: request.tool_choice ? { functionCallingConfig: { mode: this.anthropicToolChoiceToVertex(request.tool_choice) } } : undefined,
      generationConfig: {
        maxOutputTokens: request.max_tokens,
        temperature: request.temperature,
        topP: request.top_p,
        topK: request.top_k,
        stopSequences: request.stop_sequences,
      },
    };
  }
  
  private openAIToAnthropic(response: OpenAIChatResponse, model: string): ForwardResult {
    const choice = response.choices[0];
    const content: any[] = [];
    
    if (choice.message.content) {
      content.push({ type: 'text', text: choice.message.content });
    }
    
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
    }
    
    return {
      response: {
        id: response.id,
        type: 'message',
        role: 'assistant',
        content,
        model,
        stop_reason: this.mapFinishReason(choice.finish_reason),
        stop_sequence: null,
        usage: {
          input_tokens: response.usage.prompt_tokens,
          output_tokens: response.usage.completion_tokens,
        },
      },
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      },
    };
  }
  
  private ollamaToAnthropic(response: any, model: string): ForwardResult {
    return {
      response: {
        id: `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: response.message?.content || '' }],
        model,
        stop_reason: response.done ? 'end_turn' : null,
        stop_sequence: null,
        usage: {
          input_tokens: response.prompt_eval_count || 0,
          output_tokens: response.eval_count || 0,
        },
      },
      usage: {
        inputTokens: response.prompt_eval_count || 0,
        outputTokens: response.eval_count || 0,
      },
    };
  }
  
  private vertexToAnthropic(response: any, model: string): ForwardResult {
    const candidate = response.candidates?.[0];
    const content: any[] = [];
    
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          content.push({ type: 'text', text: part.text });
        } else if (part.functionCall) {
          content.push({
            type: 'tool_use',
            id: `call_${Date.now()}`,
            name: part.functionCall.name,
            input: part.functionCall.args,
          });
        }
      }
    }
    
    return {
      response: {
        id: `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content,
        model,
        stop_reason: this.mapVertexFinishReason(candidate?.finishReason),
        stop_sequence: null,
        usage: {
          input_tokens: response.usageMetadata?.promptTokenCount || 0,
          output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
        },
      },
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }
  
  // ============================================
  // Tool Conversions
  // ============================================
  private anthropicToolToOpenAI(tool: any): OpenAITool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    };
  }
  
  private anthropicToolToVertex(tool: any): any {
    return {
      functionDeclarations: [{
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      }],
    };
  }
  
  private anthropicToolChoiceToOpenAI(choice: any): OpenAIChatRequest['tool_choice'] {
    if (!choice) return 'auto';
    if (choice.type === 'auto') return 'auto';
    if (choice.type === 'none') return 'none';
    if (choice.type === 'any') return 'auto'; // OpenAI doesn't have 'any'
    if (choice.type === 'tool') return { type: 'function', function: { name: choice.name } };
    return 'auto';
  }
  
  private anthropicToolChoiceToVertex(choice: any): 'AUTO' | 'ANY' | 'NONE' {
    if (!choice) return 'AUTO';
    if (choice.type === 'auto') return 'AUTO';
    if (choice.type === 'none') return 'NONE';
    if (choice.type === 'any') return 'ANY';
    if (choice.type === 'tool') return 'ANY';
    return 'AUTO';
  }
  
  private mapFinishReason(reason: string | null): 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null {
    switch (reason) {
      case 'stop': return 'end_turn';
      case 'length': return 'max_tokens';
      case 'tool_calls': return 'tool_use';
      case 'content_filter': return 'stop_sequence';
      default: return 'end_turn';
    }
  }
  
  private mapVertexFinishReason(reason: string | null): 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null {
    switch (reason) {
      case 'STOP': return 'end_turn';
      case 'MAX_TOKENS': return 'max_tokens';
      case 'SAFETY': return 'stop_sequence';
      case 'RECITATION': return 'stop_sequence';
      case 'OTHER': return 'stop_sequence';
      default: return 'end_turn';
    }
  }
}

export const translationService = new TranslationService();