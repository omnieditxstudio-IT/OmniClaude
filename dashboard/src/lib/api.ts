import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Request interceptor for auth
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          const response = await axios.post('/api/auth/refresh', { refreshToken });
          const { accessToken, refreshToken: newRefreshToken } = response.data;
          
          localStorage.setItem('access_token', accessToken);
          localStorage.setItem('refresh_token', newRefreshToken);
          
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch {
        // Refresh failed, logout
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;

// Types
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