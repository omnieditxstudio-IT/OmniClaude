import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear all collections before each test
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

// Mock external services
vi.mock('../services/encryption', () => ({
  encrypt: vi.fn((text: string) => Promise.resolve(`encrypted:${text}`)),
  decrypt: vi.fn((text: string) => Promise.resolve(text.replace('encrypted:', ''))),
  getKeyHash: vi.fn((key: string) => key.slice(-4)),
  generateEncryptionKey: vi.fn(() => 'test-key-base64=='),
}));

vi.mock('../services/translation.service', () => ({
  translationService: {
    translateAndForward: vi.fn(),
    translateAndForwardStream: vi.fn(),
  },
}));

vi.mock('../services/python-router.client', () => ({
  pythonRouterClient: {
    routeRequest: vi.fn(),
    checkHealth: vi.fn(),
  },
}));

// Mock Better-Auth
vi.mock('../config/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
      revokeSession: vi.fn(),
    },
    handler: vi.fn(),
  },
  authPlugin: vi.fn(),
  requireAuth: vi.fn(),
  requireOwnership: vi.fn(),
  getCurrentUser: vi.fn(),
  getCurrentSession: vi.fn(),
  Session: {} as any,
  UserType: {} as any,
}));

// Global test utilities
global.testUtils = {
  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    provider: 'google',
    providerId: 'google-123',
    settings: { theme: 'system', requestTimeout: 60000 },
    ...overrides,
  }),
  createMockApiKey: (overrides = {}) => ({
    _id: 'test-key-id',
    userId: 'test-user-id',
    name: 'Test Key',
    provider: 'openrouter',
    keyEncrypted: 'encrypted:sk-test',
    keyHash: 'test',
    isActive: true,
    ...overrides,
  }),
  createMockEndpoint: (overrides = {}) => ({
    _id: 'test-endpoint-id',
    userId: 'test-user-id',
    name: 'Test Endpoint',
    provider: 'openrouter',
    baseUrl: 'https://api.openrouter.ai/v1',
    apiKeyId: 'test-key-id',
    models: [],
    config: { timeout: 60000, maxRetries: 3 },
    isActive: true,
    priority: 0,
    ...overrides,
  }),
  createMockMapping: (overrides = {}) => ({
    _id: 'test-mapping-id',
    userId: 'test-user-id',
    name: 'Test Mapping',
    mappings: [{
      claudeModelId: 'claude-3-opus',
      endpointId: 'test-endpoint-id',
      providerModelId: 'deepseek/deepseek-coder',
    }],
    isActive: true,
    isDefault: true,
    ...overrides,
  }),
};