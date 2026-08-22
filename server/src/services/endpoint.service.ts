import { Endpoint, IEndpoint, IEndpointModel, IEndpointConfig } from '../models';
import { CreateEndpointInput } from '@gateway/shared';
import { Types } from 'mongoose';
import axios from 'axios';

export class EndpointService {
  async create(userId: string, input: CreateEndpointInput): Promise<IEndpoint> {
    const endpoint = await Endpoint.create({
      userId: new Types.ObjectId(userId),
      name: input.name,
      provider: input.provider,
      baseUrl: input.baseUrl,
      apiKeyId: new Types.ObjectId(input.apiKeyId),
      config: input.config,
      priority: input.priority,
      models: [],
      isActive: true,
    });
    
    return endpoint;
  }
  
  async findById(id: string, userId: string): Promise<IEndpoint | null> {
    return Endpoint.findOne({ _id: id, userId: new Types.ObjectId(userId) });
  }
  
  async findByUserId(userId: string): Promise<IEndpoint[]> {
    return Endpoint.find({ userId: new Types.ObjectId(userId) })
      .sort({ priority: -1, createdAt: -1 })
      .populate('apiKeyId', 'name provider keyHash')
      .lean();
  }
  
  async findActiveByUserId(userId: string): Promise<IEndpoint[]> {
    return Endpoint.find({ 
      userId: new Types.ObjectId(userId), 
      isActive: true 
    })
      .sort({ priority: -1 })
      .populate('apiKeyId', 'name provider keyHash')
      .lean();
  }
  
  async update(id: string, userId: string, updates: Partial<IEndpoint>): Promise<IEndpoint | null> {
    const allowedUpdates = ['name', 'baseUrl', 'config', 'isActive', 'priority', 'models'];
    const filteredUpdates: Record<string, unknown> = {};
    
    for (const key of allowedUpdates) {
      if (updates[key as keyof IEndpoint] !== undefined) {
        filteredUpdates[key] = updates[key as keyof IEndpoint];
      }
    }
    
    return Endpoint.findOneAndUpdate(
      { _id: id, userId: new Types.ObjectId(userId) },
      { $set: filteredUpdates },
      { new: true }
    );
  }
  
  async delete(id: string, userId: string): Promise<boolean> {
    const result = await Endpoint.deleteOne({ _id: id, userId: new Types.ObjectId(userId) });
    return result.deletedCount > 0;
  }
  
  async syncModels(id: string, userId: string, apiKey: string): Promise<IEndpointModel[]> {
    const endpoint = await this.findById(id, userId);
    if (!endpoint) throw new Error('Endpoint not found');
    
    let models: IEndpointModel[] = [];
    
    switch (endpoint.provider) {
      case 'openrouter':
        models = await this.fetchOpenRouterModels(endpoint.baseUrl, apiKey);
        break;
      case 'ollama':
        models = await this.fetchOllamaModels(endpoint.baseUrl);
        break;
      case 'anthropic':
        models = await this.fetchAnthropicModels(endpoint.baseUrl, apiKey);
        break;
      case 'vertex':
        models = await this.fetchVertexModels(apiKey);
        break;
      case 'custom':
        models = await this.fetchCustomModels(endpoint.baseUrl, apiKey);
        break;
    }
    
    // Update endpoint with fetched models
    await Endpoint.updateOne(
      { _id: id },
      { $set: { models } }
    );
    
    return models;
  }
  
  async healthCheck(id: string, userId: string, apiKey: string): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const endpoint = await this.findById(id, userId);
    if (!endpoint) throw new Error('Endpoint not found');
    
    const start = Date.now();
    
    try {
      let healthy = false;
      
      switch (endpoint.provider) {
        case 'openrouter':
          healthy = await this.checkOpenRouter(endpoint.baseUrl, apiKey);
          break;
        case 'ollama':
          healthy = await this.checkOllama(endpoint.baseUrl);
          break;
        case 'anthropic':
          healthy = await this.checkAnthropic(endpoint.baseUrl, apiKey);
          break;
        case 'vertex':
          healthy = true; // Vertex is always healthy if creds are valid
          break;
        case 'custom':
          healthy = await this.checkCustom(endpoint.baseUrl, apiKey);
          break;
      }
      
      return { healthy, latency: Date.now() - start };
    } catch (error) {
      return { 
        healthy: false, 
        latency: Date.now() - start, 
        error: error instanceof Error ? error.message : 'Health check failed' 
      };
    }
  }
  
  // Provider-specific model fetching
  private async fetchOpenRouterModels(baseUrl: string, apiKey: string): Promise<IEndpointModel[]> {
    const response = await axios.get(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 10000,
    });
    
    return response.data.data.map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      contextWindow: m.context_length || 4096,
      supportsTools: m.architecture?.modality?.includes('tools') || false,
      supportsVision: m.architecture?.modality?.includes('image') || false,
      pricing: m.pricing ? {
        inputPer1k: parseFloat(m.pricing.prompt) * 1000,
        outputPer1k: parseFloat(m.pricing.completion) * 1000,
        currency: 'USD',
      } : undefined,
    }));
  }
  
  private async fetchOllamaModels(baseUrl: string): Promise<IEndpointModel[]> {
    const response = await axios.get(`${baseUrl.replace('/v1', '')}/api/tags`, {
      timeout: 10000,
    });
    
    return response.data.models.map((m: any) => ({
      id: m.name,
      name: m.name,
      contextWindow: 32768,
      supportsTools: false,
      supportsVision: false,
    }));
  }
  
  private async fetchAnthropicModels(baseUrl: string, apiKey: string): Promise<IEndpointModel[]> {
    const response = await axios.get(`${baseUrl}/models`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      timeout: 10000,
    });
    
    return response.data.data.map((m: any) => ({
      id: m.id,
      name: m.display_name || m.id,
      contextWindow: 200000,
      supportsTools: true,
      supportsVision: true,
    }));
  }
  
  private async fetchVertexModels(apiKey: string): Promise<IEndpointModel[]> {
    // Vertex models are fixed (Gemini models)
    return [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 1048576, supportsTools: true, supportsVision: true },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', contextWindow: 1048576, supportsTools: true, supportsVision: true },
      { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro', contextWindow: 32768, supportsTools: true, supportsVision: false },
    ];
  }
  
  private async fetchCustomModels(baseUrl: string, apiKey: string): Promise<IEndpointModel[]> {
    try {
      const response = await axios.get(`${baseUrl}/models`, {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
        timeout: 10000,
      });
      
      if (Array.isArray(response.data.data)) {
        return response.data.data.map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          contextWindow: m.context_length || 4096,
          supportsTools: false,
          supportsVision: false,
        }));
      }
    } catch {
      // Ignore errors for custom endpoints
    }
    return [];
  }
  
  // Health checks
  private async checkOpenRouter(baseUrl: string, apiKey: string): Promise<boolean> {
    try {
      const response = await axios.get(`${baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
  
  private async checkOllama(baseUrl: string): Promise<boolean> {
    try {
      const response = await axios.get(`${baseUrl.replace('/v1', '')}/api/tags`, {
        timeout: 3000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
  
  private async checkAnthropic(baseUrl: string, apiKey: string): Promise<boolean> {
    try {
      const response = await axios.get(`${baseUrl}/models`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
  
  private async checkCustom(baseUrl: string, apiKey: string): Promise<boolean> {
    try {
      const response = await axios.get(`${baseUrl}/models`, {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

export const endpointService = new EndpointService();