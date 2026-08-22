import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { WebhookService } from '../services/webhook.service';
import { Webhook, WebhookDelivery, WebhookEventType } from '../models';

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum([
    'request.completed', 'request.failed', 'request.fallback_activated',
    'endpoint.health_changed', 'mapping.created', 'mapping.updated', 'mapping.deleted',
    'api_key.created', 'api_key.updated', 'api_key.deleted',
    'usage.threshold_exceeded', 'error.rate_exceeded'
  ])).min(1),
  active: z.boolean().optional(),
  retryPolicy: z.object({
    maxRetries: z.number().min(0).max(10).default(3),
    initialDelay: z.number().min(100).default(1000),
    maxDelay: z.number().min(1000).default(30000),
    backoffMultiplier: z.number().min(1).max(5).default(2),
  }).optional(),
});

const UpdateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.enum([
    'request.completed', 'request.failed', 'request.fallback_activated',
    'endpoint.health_changed', 'mapping.created', 'mapping.updated', 'mapping.deleted',
    'api_key.created', 'api_key.updated', 'api_key.deleted',
    'usage.threshold_exceeded', 'error.rate_exceeded'
  ])).min(1).optional(),
  active: z.boolean().optional(),
  retryPolicy: z.object({
    maxRetries: z.number().min(0).max(10).optional(),
    initialDelay: z.number().min(100).optional(),
    maxDelay: z.number().min(1000).optional(),
    backoffMultiplier: z.number().min(1).max(5).optional(),
  }).optional(),
});

export async function webhookRoutes(fastify: FastifyInstance) {
  const webhookService = new WebhookService(fastify);

  // List webhooks
  fastify.get('/api/webhooks', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const webhooks = await webhookService.getWebhooks(user.id);
    
    return reply.send({
      webhooks: webhooks.map(w => ({
        id: w._id,
        url: w.url,
        events: w.events,
        active: w.active,
        retryPolicy: w.retryPolicy,
        createdAt: w.createdAt,
      })),
    });
  });

  // Create webhook
  fastify.post('/api/webhooks', {
    schema: { body: CreateWebhookSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const input = request.body as z.infer<typeof CreateWebhookSchema>;
    
    const webhook = await webhookService.createWebhook(user.id, input);
    
    return reply.status(201).send({
      id: webhook._id,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
      retryPolicy: webhook.retryPolicy,
      createdAt: webhook.createdAt,
    });
  });

  // Get webhook
  fastify.get('/api/webhooks/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const webhook = await webhookService.getWebhook(id, user.id);
    if (!webhook) {
      return reply.status(404).send({ error: 'Webhook not found' });
    }
    
    return reply.send({
      id: webhook._id,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
      retryPolicy: webhook.retryPolicy,
      createdAt: webhook.createdAt,
    });
  });

  // Update webhook
  fastify.patch('/api/webhooks/:id', {
    schema: { body: UpdateWebhookSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const updates = request.body;
    
    const webhook = await webhookService.updateWebhook(id, user.id, updates);
    if (!webhook) {
      return reply.status(404).send({ error: 'Webhook not found' });
    }
    
    return reply.send({
      id: webhook._id,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
      retryPolicy: webhook.retryPolicy,
    });
  });

  // Delete webhook
  fastify.delete('/api/webhooks/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const deleted = await webhookService.deleteWebhook(id, user.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Webhook not found' });
    }
    
    return reply.send({ success: true });
  });

  // Test webhook
  fastify.post('/api/webhooks/:id/test', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const result = await webhookService.testWebhook(id, user.id);
    
    return reply.send(result);
  });

  // Get webhook deliveries
  fastify.get('/api/webhooks/:id/deliveries', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const { page = 1, limit = 50, status } = request.query as { page?: number; limit?: number; status?: string };
    
    const result = await webhookService.getDeliveries(id, user.id, { page, limit, status });
    
    return reply.send(result);
  });

  // Retry delivery
  fastify.post('/api/webhooks/deliveries/:deliveryId/retry', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { deliveryId } = request.params as { deliveryId: string };
    
    const result = await webhookService.retryDelivery(deliveryId, user.id);
    
    return reply.send(result);
  });

  // Webhook receiver (for incoming webhooks from other services)
  fastify.post('/api/webhooks/receive/:event', async (request, reply) => {
    const { event } = request.params as { event: string };
    const signature = request.headers['x-webhook-signature'] as string;
    
    // Verify signature if needed
    // For now, just accept and process
    
    // This could be used for incoming webhooks from providers
    // e.g., OpenRouter usage alerts, Vertex AI quota notifications
    
    return reply.send({ received: true, event });
  });
}

// Helper to trigger webhook events from other services
export async function triggerWebhookEvent(
  fastify: FastifyInstance,
  event: WebhookEventType,
  userId: string,
  data: Record<string, any>
) {
  const webhookService = new WebhookService(fastify);
  await webhookService.triggerEvent(event, userId, data);
}