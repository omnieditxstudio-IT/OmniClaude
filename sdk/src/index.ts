import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { z } from 'zod';

// ==================== Types ====================

export interface GatewayConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: 'google' | 'github';
  settings: {
    theme: 'light' | 'dark' | 'system';
    requestTimeout: number;
    defaultProvider?: string;
  };
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  provider: 'openrouter' | 'vertex' | 'ollama' | 'custom' | 'anthropic';
  keyHash: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

export interface CreateApiKeyInput {
  name: string;
  provider: 'openrouter' | 'vertex' | 'ollama' | 'custom' | 'anthropic';
  key: string;
}

export interface EndpointModel {
  id: string;
  name: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
  pricing?: {
    inputPer1k: number;
    outputPer1k: number;
    currency: 'USD';
  };
}

export interface Endpoint {
  id: string;
  name: string;
  provider: 'openrouter' | 'vertex' | 'ollama' | 'custom' | 'anthropic';
  baseUrl: string;
  apiKey: ApiKey | null;
  models: EndpointModel[];
  config: {
    timeout: number;
    maxRetries: number;
    headers?: Record<string, string>;
    ollamaOptions?: { numCtx?: number; temperature?: number };
  };
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEndpointInput {
  name: string;
  provider: 'openrouter' | 'vertex' | 'ollama' | 'custom' | 'anthropic';
  baseUrl: string;
  apiKeyId: string;
  config?: {
    timeout?: number;
    maxRetries?: number;
    headers?: Record<string, string>;
    ollamaOptions?: { numCtx?: number; temperature?: number };
  };
  priority?: number;
}

export interface ModelMappingEntry {
  claudeModelId: string;
  endpointId: string;
  providerModelId: string;
  overrides?: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    tools?: Array<{
      type: 'function';
      function: { name: string; description: string; parameters: Record<string, unknown> };
    }>;
  };
  fallbacks?: Array<{
    endpointId: string;
    providerModelId: string;
    priority: number;
  }>;
}

export interface ModelMapping {
  id: string;
  name: string;
  description?: string;
  mappings: ModelMappingEntry[];
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMappingInput {
  name: string;
  description?: string;
  mappings: ModelMappingEntry[];
}

export interface RequestLog {
  id: string;
  userId: string;
  mappingId?: string;
  claudeModelId: string;
  providerModelId: string;
  endpointId: string;
  requestType: 'messages' | 'completions' | 'embeddings';
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  statusCode: number;
  error?: string;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  retryPolicy: {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  createdAt: string;
}

export interface CreateWebhookInput {
  url: string;
  events: string[];
  active?: boolean;
  retryPolicy?: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
  };
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  avatar?: string;
  billingEmail?: string;
  settings: {
    allowPublicSignUp: boolean;
    defaultTeamId?: string;
    usageLimits?: {
      monthlyRequests?: number;
      monthlyTokens?: number;
      monthlyCostUsd?: number;
    };
    retentionDays?: number;
  };
  subscription?: {
    plan: 'free' | 'pro' | 'enterprise';
    status: 'active' | 'canceled' | 'past_due';
    currentPeriodEnd?: string;
  };
  createdAt: string;
}

export interface Team {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  members: Array<{
    userId: string;
    role: 'owner' | 'admin' | 'member';
    joinedAt: string;
  }>;
  settings: {
    isPrivate: boolean;
    allowedModels?: string[];
    allowedEndpoints?: string[];
    budgetLimit?: number;
  };
  createdAt: string;
}

// ==================== Error Classes ====================

export class GatewayError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export class AuthenticationError extends GatewayError {
  constructor(message = 'Authentication required') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends GatewayError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends GatewayError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends GatewayError {
  constructor(message: string, public validationErrors: any[]) {
    super(message, 400, validationErrors);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends GatewayError {
  constructor(message = 'Rate limit exceeded', public retryAfter?: number) {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

// ==================== Client ====================

export class GatewayClient {
  private client: AxiosInstance;
  private apiKey?: string;

  constructor(config: GatewayConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.apiKey = config.apiKey;

    // Request interceptor for auth
    this.client.interceptors.request.use((config) => {
      if (this.apiKey) {
        config.headers.Authorization = `Bearer ${this.apiKey}`;
      }
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          throw new AuthenticationError();
        }
        if (error.response?.status === 403) {
          throw new AuthorizationError();
        }
        if (error.response?.status === 404) {
          throw new NotFoundError();
        }
        if (error.response?.status === 422) {
          throw new ValidationError(
            'Validation failed',
            error.response.data.details || []
          );
        }
        if (error.response?.status === 429) {
          throw new RateLimitError(
            'Rate limit exceeded',
            error.response.headers['retry-after']
              ? parseInt(error.response.headers['retry-after'])
              : undefined
          );
        }
        throw new GatewayError(
          error.response?.data?.error || error.message,
          error.response?.status || 500,
          error.response?.data
        );
      }
    );
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  // ==================== Auth ====================
  async getCurrentUser(): Promise<User> {
    const response = await this.client.get('/api/auth/me');
    return response.data.user;
  }

  async logout(): Promise<void> {
    await this.client.post('/api/auth/logout');
  }

  async updateSettings(settings: Partial<User['settings']>): Promise<User> {
    const response = await this.client.patch('/api/auth/settings', settings);
    return response.data.user;
  }

  // ==================== API Keys ====================
  async listApiKeys(): Promise<ApiKey[]> {
    const response = await this.client.get('/api/keys');
    return response.data.keys;
  }

  async createApiKey(input: CreateApiKeyInput): Promise<ApiKey> {
    const response = await this.client.post('/api/keys', input);
    return response.data;
  }

  async getApiKey(id: string): Promise<ApiKey> {
    const response = await this.client.get(`/api/keys/${id}`);
    return response.data;
  }

  async updateApiKey(id: string, updates: Partial<Pick<ApiKey, 'name' | 'isActive'>>): Promise<ApiKey> {
    const response = await this.client.patch(`/api/keys/${id}`, updates);
    return response.data;
  }

  async deleteApiKey(id: string): Promise<void> {
    await this.client.delete(`/api/keys/${id}`);
  }

  async testApiKey(id: string): Promise<{ valid: boolean; error?: string }> {
    const response = await this.client.post(`/api/keys/${id}/test`);
    return response.data;
  }

  // ==================== Endpoints ====================
  async listEndpoints(): Promise<Endpoint[]> {
    const response = await this.client.get('/api/endpoints');
    return response.data.endpoints;
  }

  async createEndpoint(input: CreateEndpointInput): Promise<Endpoint> {
    const response = await this.client.post('/api/endpoints', input);
    return response.data;
  }

  async getEndpoint(id: string): Promise<Endpoint> {
    const response = await this.client.get(`/api/endpoints/${id}`);
    return response.data;
  }

  async updateEndpoint(id: string, updates: Partial<Endpoint>): Promise<Endpoint> {
    const response = await this.client.patch(`/api/endpoints/${id}`, updates);
    return response.data;
  }

  async deleteEndpoint(id: string): Promise<void> {
    await this.client.delete(`/api/endpoints/${id}`);
  }

  async syncEndpointModels(id: string): Promise<EndpointModel[]> {
    const response = await this.client.post(`/api/endpoints/${id}/sync-models`);
    return response.data.models;
  }

  async checkEndpointHealth(id: string): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const response = await this.client.get(`/api/endpoints/${id}/health`);
    return response.data;
  }

  // ==================== Model Mappings ====================
  async listMappings(): Promise<ModelMapping[]> {
    const response = await this.client.get('/api/mappings');
    return response.data.mappings;
  }

  async createMapping(input: CreateMappingInput): Promise<ModelMapping> {
    const response = await this.client.post('/api/mappings', input);
    return response.data;
  }

  async getMapping(id: string): Promise<ModelMapping> {
    const response = await this.client.get(`/api/mappings/${id}`);
    return response.data;
  }

  async updateMapping(id: string, updates: Partial<ModelMapping>): Promise<ModelMapping> {
    const response = await this.client.patch(`/api/mappings/${id}`, updates);
    return response.data;
  }

  async deleteMapping(id: string): Promise<void> {
    await this.client.delete(`/api/mappings/${id}`);
  }

  async setDefaultMapping(id: string): Promise<ModelMapping> {
    const response = await this.client.post(`/api/mappings/${id}/set-default`);
    return response.data;
  }

  async validateMapping(id: string): Promise<{ valid: boolean; results: any[] }> {
    const response = await this.client.post(`/api/mappings/${id}/validate`);
    return response.data;
  }

  async testMapping(id: string): Promise<{ success: boolean; response?: any; error?: string }> {
    const response = await this.client.post(`/api/mappings/${id}/test`);
    return response.data;
  }

  // ==================== Webhooks ====================
  async listWebhooks(): Promise<Webhook[]> {
    const response = await this.client.get('/api/webhooks');
    return response.data.webhooks;
  }

  async createWebhook(input: CreateWebhookInput): Promise<Webhook> {
    const response = await this.client.post('/api/webhooks', input);
    return response.data;
  }

  async getWebhook(id: string): Promise<Webhook> {
    const response = await this.client.get(`/api/webhooks/${id}`);
    return response.data;
  }

  async updateWebhook(id: string, updates: Partial<Webhook>): Promise<Webhook> {
    const response = await this.client.patch(`/api/webhooks/${id}`, updates);
    return response.data;
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.client.delete(`/api/webhooks/${id}`);
  }

  async testWebhook(id: string): Promise<{ success: boolean; response?: any; error?: string }> {
    const response = await this.client.post(`/api/webhooks/${id}/test`);
    return response.data;
  }

  async getWebhookDeliveries(webhookId: string, options?: { page?: number; limit?: number; status?: string }): Promise<{ deliveries: any[]; total: number }> {
    const response = await this.client.get(`/api/webhooks/${webhookId}/deliveries`, { params: options });
    return response.data;
  }

  async retryWebhookDelivery(deliveryId: string): Promise<{ success: boolean; error?: string }> {
    const response = await this.client.post(`/api/webhooks/deliveries/${deliveryId}/retry`);
    return response.data;
  }

  // ==================== Organizations ====================
  async listOrganizations(): Promise<Organization[]> {
    const response = await this.client.get('/api/organizations');
    return response.data.organizations;
  }

  async createOrganization(input: { name: string; slug: string; avatar?: string; billingEmail?: string }): Promise<Organization> {
    const response = await this.client.post('/api/organizations', input);
    return response.data.organization;
  }

  async getOrganization(id: string): Promise<Organization> {
    const response = await this.client.get(`/api/organizations/${id}`);
    return response.data.organization;
  }

  async updateOrganization(id: string, updates: Partial<Organization>): Promise<Organization> {
    const response = await this.client.patch(`/api/organizations/${id}`, updates);
    return response.data.organization;
  }

  async deleteOrganization(id: string): Promise<void> {
    await this.client.delete(`/api/organizations/${id}`);
  }

  async getOrganizationUsage(id: string, startDate?: Date, endDate?: Date): Promise<any> {
    const params: any = {};
    if (startDate) params.startDate = startDate.toISOString();
    if (endDate) params.endDate = endDate.toISOString();
    const response = await this.client.get(`/api/organizations/${id}/usage`, { params });
    return response.data;
  }

  async inviteOrganizationMember(orgId: string, email: string, role: 'admin' | 'member', teamId?: string): Promise<any> {
    const response = await this.client.post(`/api/organizations/${orgId}/members`, { email, role, teamId });
    return response.data;
  }

  // ==================== Teams ====================
  async listTeams(orgId?: string): Promise<Team[]> {
    const params: any = {};
    if (orgId) params.orgId = orgId;
    const response = await this.client.get('/api/organizations/teams', { params });
    return response.data.teams;
  }

  async createTeam(orgId: string, input: { name: string; description?: string; settings?: Team['settings'] }): Promise<Team> {
    const response = await this.client.post(`/api/organizations/${orgId}/teams`, input);
    return response.data.team;
  }

  async getTeam(id: string): Promise<Team> {
    const response = await this.client.get(`/api/teams/${id}`);
    return response.data.team;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team> {
    const response = await this.client.patch(`/api/teams/${id}`, updates);
    return response.data.team;
  }

  async deleteTeam(id: string): Promise<void> {
    await this.client.delete(`/api/teams/${id}`);
  }

  async addTeamMember(teamId: string, userId: string, role: 'admin' | 'member'): Promise<Team> {
    const response = await this.client.post(`/api/teams/${teamId}/members`, { userId, role });
    return response.data.team;
  }

  async removeTeamMember(teamId: string, userId: string): Promise<Team> {
    const response = await this.client.delete(`/api/teams/${teamId}/members/${userId}`);
    return response.data.team;
  }

  async updateTeamMemberRole(teamId: string, userId: string, role: 'admin' | 'member'): Promise<Team> {
    const response = await this.client.patch(`/api/teams/${teamId}/members/${userId}`, { role });
    return response.data.team;
  }

  async getTeamMembers(teamId: string): Promise<Team['members']> {
    const response = await this.client.get(`/api/teams/${teamId}/members`);
    return response.data.members;
  }

  // ==================== Analytics ====================
  async getAnalytics(options?: { timeRange?: '24h' | '7d' | '30d'; page?: number; limit?: number }): Promise<any> {
    const params: any = {};
    if (options?.timeRange) params.timeRange = options.timeRange;
    if (options?.page) params.page = options.page;
    if (options?.limit) params.limit = options.limit;
    const response = await this.client.get('/api/admin/analytics', { params });
    return response.data;
  }

  async getLogs(options?: { page?: number; limit?: number; statusCode?: number; userId?: string }): Promise<PaginatedResponse<RequestLog>> {
    const response = await this.client.get('/api/admin/logs', { params: options });
    return response.data;
  }

  // ==================== Health ====================
  async healthCheck(): Promise<{ status: string; timestamp: string; uptime: number; database: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }

  async detailedHealthCheck(): Promise<any> {
    const response = await this.client.get('/health/detailed');
    return response.data;
  }
}

// ==================== Factory ====================

export function createGatewayClient(config: GatewayConfig): GatewayClient {
  return new GatewayClient(config);
}

// ==================== Default Export ====================

export default GatewayClient;