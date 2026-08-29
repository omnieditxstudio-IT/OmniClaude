import { AzureAdapter } from './azure';
import { BedrockAdapter } from './bedrock';
import { AnthropicAdapter } from './anthropic';
import { GoogleAdapter } from './google';
import { OllamaAdapter } from './ollama';
import { OpenAICompatibleAdapter, deepSeekAdapter, groqAdapter, fireworksAdapter, togetherAdapter, mistralAdapter, vllmAdapter, lmstudioAdapter, zhipuAdapter, cohereAdapter } from './openai-compatible';
import { ProviderAdapter, ProviderType } from './base';

export {
  AnthropicAdapter,
  anthropicAdapter,
  GoogleAdapter,
  googleAdapter,
  OllamaAdapter,
  ollamaAdapter,
  OpenAICompatibleAdapter,
  deepSeekAdapter,
  groqAdapter,
  fireworksAdapter,
  togetherAdapter,
  mistralAdapter,
  vllmAdapter,
  lmstudioAdapter,
  zhipuAdapter,
  cohereAdapter,
  AzureAdapter,
  BedrockAdapter,
};

export function registerAllAdapters(): void {
  // Register core adapters
  registerAdapter('anthropic', new AnthropicAdapter());
  registerAdapter('openai', new OpenAICompatibleAdapter('openai', 'gpt-4o'));
  registerAdapter('google', new GoogleAdapter());
  registerAdapter('ollama', new OllamaAdapter());
  
  // Register OpenAI-compatible providers
  registerAdapter('deepseek', deepSeekAdapter);
  registerAdapter('groq', groqAdapter);
  registerAdapter('fireworks', fireworksAdapter);
  registerAdapter('together', togetherAdapter);
  registerAdapter('mistral', mistralAdapter);
  registerAdapter('vllm', vllmAdapter);
  registerAdapter('lmstudio', lmstudioAdapter);
  registerAdapter('zhipu', zhipuAdapter);
  registerAdapter('cohere', cohereAdapter);
  
  // Register enterprise adapters (simplified implementations)
  registerAdapter('azure', new AzureAdapter());
  registerAdapter('bedrock', new BedrockAdapter());
}

import { registerAdapter, getAdapter, listSupportedProviders, isProviderSupported } from './factory';
