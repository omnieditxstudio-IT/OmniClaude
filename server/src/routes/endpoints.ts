import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { endpointService } from '../services/endpoint.service';
import { apiKeyService } from '../services/key.service';
import { CreateEndpointInput } from '@gateway/shared';

const CreateEndpointSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(['openrouter', 'vertex', 'ollama', 'custom', 'anthropic']),
  baseUrl: z.string().url(),
  apiKeyId: z.string(),
  config: z.object({
    timeout: z.number().min(1000).max(300000).default(60000),
    maxRetries: z.number().min(0).max(10).default(3),
    headers: z.record(z.string()).optional(),
    ollamaOptions: z.object({
      numCtx: z.number().optional(),
      temperature: z.number().optional(),
    }).optional(),
  }).default({}),
  priority: z.number().min(0).default(0),
});

const UpdateEndpointSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional(),
  config: z.object({
    timeout: z.number().min(1000).max(300000).optional(),
    maxRetries: z.number().min(0).max(10).optional(),
    headers: z.record(z.string()).optional(),
    ollamaOptions: z.object({
      numCtx: z.number().optional(),
      temperature: z.number().optional(),
    }).optional(),
  }).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().min(0).optional(),
});

export async function endpointRoutes(fastify: FastifyInstance) {
  // List user's endpoints
  fastify.get('/api/endpoints', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const endpoints = await endpointService.findByUserId(user.id);
    
    return reply.send({
      endpoints: endpoints.map(e => ({
        id: e._id,
        name: e.name,
        provider: e.provider,
        baseUrl: e.baseUrl,
        apiKey: e.apiKeyId ? {
          id: e.apiKeyId._id,
          name: e.apiKeyId.name,
          provider: e.apiKeyId.provider,
          keyHash: e.apiKeyId.keyHash,
        } : null,
        models: e.models,
        config: e.config,
        isActive: e.isActive,
        priority: e.priority,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
    });
  });
  
  // Create endpoint
  fastify.post('/api/endpoints', {
    schema: { body: CreateEndpointSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const input = request.body as CreateEndpointInput;
    
    // Verify API key belongs to user
    const apiKey = await apiKeyService.findById(input.apiKeyId, user.id);
    if (!apiKey) {
      return reply.status(400).send({ error: 'Invalid API key' });
    }
    
    const endpoint = await endpointService.create(user.id, input);
    
    return reply.status(201).send({
      id: endpoint._id,
      name: endpoint.name,
      provider: endpoint.provider,
      baseUrl: endpoint.baseUrl,
      apiKeyId: endpoint.apiKeyId,
      models: endpoint.models,
      config: endpoint.config,
      isActive: endpoint.isActive,
      priority: endpoint.priority,
      createdAt: endpoint.createdAt,
    });
  });
  
  // Get endpoint details
  fastify.get('/api/endpoints/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const endpoint = await endpointService.findById(id, user.id);
    if (!endpoint) {
      return reply.status(404).send({ error: 'Endpoint not found' });
    }
    
    return reply.send({
      id: endpoint._id,
      name: endpoint.name,
      provider: endpoint.provider,
      baseUrl: endpoint.baseUrl,
      apiKeyId: endpoint.apiKeyId,
      models: endpoint.models,
      config: endpoint.config,
      isActive: endpoint.isActive,
      priority: endpoint.priority,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    });
  });
  
  // Update endpoint
  fastify.patch('/api/endpoints/:id', {
    schema: { body: UpdateEndpointSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const updates = request.body;
    
    const endpoint = await endpointService.update(id, user.id, updates);
    if (!endpoint) {
      return reply.status(404).send({ error: 'Endpoint not found' });
    }
    
    return reply.send({
      id: endpoint._id,
      name: endpoint.name,
      provider: endpoint.provider,
      baseUrl: endpoint.baseUrl,
      apiKeyId: endpoint.apiKeyId,
      models: endpoint.models,
      config: endpoint.config,
      isActive: endpoint.isActive,
      priority: endpoint.priority,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    });
  });
  
  // Delete endpoint
  fastify.delete('/api/endpoints/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const deleted = await endpointService.delete(id, user.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Endpoint not found' });
    }
    
    return reply.send({ success: true });
  });
  
  // Sync models from provider
  fastify.post('/api/endpoints/:id/sync-models', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const endpoint = await endpointService.findById(id, user.id);
    if (!endpoint) {
      return reply.status(404).send({ error: 'Endpoint not found' });
    }
    
    const apiKey = await apiKeyService.getDecryptedKey(endpoint.apiKeyId.toString(), user.id);
    if (!apiKey) {
      return reply.status(400).send({ error: 'API key not found or invalid' });
    }
    
    const models = await endpointService.syncModels(id, user.id, apiKey);
    
    return reply.send({ models });
  });
  
  // Health check endpoint
  fastify.get('/api/endpoints/:id/health', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const endpoint = await endpointService.findById(id, user.id);
    if (!endpoint) {
      return reply.status(404).send({ error: 'Endpoint not found' });
    }
    
    const apiKey = await apiKeyService.getDecryptedKey(endpoint.apiKeyId.toString(), user.id);
    if (!apiKey) {
      return reply.status(400).send({ error: 'API key not found or invalid' });
    }
    
    const health = await endpointService.healthCheck(id, user.id, apiKey);
    
    return reply.send(health);
  });
}