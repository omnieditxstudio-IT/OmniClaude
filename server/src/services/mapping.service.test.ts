import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mappingService } from '../services/mapping.service';
import { ModelMapping, Endpoint } from '../models';

vi.mock('../models');
vi.mock('../services/endpoint.service');
vi.mock('../services/key.service');
vi.mock('../services/translation.service');

describe('MappingService', () => {
  const mockUserId = 'test-user-id';
  const mockMappingId = 'test-mapping-id';
  const mockEndpointId = 'test-endpoint-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create mapping and unset other defaults', async () => {
      const input = {
        name: 'Test Mapping',
        mappings: [{
          claudeModelId: 'claude-3-opus',
          endpointId: mockEndpointId,
          providerModelId: 'deepseek/deepseek-coder',
        }],
      };

      (ModelMapping.updateMany as any).mockResolvedValue({});
      (ModelMapping.create as any).mockResolvedValue({
        _id: mockMappingId,
        userId: mockUserId,
        ...input,
        isActive: true,
        isDefault: true,
      });

      const result = await mappingService.create(mockUserId, input);

      expect(ModelMapping.updateMany).toHaveBeenCalledWith(
        { userId: mockUserId, isDefault: true },
        { $set: { isDefault: false } }
      );
      expect(result.isDefault).toBe(true);
    });
  });

  describe('findDefault', () => {
    it('should return default active mapping', async () => {
      const mockMapping = {
        _id: mockMappingId,
        userId: mockUserId,
        isDefault: true,
        isActive: true,
      };

      (ModelMapping.findOne as any).mockResolvedValue(mockMapping);

      const result = await mappingService.findDefault(mockUserId);

      expect(result).toEqual(mockMapping);
    });
  });

  describe('validateMapping', () => {
    it('should return valid for correct mapping', async () => {
      const mockEndpoint = {
        _id: mockEndpointId,
        isActive: true,
        models: [{ id: 'deepseek/deepseek-coder', name: 'DeepSeek Coder' }],
      };

      (Endpoint.findOne as any).mockResolvedValue(mockEndpoint);

      const mapping = {
        claudeModelId: 'claude-3-opus',
        endpointId: mockEndpointId,
        providerModelId: 'deepseek/deepseek-coder',
        fallbacks: [],
      };

      const result = await mappingService.validateMapping(mockUserId, mapping);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for non-existent endpoint', async () => {
      (Endpoint.findOne as any).mockResolvedValue(null);

      const mapping = {
        claudeModelId: 'claude-3-opus',
        endpointId: 'non-existent',
        providerModelId: 'model',
      };

      const result = await mappingService.validateMapping(mockUserId, mapping);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Endpoint non-existent not found');
    });

    it('should warn for inactive endpoint', async () => {
      const mockEndpoint = { _id: mockEndpointId, isActive: false, models: [] };
      (Endpoint.findOne as any).mockResolvedValue(mockEndpoint);

      const mapping = {
        claudeModelId: 'claude-3-opus',
        endpointId: mockEndpointId,
        providerModelId: 'model',
      };

      const result = await mappingService.validateMapping(mockUserId, mapping);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(`Endpoint ${mockEndpointId} is inactive`);
    });
  });

  describe('setDefault', () => {
    it('should unset current default and set new one', async () => {
      (ModelMapping.updateMany as any).mockResolvedValue({});
      (ModelMapping.findOneAndUpdate as any).mockResolvedValue({
        _id: mockMappingId,
        isDefault: true,
      });

      const result = await mappingService.setDefault(mockMappingId, mockUserId);

      expect(ModelMapping.updateMany).toHaveBeenCalledWith(
        { userId: mockUserId, isDefault: true },
        { $set: { isDefault: false } }
      );
      expect(result.isDefault).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete mapping and promote another to default', async () => {
      const mockMapping = { _id: mockMappingId, isDefault: true };
      (ModelMapping.findOne as any).mockResolvedValue(mockMapping);
      (ModelMapping.deleteOne as any).mockResolvedValue({ deletedCount: 1 });
      (ModelMapping.findOne as any).mockResolvedValueOnce(mockMapping)
        .mockResolvedValueOnce({ _id: 'another-id', isActive: true });
      (ModelMapping.updateOne as any).mockResolvedValue({});

      const result = await mappingService.delete(mockMappingId, mockUserId);

      expect(result).toBe(true);
      expect(ModelMapping.updateOne).toHaveBeenCalledWith(
        { _id: 'another-id' },
        { $set: { isDefault: true } }
      );
    });
  });

  describe('resolveModel', () => {
    it('should resolve model mapping with endpoint and key', async () => {
      const mockMapping = {
        mappings: [{
          claudeModelId: 'claude-3-opus',
          endpointId: mockEndpointId,
          providerModelId: 'deepseek/deepseek-coder',
        }],
      };
      const mockEndpoint = { _id: mockEndpointId, isActive: true, apiKeyId: 'key-id' };

      (ModelMapping.findOne as any).mockResolvedValue(mockMapping);
      const { endpointService } = await import('../services/endpoint.service');
      (endpointService.findById as any).mockResolvedValue(mockEndpoint);
      const { apiKeyService } = await import('../services/key.service');
      (apiKeyService.getDecryptedKey as any).mockResolvedValue('sk-decrypted');

      const result = await mappingService.resolveModel(mockUserId, 'claude-3-opus');

      expect(result).toEqual({
        entry: mockMapping.mappings[0],
        endpoint: mockEndpoint,
        apiKey: 'sk-decrypted',
      });
    });

    it('should return null for unknown model', async () => {
      (ModelMapping.findOne as any).mockResolvedValue({
        mappings: [{ claudeModelId: 'other-model' }],
      });

      const result = await mappingService.resolveModel(mockUserId, 'unknown-model');

      expect(result).toBeNull();
    });
  });

  describe('getFallbackChain', () => {
    it('should return sorted fallback chain', async () => {
      const mockMapping = {
        mappings: [{
          claudeModelId: 'claude-3-opus',
          fallbacks: [
            { endpointId: 'ep-1', providerModelId: 'model-1', priority: 2 },
            { endpointId: 'ep-2', providerModelId: 'model-2', priority: 1 },
          ],
        }],
      };
      const mockEndpoints = [
        { _id: 'ep-1', isActive: true, apiKeyId: 'key-1' },
        { _id: 'ep-2', isActive: true, apiKeyId: 'key-2' },
      ];

      (ModelMapping.findOne as any).mockResolvedValue(mockMapping);
      const { endpointService } = await import('../services/endpoint.service');
      (endpointService.findById as any)
        .mockResolvedValueOnce(mockEndpoints[0])
        .mockResolvedValueOnce(mockEndpoints[1]);
      const { apiKeyService } = await import('../services/key.service');
      (apiKeyService.getDecryptedKey as any)
        .mockResolvedValueOnce('sk-key-1')
        .mockResolvedValueOnce('sk-key-2');

      const result = await mappingService.getFallbackChain(mockUserId, 'claude-3-opus');

      expect(result).toHaveLength(2);
      expect(result[0].providerModelId).toBe('model-2'); // priority 1 first
      expect(result[1].providerModelId).toBe('model-1'); // priority 2 second
    });
  });
});