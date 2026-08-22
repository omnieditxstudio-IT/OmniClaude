import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { mappingService } from '../services/mapping.service';
import { CreateMappingInput } from '@gateway/shared';

const CreateMappingSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  mappings: z.array(z.object({
    claudeModelId: z.string().min(1),
    endpointId: z.string(),
    providerModelId: z.string().min(1),
    overrides: z.object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).max(100000).optional(),
      systemPrompt: z.string().optional(),
      tools: z.array(z.object({
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          description: z.string(),
          parameters: z.record(z.unknown()),
        }),
      })).optional(),
    }).optional(),
    fallbacks: z.array(z.object({
      endpointId: z.string(),
      providerModelId: z.string(),
      priority: z.number().min(0),
    })).optional(),
  })).min(1),
});

const UpdateMappingSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  mappings: z.array(z.object({
    claudeModelId: z.string().min(1),
    endpointId: z.string(),
    providerModelId: z.string().min(1),
    overrides: z.object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).max(100000).optional(),
      systemPrompt: z.string().optional(),
      tools: z.array(z.object({
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          description: z.string(),
          parameters: z.record(z.unknown()),
        }),
      })).optional(),
    }).optional(),
    fallbacks: z.array(z.object({
      endpointId: z.string(),
      providerModelId: z.string(),
      priority: z.number().min(0),
    })).optional(),
  })).min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function mappingRoutes(fastify: FastifyInstance) {
  // List user's mappings
  fastify.get('/api/mappings', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const mappings = await mappingService.findByUserId(user.id);
    
    return reply.send({
      mappings: mappings.map(m => ({
        id: m._id,
        name: m.name,
        description: m.description,
        mappings: m.mappings,
        isActive: m.isActive,
        isDefault: m.isDefault,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
    });
  });
  
  // Create mapping
  fastify.post('/api/mappings', {
    schema: { body: CreateMappingSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const input = request.body as CreateMappingInput;
    
    // Validate each mapping entry
    for (const mapping of input.mappings) {
      const validation = await mappingService.validateMapping(user.id, mapping);
      if (!validation.valid) {
        return reply.status(400).send({ 
          error: 'Invalid mapping', 
          details: validation.errors 
        });
      }
    }
    
    const mapping = await mappingService.create(user.id, input);
    
    return reply.status(201).send({
      id: mapping._id,
      name: mapping.name,
      description: mapping.description,
      mappings: mapping.mappings,
      isActive: mapping.isActive,
      isDefault: mapping.isDefault,
      createdAt: mapping.createdAt,
    });
  });
  
  // Get mapping details
  fastify.get('/api/mappings/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const mapping = await mappingService.findById(id, user.id);
    if (!mapping) {
      return reply.status(404).send({ error: 'Mapping not found' });
    }
    
    return reply.send({
      id: mapping._id,
      name: mapping.name,
      description: mapping.description,
      mappings: mapping.mappings,
      isActive: mapping.isActive,
      isDefault: mapping.isDefault,
      createdAt: mapping.createdAt,
      updatedAt: mapping.updatedAt,
    });
  });
  
  // Update mapping
  fastify.patch('/api/mappings/:id', {
    schema: { body: UpdateMappingSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const updates = request.body;
    
    // Validate mappings if provided
    if (updates.mappings) {
      for (const mapping of updates.mappings) {
        const validation = await mappingService.validateMapping(user.id, mapping);
        if (!validation.valid) {
          return reply.status(400).send({ 
            error: 'Invalid mapping', 
            details: validation.errors 
          });
        }
      }
    }
    
    const mapping = await mappingService.update(id, user.id, updates);
    if (!mapping) {
      return reply.status(404).send({ error: 'Mapping not found' });
    }
    
    return reply.send({
      id: mapping._id,
      name: mapping.name,
      description: mapping.description,
      mappings: mapping.mappings,
      isActive: mapping.isActive,
      isDefault: mapping.isDefault,
      createdAt: mapping.createdAt,
      updatedAt: mapping.updatedAt,
    });
  });
  
  // Delete mapping
  fastify.delete('/api/mappings/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const deleted = await mappingService.delete(id, user.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Mapping not found' });
    }
    
    return reply.send({ success: true });
  });
  
  // Set as default mapping
  fastify.post('/api/mappings/:id/set-default', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const mapping = await mappingService.setDefault(id, user.id);
    if (!mapping) {
      return reply.status(404).send({ error: 'Mapping not found' });
    }
    
    return reply.send({
      id: mapping._id,
      name: mapping.name,
      isDefault: mapping.isDefault,
    });
  });
  
  // Validate mapping
  fastify.post('/api/mappings/:id/validate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const mapping = await mappingService.findById(id, user.id);
    if (!mapping) {
      return reply.status(404).send({ error: 'Mapping not found' });
    }
    
    const results = [];
    for (const entry of mapping.mappings) {
      const validation = await mappingService.validateMapping(user.id, entry);
      results.push({ entry, ...validation });
    }
    
    const allValid = results.every(r => r.valid);
    
    return reply.send({ valid: allValid, results });
  });
  
  // Test mapping
  fastify.post('/api/mappings/:id/test', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const result = await mappingService.testMapping(user.id, id);
    
    return reply.send(result);
  });
}