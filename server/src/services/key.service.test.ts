import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiKeyService } from '../services/key.service';
import { ApiKey } from '../models';
import { CreateApiKeyInput } from '@gateway/shared';

vi.mock('../models');
vi.mock('../services/encryption');

describe('ApiKeyService', () => {
  const mockUserId = 'test-user-id';
  const mockApiKeyId = 'test-key-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create an API key with encrypted value', async () => {
      const input: CreateApiKeyInput = {
        name: 'Test Key',
        provider: 'openrouter',
        key: 'sk-test123456789',
      };

      const mockCreatedKey = {
        _id: mockApiKeyId,
        userId: mockUserId,
        name: input.name,
        provider: input.provider,
        keyEncrypted: 'encrypted:sk-test123456789',
        keyHash: '6789',
        isActive: true,
        createdAt: new Date(),
        toObject: () => ({
          _id: mockApiKeyId,
          userId: mockUserId,
          name: input.name,
          provider: input.provider,
          keyEncrypted: 'encrypted:sk-test123456789',
          keyHash: '6789',
          isActive: true,
          createdAt: new Date(),
        }),
      };

      (ApiKey.create as any).mockResolvedValue(mockCreatedKey);

      const result = await apiKeyService.create(mockUserId, input);

      expect(ApiKey.create).toHaveBeenCalledWith({
        userId: mockUserId,
        name: input.name,
        provider: input.provider,
        keyEncrypted: 'encrypted:sk-test123456789',
        keyHash: '6789',
        isActive: true,
      });
      expect(result).toEqual(mockCreatedKey);
    });

    it('should generate key hash from last 4 characters', async () => {
      const input: CreateApiKeyInput = {
        name: 'Test Key',
        provider: 'openrouter',
        key: 'sk-abcdefghijklmnop',
      };

      (ApiKey.create as any).mockResolvedValue({});

      await apiKeyService.create(mockUserId, input);

      expect(ApiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({ keyHash: 'mnop' })
      );
    });
  });

  describe('findByUserId', () => {
    it('should return user API keys sorted by creation date', async () => {
      const mockKeys = [
        { _id: 'key-1', name: 'Key 1', createdAt: new Date('2024-01-02') },
        { _id: 'key-2', name: 'Key 2', createdAt: new Date('2024-01-01') },
      ];

      (ApiKey.find as any).mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(mockKeys),
        }),
      });

      const result = await apiKeyService.findByUserId(mockUserId);

      expect(result).toEqual(mockKeys);
      expect(ApiKey.find).toHaveBeenCalledWith({ userId: mockUserId });
    });
  });

  describe('getDecryptedKey', () => {
    it('should return decrypted key for valid key', async () => {
      const mockKey = {
        _id: mockApiKeyId,
        keyEncrypted: 'encrypted:sk-secret123',
      };

      (ApiKey.findOne as any).mockResolvedValue(mockKey);
      const { decrypt } = await import('../services/encryption');
      (decrypt as any).mockResolvedValue('sk-secret123');

      const result = await apiKeyService.getDecryptedKey(mockApiKeyId, mockUserId);

      expect(result).toBe('sk-secret123');
    });

    it('should return null for non-existent key', async () => {
      (ApiKey.findOne as any).mockResolvedValue(null);

      const result = await apiKeyService.getDecryptedKey('non-existent', mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('testKey', () => {
    it('should test OpenRouter key validity', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      const result = await apiKeyService.testKey('openrouter', 'sk-valid-key');

      expect(result.valid).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer sk-valid-key' },
        })
      );
    });

    it('should validate Vertex service account JSON', async () => {
      const validJson = JSON.stringify({ project_id: 'test', private_key: 'key' });

      const result = await apiKeyService.testKey('vertex', validJson);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid Vertex JSON', async () => {
      const result = await apiKeyService.testKey('vertex', 'not-json');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid service account JSON');
    });
  });

  describe('delete', () => {
    it('should delete key and return true', async () => {
      (ApiKey.deleteOne as any).mockResolvedValue({ deletedCount: 1 });

      const result = await apiKeyService.delete(mockApiKeyId, mockUserId);

      expect(result).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      (ApiKey.deleteOne as any).mockResolvedValue({ deletedCount: 0 });

      const result = await apiKeyService.delete('non-existent', mockUserId);

      expect(result).toBe(false);
    });
  });
});