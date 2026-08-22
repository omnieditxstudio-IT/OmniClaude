import { ApiKey, IApiKey } from '../models';
import { encrypt, decrypt, getKeyHash } from './encryption';
import { CreateApiKeyInput } from '@gateway/shared';
import { Types } from 'mongoose';

export interface ApiKeyWithDecrypted extends Omit<IApiKey, 'keyEncrypted'> {
  key: string; // decrypted
}

export class ApiKeyService {
  async create(userId: string, input: CreateApiKeyInput): Promise<IApiKey> {
    const keyEncrypted = await encrypt(input.key);
    const keyHash = getKeyHash(input.key);
    
    const apiKey = await ApiKey.create({
      userId: new Types.ObjectId(userId),
      name: input.name,
      provider: input.provider,
      keyEncrypted,
      keyHash,
      isActive: true,
    });
    
    return apiKey;
  }
  
  async findById(id: string, userId: string): Promise<IApiKey | null> {
    return ApiKey.findOne({ _id: id, userId: new Types.ObjectId(userId) });
  }
  
  async findByUserId(userId: string): Promise<IApiKey[]> {
    return ApiKey.find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }
  
  async findActiveByUserId(userId: string): Promise<IApiKey[]> {
    return ApiKey.find({ 
      userId: new Types.ObjectId(userId), 
      isActive: true 
    }).sort({ createdAt: -1 }).lean();
  }
  
  async findByProvider(userId: string, provider: string): Promise<IApiKey[]> {
    return ApiKey.find({ 
      userId: new Types.ObjectId(userId), 
      provider,
      isActive: true 
    }).lean();
  }
  
  async update(id: string, userId: string, updates: Partial<Pick<IApiKey, 'name' | 'isActive'>>): Promise<IApiKey | null> {
    return ApiKey.findOneAndUpdate(
      { _id: id, userId: new Types.ObjectId(userId) },
      { $set: updates },
      { new: true }
    );
  }
  
  async delete(id: string, userId: string): Promise<boolean> {
    const result = await ApiKey.deleteOne({ _id: id, userId: new Types.ObjectId(userId) });
    return result.deletedCount > 0;
  }
  
  async getDecryptedKey(id: string, userId: string): Promise<string | null> {
    const apiKey = await this.findById(id, userId);
    if (!apiKey) return null;
    
    return decrypt(apiKey.keyEncrypted);
  }
  
  async getKeyForUse(id: string, userId: string): Promise<ApiKeyWithDecrypted | null> {
    const apiKey = await this.findById(id, userId);
    if (!apiKey || !apiKey.isActive) return null;
    
    const key = await decrypt(apiKey.keyEncrypted);
    
    // Update last used timestamp
    await ApiKey.updateOne({ _id: id }, { $set: { lastUsedAt: new Date() } });
    
    return {
      ...apiKey.toObject(),
      key,
    };
  }
  
  async testKey(provider: string, key: string): Promise<{ valid: boolean; error?: string }> {
    // Test the key against the provider
    try {
      switch (provider) {
        case 'openrouter':
          return await this.testOpenRouter(key);
        case 'vertex':
          return await this.testVertex(key);
        case 'ollama':
          return await this.testOllama(key);
        case 'anthropic':
          return await this.testAnthropic(key);
        default:
          return { valid: false, error: 'Unknown provider' };
      }
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Test failed' };
    }
  }
  
  private async testOpenRouter(key: string): Promise<{ valid: boolean; error?: string }> {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` },
    });
    return { valid: response.ok, error: response.ok ? undefined : 'Invalid API key' };
  }
  
  private async testVertex(key: string): Promise<{ valid: boolean; error?: string }> {
    // Vertex uses service account, just validate format
    try {
      JSON.parse(key);
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid service account JSON' };
    }
  }
  
  private async testOllama(key: string): Promise<{ valid: boolean; error?: string }> {
    // Ollama typically doesn't use API keys, but custom endpoints might
    return { valid: true };
  }
  
  private async testAnthropic(key: string): Promise<{ valid: boolean; error?: string }> {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    });
    return { valid: response.ok, error: response.ok ? undefined : 'Invalid API key' };
  }
}

export const apiKeyService = new ApiKeyService();