import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';

export class GatewayClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.client = axios.create({
      baseURL: `${this.baseUrl}/api`,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
    
    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      const token = vscode.workspace.getConfiguration('gateway').get<string>('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  async healthCheck(): Promise<any> {
    const response = await this.client.get('/health');
    return response.data;
  }

  async getCurrentUser(): Promise<any> {
    const response = await this.client.get('/auth/me');
    return response.data.user;
  }

  async getLogs(params: { page?: number; limit?: number; statusCode?: number } = {}): Promise<any[]> {
    const response = await this.client.get('/admin/logs', { params });
    return response.data.logs || [];
  }

  async getAnalytics(params: { timeRange?: string } = {}): Promise<any> {
    const response = await this.client.get('/admin/analytics', { params });
    return response.data;
  }

  async getEndpoints(): Promise<any[]> {
    const response = await this.client.get('/endpoints');
    return response.data.endpoints || [];
  }

  async getMappings(): Promise<any[]> {
    const response = await this.client.get('/mappings');
    return response.data.mappings || [];
  }

  async getKeys(): Promise<any[]> {
    const response = await this.client.get('/keys');
    return response.data.keys || [];
  }

  async testMapping(mappingId: string): Promise<any> {
    const response = await this.client.post(`/mappings/${mappingId}/test`);
    return response.data;
  }

  async testEndpoint(endpointId: string): Promise<any> {
    const response = await this.client.post(`/endpoints/${endpointId}/health`);
    return response.data;
  }

  async stop(): Promise<void> {
    await this.client.post('/admin/shutdown');
  }
}