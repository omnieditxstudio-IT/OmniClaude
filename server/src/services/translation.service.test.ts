import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translationService } from '../services/translation.service';
import { AnthropicMessagesRequest } from '@gateway/shared';

describe('TranslationService', () => {
  const mockContext = {
    claudeModelId: 'claude-3-opus',
    providerModelId: 'deepseek/deepseek-coder',
    endpoint: {
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      config: { timeout: 60000 },
    },
    apiKey: 'sk-test-key',
  };

  const mockRequest: AnthropicMessagesRequest = {
    model: 'claude-3-opus',
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'How are you?' },
    ],
    system: 'You are helpful',
    max_tokens: 1000,
    temperature: 0.7,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('anthropicToOpenAI', () => {
    it('should convert Anthropic messages to OpenAI format', () => {
      const result = translationService['anthropicToOpenAI'](mockRequest, 'deepseek/deepseek-coder');

      expect(result.model).toBe('deepseek/deepseek-coder');
      expect(result.messages).toHaveLength(4); // system + 3 messages
      expect(result.messages[0]).toEqual({ role: 'system', content: 'You are helpful' });
      expect(result.messages[1]).toEqual({ role: 'user', content: 'Hello' });
      expect(result.messages[2]).toEqual({ role: 'assistant', content: 'Hi!' });
      expect(result.messages[3]).toEqual({ role: 'user', content: 'How are you?' });
      expect(result.max_tokens).toBe(1000);
      expect(result.temperature).toBe(0.7);
    });

    it('should handle array system prompt', () => {
      const requestWithArraySystem: AnthropicMessagesRequest = {
        ...mockRequest,
        system: [{ type: 'text', text: 'System 1' }, { type: 'text', text: 'System 2' }],
      };

      const result = translationService['anthropicToOpenAI'](requestWithArraySystem, 'model');

      expect(result.messages[0].content).toBe('System 1\nSystem 2');
    });

    it('should convert tool calls', () => {
      const requestWithTools: AnthropicMessagesRequest = {
        ...mockRequest,
        tools: [{
          name: 'get_weather',
          description: 'Get weather',
          input_schema: { type: 'object', properties: { location: { type: 'string' } } },
        }],
      };

      const result = translationService['anthropicToOpenAI'](requestWithTools, 'model');

      expect(result.tools).toHaveLength(1);
      expect(result.tools![0].function.name).toBe('get_weather');
    });
  });

  describe('anthropicToOllama', () => {
    it('should convert to Ollama format with options', () => {
      const result = translationService['anthropicToOllama'](
        mockRequest,
        'llama3.1:70b',
        { ollamaOptions: { numCtx: 32768, temperature: 0.5 } }
      );

      expect(result.model).toBe('llama3.1:70b');
      expect(result.options.num_ctx).toBe(32768);
      expect(result.options.temperature).toBe(0.5);
      expect(result.options.num_predict).toBe(1000);
    });

    it('should use request temperature when no ollama config', () => {
      const result = translationService['anthropicToOllama'](
        mockRequest,
        'llama3.1:70b',
        {}
      );

      expect(result.options.temperature).toBe(0.7);
    });
  });

  describe('anthropicToVertex', () => {
    it('should convert to Vertex format', () => {
      const result = translationService['anthropicToVertex'](mockRequest, 'gemini-1.5-pro');

      expect(result.contents).toHaveLength(3);
      expect(result.systemInstruction).toBeDefined();
      expect(result.generationConfig.maxOutputTokens).toBe(1000);
      expect(result.generationConfig.temperature).toBe(0.7);
    });

    it('should convert tool calls to function declarations', () => {
      const requestWithTools: AnthropicMessagesRequest = {
        ...mockRequest,
        tools: [{
          name: 'search',
          description: 'Search web',
          input_schema: { type: 'object', properties: { query: { type: 'string' } } },
        }],
      };

      const result = translationService['anthropicToVertex'](requestWithTools, 'model');

      expect(result.tools).toHaveLength(1);
      expect(result.tools![0].functionDeclarations[0].name).toBe('search');
    });
  });

  describe('openAIToAnthropic', () => {
    it('should convert OpenAI response to Anthropic format', () => {
      const openaiResponse = {
        id: 'chatcmpl-123',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello there!',
            tool_calls: [{
              id: 'call-123',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"location": "NYC"}' },
            }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      };

      const result = translationService['openAIToAnthropic'](openaiResponse, 'claude-3-opus');

      expect(result.response.id).toBe('chatcmpl-123');
      expect(result.response.content).toHaveLength(2); // text + tool_use
      expect(result.response.content[0]).toEqual({ type: 'text', text: 'Hello there!' });
      expect(result.response.content[1].type).toBe('tool_use');
      expect(result.response.stop_reason).toBe('tool_use');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(20);
    });
  });

  describe('mapFinishReason', () => {
    it('should map OpenAI finish reasons to Anthropic', () => {
      expect(translationService['mapFinishReason']('stop')).toBe('end_turn');
      expect(translationService['mapFinishReason']('length')).toBe('max_tokens');
      expect(translationService['mapFinishReason']('tool_calls')).toBe('tool_use');
      expect(translationService['mapFinishReason']('content_filter')).toBe('stop_sequence');
      expect(translationService['mapFinishReason'](null)).toBe('end_turn');
    });
  });

  describe('mapVertexFinishReason', () => {
    it('should map Vertex finish reasons to Anthropic', () => {
      expect(translationService['mapVertexFinishReason']('STOP')).toBe('end_turn');
      expect(translationService['mapVertexFinishReason']('MAX_TOKENS')).toBe('max_tokens');
      expect(translationService['mapVertexFinishReason']('SAFETY')).toBe('stop_sequence');
    });
  });
});