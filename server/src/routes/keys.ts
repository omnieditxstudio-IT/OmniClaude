import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { apiKeyService } from '../services/key.service';
import { CreateApiKeyInput } from '@gateway/shared';

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(['openrouter', 'vertex', 'ollama', 'custom', 'anthropic']),
  key: z.string().min(1),
});

const UpdateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export async function keyRoutes(fastify: FastifyInstance) {
  // List user's API keys
  fastify.get('/api/keys', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const keys = await apiKeyService.findByUserId(user.id);
    
    return reply.send({
      keys: keys.map(k => ({
        id: k._id,
        name: k.name,
        provider: k.provider,
        keyHash: k.keyHash,
        isActive: k.isActive,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
      })),
    });
  });
  
  // Create new API key
  fastify.post('/api/keys', {
    schema: { body: CreateApiKeySchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const input = request.body as CreateApiKeyInput;
    
    const key = await apiKeyService.create(user.id, input);
    
    return reply.status(201).send({
      id: key._id,
      name: key.name,
      provider: key.provider,
      keyHash: key.keyHash,
      isActive: key.isActive,
      createdAt: key.createdAt,
    });
  });
  
  // Get API key details (masked)
  fastify.get('/api/keys/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const key = await apiKeyService.findById(id, user.id);
    if (!key) {
      return reply.status(404).send({ error: 'API key not found' });
    }
    
    return reply.send({
      id: key._id,
      name: key.name,
      provider: key.provider,
      keyHash: key.keyHash,
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    });
  });
  
  // Update API key
  fastify.patch('/api/keys/:id', {
    schema: { body: UpdateApiKeySchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const updates = request.body as { name?: string; isActive?: boolean };
    
    const key = await apiKeyService.update(id, user.id, updates);
    if (!key) {
      return reply.status(404).send({ error: 'API key not found' });
    }
    
    return reply.send({
      id: key._id,
      name: key.name,
      provider: key.provider,
      keyHash: key.keyHash,
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    });
  });
  
  // Delete API key
  fastify.delete('/api/keys/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const deleted = await apiKeyService.delete(id, user.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'API key not found' });
    }
    
    return reply.send({ success: true });
  });
  
  // Test API key
  fastify.post('/api/keys/:id/test', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const key = await apiKeyService.getDecryptedKey(id, user.id);
    if (!key) {
      return reply.status(404).send({ error: 'API key not found' });
    }
    
    const keyDoc = await apiKeyService.findById(id, user.id);
    if (!keyDoc) {
      return reply.status(404).send({ error: 'API key not found' });
    }
    
    const result = await apiKeyService.testKey(keyDoc.provider, key);
    
    return reply.send(result);
  });
}