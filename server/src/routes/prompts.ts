import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { promptTemplateService, promptOptimizer, PromptOptimizationConfig, BUILTIN_TEMPLATES, initializeBuiltinTemplates } from '../services/prompt.service';
import { PromptTemplate } from '../models';

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.enum(['coding', 'analysis', 'writing', 'reasoning', 'custom']),
  template: z.string().min(1),
  variables: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    required: z.boolean().default(true),
    default: z.any().optional(),
    description: z.string().optional(),
  })).optional(),
  modelOverrides: z.record(z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(100000).optional(),
    topP: z.number().min(0).max(1).optional(),
    systemPrompt: z.string().optional(),
  })).optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  organizationId: z.string().optional(),
  teamId: z.string().optional(),
});

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  template: z.string().min(1).optional(),
  variables: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    required: z.boolean().default(true),
    default: z.any().optional(),
    description: z.string().optional(),
  })).optional(),
  modelOverrides: z.record(z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(100000).optional(),
    topP: z.number().min(0).max(1).optional(),
    systemPrompt: z.string().optional(),
  })).optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
});

const OptimizePromptSchema = z.object({
  prompt: z.string().min(1),
  config: z.object({
    targetModel: z.string().optional(),
    goals: z.array(z.enum(['reduce_tokens', 'improve_quality', 'add_structure', 'add_examples', 'reduce_ambiguity'])).default(['improve_quality']),
    preserveSections: z.array(z.string()).optional(),
    maxTokens: z.number().min(1).max(100000).optional(),
  }).optional(),
});

const RenderTemplateSchema = z.object({
  variables: z.record(z.any()),
});

export async function promptRoutes(fastify: FastifyInstance) {
  // Initialize built-in templates on startup
  fastify.addHook('onReady', async () => {
    // This would typically be done during setup
    // await initializeBuiltinTemplates('system-user-id');
  });

  // List templates
  fastify.get('/api/prompts/templates', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { category, isPublic, tags, search, organizationId, teamId } = request.query as {
      category?: string;
      isPublic?: string;
      tags?: string;
      search?: string;
      organizationId?: string;
      teamId?: string;
    };

    const templates = await promptTemplateService.listTemplates({
      category,
      isPublic: isPublic === 'true' ? true : isPublic === 'false' ? false : undefined,
      tags: tags?.split(','),
      search,
      organizationId,
      teamId,
      userId: user.id,
    });

    return reply.send({ templates });
  });

  // Get built-in templates
  fastify.get('/api/prompts/templates/builtin', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    return reply.send({ templates: BUILTIN_TEMPLATES });
  });

  // Create template
  fastify.post('/api/prompts/templates', {
    schema: { body: CreateTemplateSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const input = request.body as z.infer<typeof CreateTemplateSchema>;

    const template = await promptTemplateService.createTemplate({
      ...input,
      createdBy: user.id,
    });

    return reply.status(201).send({ template });
  });

  // Get template
  fastify.get('/api/prompts/templates/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const template = await promptTemplateService.getTemplate(id);
    if (!template) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    return reply.send({ template });
  });

  // Update template
  fastify.patch('/api/prompts/templates/:id', {
    schema: { body: UpdateTemplateSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const updates = request.body;

    const template = await promptTemplateService.updateTemplate(id, user.id, updates);
    if (!template) {
      return reply.status(404).send({ error: 'Template not found or unauthorized' });
    }

    return reply.send({ template });
  });

  // Delete template
  fastify.delete('/api/prompts/templates/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };

    const deleted = await promptTemplateService.deleteTemplate(id, user.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Template not found or unauthorized' });
    }

    return reply.send({ success: true });
  });

  // Render template
  fastify.post('/api/prompts/templates/:id/render', {
    schema: { body: RenderTemplateSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { variables } = request.body as z.infer<typeof RenderTemplateSchema>;

    try {
      const rendered = await promptTemplateService.renderTemplate(id, variables);
      return reply.send({ rendered });
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }
  });

  // Optimize prompt
  fastify.post('/api/prompts/optimize', {
    schema: { body: OptimizePromptSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { prompt, config } = request.body as z.infer<typeof OptimizePromptSchema>;

    const result = await promptOptimizer.optimize(prompt, config || {});

    return reply.send(result);
  });

  // Get template versions
  fastify.get('/api/prompts/templates/:id/versions', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const versions = await promptTemplateService.getTemplateVersions(id);

    return reply.send({ versions });
  });

  // Batch optimize
  fastify.post('/api/prompts/batch-optimize', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { prompts, config } = request.body as { prompts: string[]; config?: PromptOptimizationConfig };

    if (!prompts || prompts.length === 0) {
      return reply.status(400).send({ error: 'No prompts provided' });
    }

    if (prompts.length > 50) {
      return reply.status(400).send({ error: 'Maximum 50 prompts per batch' });
    }

    const results = await Promise.all(
      prompts.map(prompt => promptOptimizer.optimize(prompt, config || {}))
    );

    return reply.send({ results });
  });
}