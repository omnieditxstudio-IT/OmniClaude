import { FastifyInstance } from 'fastify';
import { Webhook, WebhookDelivery, WebhookEvent } from '../models';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

export type WebhookEventType = 
  | 'request.completed'
  | 'request.failed'
  | 'request.fallback_activated'
  | 'endpoint.health_changed'
  | 'mapping.created'
  | 'mapping.updated'
  | 'mapping.deleted'
  | 'api_key.created'
  | 'api_key.updated'
  | 'api_key.deleted'
  | 'usage.threshold_exceeded'
  | 'error.rate_exceeded';

interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  userId: string;
  data: Record<string, any>;
}

interface WebhookConfig {
  url: string;
  secret: string;
  events: WebhookEventType[];
  active: boolean;
  retryPolicy: {
    maxRetries: number;
    initialDelay: number; // ms
    maxDelay: number; // ms
    backoffMultiplier: number;
  };
}

export class WebhookService {
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  async createWebhook(userId: string, config: Omit<WebhookConfig, 'secret'> & { secret?: string }): Promise<Webhook> {
    const secret = config.secret || this.generateSecret();
    const webhook = await Webhook.create({
      userId,
      url: config.url,
      secret,
      events: config.events,
      active: config.active ?? true,
      retryPolicy: config.retryPolicy || {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      },
    });
    return webhook;
  }

  async getWebhooks(userId: string): Promise<Webhook[]> {
    return Webhook.find({ userId }).sort({ createdAt: -1 }).lean();
  }

  async getWebhook(id: string, userId: string): Promise<Webhook | null> {
    return Webhook.findOne({ _id: id, userId });
  }

  async updateWebhook(id: string, userId: string, updates: Partial<WebhookConfig>): Promise<Webhook | null> {
    return Webhook.findOneAndUpdate(
      { _id: id, userId },
      { $set: updates },
      { new: true }
    );
  }

  async deleteWebhook(id: string, userId: string): Promise<boolean> {
    const result = await Webhook.deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  }

  async testWebhook(id: string, userId: string): Promise<{ success: boolean; response?: any; error?: string }> {
    const webhook = await this.getWebhook(id, userId);
    if (!webhook) {
      return { success: false, error: 'Webhook not found' };
    }

    const testPayload: WebhookPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      userId,
      data: { message: 'Test webhook delivery' },
    };

    return this.deliverWebhook(webhook, testPayload);
  }

  async triggerEvent(event: WebhookEventType, userId: string, data: Record<string, any>): Promise<void> {
    const webhooks = await Webhook.find({ 
      userId, 
      active: true, 
      events: event 
    }).lean();

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      userId,
      data,
    };

    // Deliver to all matching webhooks concurrently
    await Promise.allSettled(
      webhooks.map(webhook => this.deliverWebhook(webhook, payload))
    );
  }

  private async deliverWebhook(webhook: Webhook, payload: WebhookPayload): Promise<{ success: boolean; response?: any; error?: string }> {
    const deliveryId = uuidv4();
    const startTime = Date.now();

    // Create delivery record
    const delivery = await WebhookDelivery.create({
      webhookId: webhook._id,
      deliveryId,
      event: payload.event,
      payload,
      status: 'pending',
      attempt: 0,
    });

    try {
      const signature = this.generateSignature(payload, webhook.secret);
      
      const response = await axios.post(webhook.url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Delivery': deliveryId,
          'X-Webhook-Event': payload.event,
          'User-Agent': 'Model-Translation-Gateway-Webhook/1.0',
        },
        timeout: 10000,
        validateStatus: () => true, // Don't throw on non-2xx
      });

      const latency = Date.now() - startTime;
      const success = response.status >= 200 && response.status < 300;

      await WebhookDelivery.findByIdAndUpdate(delivery._id, {
        $set: {
          status: success ? 'success' : 'failed',
          responseStatus: response.status,
          responseBody: response.data,
          latencyMs: latency,
          completedAt: new Date(),
        },
      });

      // Record metrics
      this.fastify.metrics?.recordWebhookDelivery(payload.event, success ? 'success' : 'failed');

      return { success, response: response.data };
    } catch (error) {
      const latency = Date.now() - startTime;
      await WebhookDelivery.findByIdAndUpdate(delivery._id, {
        $set: {
          status: 'failed',
          error: (error as Error).message,
          latencyMs: latency,
          completedAt: new Date(),
        },
      });

      this.fastify.metrics?.recordWebhookDelivery(payload.event, 'failed');
      return { success: false, error: (error as Error).message };
    }
  }

  async retryDelivery(deliveryId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const delivery = await WebhookDelivery.findOne({ deliveryId }).populate('webhookId');
    if (!delivery) {
      return { success: false, error: 'Delivery not found' };
    }

    const webhook = delivery.webhookId as any;
    if (webhook.userId.toString() !== userId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (delivery.attempt >= webhook.retryPolicy.maxRetries) {
      return { success: false, error: 'Max retries exceeded' };
    }

    // Exponential backoff
    const delay = Math.min(
      webhook.retryPolicy.initialDelay * Math.pow(webhook.retryPolicy.backoffMultiplier, delivery.attempt),
      webhook.retryPolicy.maxDelay
    );

    await new Promise(resolve => setTimeout(resolve, delay));

    await WebhookDelivery.findByIdAndUpdate(delivery._id, {
      $inc: { attempt: 1 },
      $set: { status: 'pending' },
    });

    const result = await this.deliverWebhook(webhook, delivery.payload);
    return result;
  }

  async getDeliveries(webhookId: string, userId: string, options: { page?: number; limit?: number; status?: string } = {}): Promise<{ deliveries: any[]; total: number }> {
    const webhook = await Webhook.findOne({ _id: webhookId, userId });
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const query: any = { webhookId };
    if (options.status) {
      query.status = options.status;
    }

    const page = options.page || 1;
    const limit = options.limit || 50;

    const [deliveries, total] = await Promise.all([
      WebhookDelivery.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      WebhookDelivery.countDocuments(query),
    ]);

    return { deliveries, total };
  }

  private generateSecret(): string {
    return `whsec_${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`;
  }

  private generateSignature(payload: WebhookPayload, secret: string): string {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  // Verify incoming webhook signature (for testing)
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }
}