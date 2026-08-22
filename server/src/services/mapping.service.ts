import { ModelMapping, IModelMapping, IModelMappingEntry } from '../models';
import { CreateMappingInput } from '@gateway/shared';
import { Types } from 'mongoose';

export interface MappingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class MappingService {
  async create(userId: string, input: CreateMappingInput): Promise<IModelMapping> {
    // If this is set as default, unset other defaults
    if (input.mappings.length > 0) {
      await this.unsetDefault(userId);
    }
    
    const mapping = await ModelMapping.create({
      userId: new Types.ObjectId(userId),
      name: input.name,
      description: input.description,
      mappings: input.mappings,
      isActive: true,
      isDefault: true, // First mapping is default
    });
    
    return mapping;
  }
  
  async findById(id: string, userId: string): Promise<IModelMapping | null> {
    return ModelMapping.findOne({ _id: id, userId: new Types.ObjectId(userId) });
  }
  
  async findByUserId(userId: string): Promise<IModelMapping[]> {
    return ModelMapping.find({ userId: new Types.ObjectId(userId) })
      .sort({ isDefault: -1, updatedAt: -1 })
      .lean();
  }
  
  async findDefault(userId: string): Promise<IModelMapping | null> {
    return ModelMapping.findOne({ 
      userId: new Types.ObjectId(userId), 
      isDefault: true,
      isActive: true 
    });
  }
  
  async update(id: string, userId: string, updates: Partial<IModelMapping>): Promise<IModelMapping | null> {
    const allowedUpdates = ['name', 'description', 'mappings', 'isActive'];
    const filteredUpdates: Record<string, unknown> = {};
    
    for (const key of allowedUpdates) {
      if (updates[key as keyof IModelMapping] !== undefined) {
        filteredUpdates[key] = updates[key as keyof IModelMapping];
      }
    }
    
    return ModelMapping.findOneAndUpdate(
      { _id: id, userId: new Types.ObjectId(userId) },
      { $set: filteredUpdates },
      { new: true }
    );
  }
  
  async delete(id: string, userId: string): Promise<boolean> {
    const mapping = await ModelMapping.findOne({ _id: id, userId: new Types.ObjectId(userId) });
    if (!mapping) return false;
    
    const wasDefault = mapping.isDefault;
    const result = await ModelMapping.deleteOne({ _id: id });
    
    // If we deleted the default, make another one default
    if (wasDefault && result.deletedCount > 0) {
      const another = await ModelMapping.findOne({ 
        userId: new Types.ObjectId(userId), 
        isActive: true 
      }).sort({ updatedAt: -1 });
      
      if (another) {
        await ModelMapping.updateOne({ _id: another._id }, { $set: { isDefault: true } });
      }
    }
    
    return result.deletedCount > 0;
  }
  
  async setDefault(id: string, userId: string): Promise<IModelMapping | null> {
    // Unset current default
    await this.unsetDefault(userId);
    
    // Set new default
    return ModelMapping.findOneAndUpdate(
      { _id: id, userId: new Types.ObjectId(userId) },
      { $set: { isDefault: true } },
      { new: true }
    );
  }
  
  private async unsetDefault(userId: string): Promise<void> {
    await ModelMapping.updateMany(
      { userId: new Types.ObjectId(userId), isDefault: true },
      { $set: { isDefault: false } }
    );
  }
  
  async validateMapping(userId: string, mapping: CreateMappingInput['mappings'][0]): Promise<MappingValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check if endpoint exists and belongs to user
    const { Endpoint } = await import('../models');
    const endpoint = await Endpoint.findOne({ 
      _id: mapping.endpointId, 
      userId: new Types.ObjectId(userId) 
    });
    
    if (!endpoint) {
      errors.push(`Endpoint ${mapping.endpointId} not found`);
    } else if (!endpoint.isActive) {
      warnings.push(`Endpoint ${endpoint.name} is inactive`);
    }
    
    // Check if model exists in endpoint
    if (endpoint) {
      const model = endpoint.models.find(m => m.id === mapping.providerModelId);
      if (!model) {
        warnings.push(`Model ${mapping.providerModelId} not found in endpoint ${endpoint.name}`);
      }
    }
    
    // Validate fallbacks
    if (mapping.fallbacks) {
      for (const fallback of mapping.fallbacks) {
        const fbEndpoint = await Endpoint.findOne({ 
          _id: fallback.endpointId, 
          userId: new Types.ObjectId(userId) 
        });
        if (!fbEndpoint) {
          errors.push(`Fallback endpoint ${fallback.endpointId} not found`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
  
  async testMapping(userId: string, mappingId: string): Promise<{ success: boolean; response?: any; error?: string }> {
    const mapping = await this.findById(mappingId, userId);
    if (!mapping) {
      return { success: false, error: 'Mapping not found' };
    }
    
    // Get the default mapping entry (first one)
    const entry = mapping.mappings[0];
    if (!entry) {
      return { success: false, error: 'No mapping entries' };
    }
    
    // Test with a simple message
    const { translationService } = await import('./translation.service');
    const { endpointService } = await import('./endpoint.service');
    const { apiKeyService } = await import('./key.service');
    
    const endpoint = await endpointService.findById(entry.endpointId, userId);
    if (!endpoint) {
      return { success: false, error: 'Endpoint not found' };
    }
    
    const apiKey = await apiKeyService.getDecryptedKey(endpoint.apiKeyId.toString(), userId);
    if (!apiKey) {
      return { success: false, error: 'API key not found' };
    }
    
    try {
      const result = await translationService.translateAndForward({
        claudeModelId: entry.claudeModelId,
        providerModelId: entry.providerModelId,
        endpoint,
        apiKey,
        request: {
          model: entry.claudeModelId,
          messages: [{ role: 'user', content: 'Hello, this is a test.' }],
          max_tokens: 100,
        },
      });
      
      return { success: true, response: result };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Test failed' 
      };
    }
  }
  
  // Resolve a Claude model ID to provider model + endpoint
  async resolveModel(userId: string, claudeModelId: string): Promise<{
    entry: IModelMappingEntry;
    endpoint: any;
    apiKey: string;
  } | null> {
    const mapping = await this.findDefault(userId);
    if (!mapping) return null;
    
    const entry = mapping.mappings.find(m => m.claudeModelId === claudeModelId);
    if (!entry) return null;
    
    const { endpointService } = await import('./endpoint.service');
    const { apiKeyService } = await import('./key.service');
    
    const endpoint = await endpointService.findById(entry.endpointId, userId);
    if (!endpoint || !endpoint.isActive) return null;
    
    const apiKey = await apiKeyService.getDecryptedKey(endpoint.apiKeyId.toString(), userId);
    if (!apiKey) return null;
    
    return { entry, endpoint, apiKey };
  }
  
  // Get fallback chain for a model
  async getFallbackChain(userId: string, claudeModelId: string): Promise<Array<{
    providerModelId: string;
    endpoint: any;
    apiKey: string;
  }>> {
    const mapping = await this.findDefault(userId);
    if (!mapping) return [];
    
    const entry = mapping.mappings.find(m => m.claudeModelId === claudeModelId);
    if (!entry || !entry.fallbacks) return [];
    
    const { endpointService } = await import('./endpoint.service');
    const { apiKeyService } = await import('./key.service');
    
    const fallbacks = [];
    
    for (const fallback of entry.fallbacks.sort((a, b) => a.priority - b.priority)) {
      const endpoint = await endpointService.findById(fallback.endpointId, userId);
      if (!endpoint || !endpoint.isActive) continue;
      
      const apiKey = await apiKeyService.getDecryptedKey(endpoint.apiKeyId.toString(), userId);
      if (!apiKey) continue;
      
      fallbacks.push({
        providerModelId: fallback.providerModelId,
        endpoint,
        apiKey,
      });
    }
    
    return fallbacks;
  }
}

export const mappingService = new MappingService();