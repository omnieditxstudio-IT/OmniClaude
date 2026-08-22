import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildApp } from '../index';
import { User, ApiKey, Endpoint, ModelMapping } from '../models';

vi.mock('../config/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
    handler: vi.fn(),
  },
  authPlugin: vi.fn((app) => {
    app.decorateRequest('auth', { user: null, session: null });
    app.addHook('preHandler', async (request) => {
      // Mock auth for testing
      request.auth = {
        user: { id: 'test-user-id', email: 'test@example.com' },
        session: { id: 'session-id' },
      };
    });
  }),
  requireAuth: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'test-user-id' })),
}));

vi.mock('../services/key.service', () => ({
  apiKeyService: {
    findByUserId: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getDecryptedKey: vi.fn(),
    testKey: vi.fn(),
  },
}));

vi.mock('../services/endpoint.service', () => ({
  endpointService: {
    findByUserId: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    syncModels: vi.fn(),
    healthCheck: vi.fn(),
  },
}));

vi.mock('../services/mapping.service', () => ({
  mappingService: {
    findByUserId: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setDefault: vi.fn(),
    validateMapping: vi.fn(),
    testMapping: vi.fn(),
  },
}));

describe('API Routes Integration', () => {
  let app: any;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/keys', () => {
    it('should return user API keys', async () => {
      const { apiKeyService } = await import('../services/key.service');
      (apiKeyService.findByUserId as any).mockResolvedValue([
        { _id: 'key-1', name: 'Key 1', provider: 'openrouter', keyHash: '1234', isActive: true },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/keys',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.keys).toHaveLength(1);
    });
  });

  describe('POST /api/keys', () => {
    it('should create new API key', async () => {
      const { apiKeyService } = await import('../services/key.service');
      (apiKeyService.create as any).mockResolvedValue({
        _id: 'new-key-id',
        name: 'New Key',
        provider: 'openrouter',
        keyHash: '5678',
        isActive: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/keys',
        payload: {
          name: 'New Key',
          provider: 'openrouter',
          key: 'sk-newkey12345678',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('New Key');
    });

    it('should reject invalid provider', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/keys',
        payload: {
          name: 'New Key',
          provider: 'invalid',
          key: 'sk-key',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/endpoints', () => {
    it('should return user endpoints with populated API keys', async () => {
      const { endpointService } = await import('../services/endpoint.service');
      (endpointService.findByUserId as any).mockResolvedValue([
        {
          _id: 'ep-1',
          name: 'Endpoint 1',
          provider: 'openrouter',
          baseUrl: 'https://api.openrouter.ai/v1',
          apiKeyId: { _id: 'key-1', name: 'Key 1', provider: 'openrouter', keyHash: '1234' },
          models: [],
          isActive: true,
        },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/endpoints',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.endpoints).toHaveLength(1);
    });
  });

  describe('POST /api/endpoints', () => {
    it('should create endpoint with valid API key', async () => {
      const { apiKeyService } = await import('../services/key.service');
      const { endpointService } = await import('../services/endpoint.service');

      (apiKeyService.findById as any).mockResolvedValue({ _id: 'key-1' });
      (endpointService.create as any).mockResolvedValue({
        _id: 'ep-1',
        name: 'New Endpoint',
        provider: 'openrouter',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKeyId: 'key-1',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/endpoints',
        payload: {
          name: 'New Endpoint',
          provider: 'openrouter',
          baseUrl: 'https://api.openrouter.ai/v1',
          apiKeyId: 'key-1',
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should reject invalid API key', async () => {
      const { apiKeyService } = await import('../services/key.service');
      (apiKeyService.findById as any).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/endpoints',
        payload: {
          name: 'New Endpoint',
          provider: 'openrouter',
          baseUrl: 'https://api.openrouter.ai/v1',
          apiKeyId: 'invalid-key',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/mappings', () => {
    it('should create mapping with validated entries', async () => {
      const { mappingService } = await import('../services/mapping.service');
      (mappingService.validateMapping as any).mockResolvedValue({ valid: true, errors: [], warnings: [] });
      (mappingService.create as any).mockResolvedValue({
        _id: 'mapping-1',
        name: 'Test Mapping',
        mappings: [{ claudeModelId: 'claude-3-opus', endpointId: 'ep-1', providerModelId: 'model' }],
        isDefault: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/mappings',
        payload: {
          name: 'Test Mapping',
          mappings: [{
            claudeModelId: 'claude-3-opus',
            endpointId: 'ep-1',
            providerModelId: 'deepseek/deepseek-coder',
          }],
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should reject invalid mapping entries', async () => {
      const { mappingService } = await import('../services/mapping.service');
      (mappingService.validateMapping as any).mockResolvedValue({
        valid: false,
        errors: ['Endpoint not found'],
        warnings: [],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/mappings',
        payload: {
          name: 'Test Mapping',
          mappings: [{
            claudeModelId: 'claude-3-opus',
            endpointId: 'invalid-ep',
            providerModelId: 'model',
          }],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /v1/messages (Proxy)', () => {
    it('should return 404 for unmapped model', async () => {
      const { mappingService } = await import('../services/mapping.service');
      (mappingService.resolveModel as any).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/messages',
        payload: {
          model: 'claude-3-opus',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 100,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should forward request to translation service', async () => {
      const { mappingService } = await import('../services/mapping.service');
      const { translationService } = await import('../services/translation.service');

      (mappingService.resolveModel as any).mockResolvedValue({
        entry: { claudeModelId: 'claude-3-opus', endpointId: 'ep-1', providerModelId: 'model' },
        endpoint: { _id: 'ep-1', provider: 'openrouter', baseUrl: 'https://api.openrouter.ai/v1', config: {} },
        apiKey: 'sk-test',
      });
      (translationService.translateAndForward as any).mockResolvedValue({
        response: {
          id: 'msg-123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-3-opus',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        },
        usage: { inputTokens: 10, outputTokens: 20 },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/messages',
        payload: {
          model: 'claude-3-opus',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 100,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.content[0].text).toBe('Hello!');
    });
  });
});