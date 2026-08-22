import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { mappingService } from '../services/mapping.service';
import { translationService } from '../services/translation.service';
import { RequestLog, DeadLetterQueue } from '../models';
import { AnthropicMessagesRequest, AnthropicStreamEvent } from '@gateway/shared';
import { v4 as uuidv4 } from 'uuid';
import { cacheService } from '../services/cache.service';

const MessagesRequestSchema = z.object({
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.union([z.string(), z.array(z.object({
      type: z.enum(['text', 'image', 'tool_use', 'tool_result']),
      text: z.string().optional(),
      source: z.object({
        type: z.literal('base64'),
        media_type: z.string(),
        data: z.string(),
      }).optional(),
      id: z.string().optional(),
      name: z.string().optional(),
      input: z.record(z.unknown()).optional(),
      tool_use_id: z.string().optional(),
      content: z.union([z.string(), z.array(z.unknown())]).optional(),
      is_error: z.boolean().optional(),
    }))]),
  })),
  system: z.union([z.string(), z.array(z.object({
    type: z.literal('text'),
    text: z.string(),
  }))]).optional(),
  max_tokens: z.number().min(1).max(100000),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().min(0).optional(),
  stop_sequences: z.array(z.string()).optional(),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    input_schema: z.record(z.unknown()),
  })).optional(),
  tool_choice: z.union([
    z.object({ type: z.literal('auto') }),
    z.object({ type: z.literal('any') }),
    z.object({ type: z.literal('tool'), name: z.string() }),
    z.object({ type: z.literal('none') }),
  ]).optional(),
  stream: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

interface ProxyContext {
  user: any;
  body: AnthropicMessagesRequest;
  startTime: number;
  requestId: string;
}

interface HedgeRequest {
  context: ProxyContext;
  fallbackIndex: number;
  abortController: AbortController;
}

export async function proxyRoutes(fastify: FastifyInstance) {
  // Request deduplication cache
  const dedupCache = new Map<string, Promise<any>>();
  const DEDUP_TTL = 5000; // 5 seconds
  
  // Clean up dedup cache periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of dedupCache.entries()) {
      // We can't easily check promise age, so just clear periodically
      // In production, use a proper cache with TTL
    }
    if (dedupCache.size > 1000) {
      dedupCache.clear();
    }
  }, 30000);

  // Anthropic Messages API - Main endpoint
  fastify.post('/v1/messages', {
    schema: {
      body: MessagesRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string' },
            role: { type: 'string' },
            content: { type: 'array' },
            model: { type: 'string' },
            stop_reason: { type: ['string', 'null'] },
            stop_sequence: { type: ['string', 'null'] },
            usage: {
              type: 'object',
              properties: {
                input_tokens: { type: 'number' },
                output_tokens: { type: 'number' },
              },
            },
          },
        },
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const user = request.auth.user!;
    const body = request.body as AnthropicMessagesRequest;
    const requestId = uuidv4();
    
    // Generate deduplication key
    const dedupKey = generateDedupKey(user.id, body);
    
    // Check for duplicate request
    if (dedupCache.has(dedupKey)) {
      const cached = dedupCache.get(dedupKey);
      if (cached) {
        fastify.log.info({ requestId, dedupKey }, 'Returning deduplicated response');
        try {
          const result = await cached;
          reply.header('x-gateway-deduplicated', 'true');
          return reply.send(result);
        } catch {
          // If cached promise failed, remove and continue
          dedupCache.delete(dedupKey);
        }
      }
    
    const context: ProxyContext = { user, body, startTime, requestId };
    
    // Create promise for deduplication
    const promise = executeWithHedging(context, fastify, reply);
    dedupCache.set(dedupKey, promise);
    
    try {
      const result = await promise;
      return reply.send(result);
    } finally {
      // Clean up after a delay to allow other requests to use cached result
      setTimeout(() => dedupCache.delete(dedupKey), DEDUP_TTL);
    }
  });
  
  // Models list endpoint (for compatibility)
  fastify.get('/v1/models', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.auth.user!;
    const mapping = await mappingService.findDefault(user.id);
    
    if (!mapping) {
      return reply.send({ object: 'list', data: [] });
    }
    
    const models = mapping.mappings.map(m => ({
      id: m.claudeModelId,
      object: 'model',
      created: Date.now(),
      owned_by: 'gateway',
    }));
    
    return reply.send({ object: 'list', data: models });
  });
  
  // Legacy completions endpoint (optional)
  fastify.post('/v1/complete', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Convert to messages format and forward
    const body = request.body as any;
    const messagesRequest: AnthropicMessagesRequest = {
      model: body.model,
      messages: [{ role: 'user', content: body.prompt }],
      max_tokens: body.max_tokens_to_sample || 1000,
      temperature: body.temperature,
      stop_sequences: body.stop_sequences,
      stream: body.stream,
    };
    
    // Reuse the messages handler
    request.body = messagesRequest;
    return fastify.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: request.headers,
      body: messagesRequest,
    });
  });
  
  // Dead letter queue endpoint
  fastify.get('/api/admin/dead-letters', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { page = 1, limit = 50, status } = request.query as { 
      page?: number; limit?: number; status?: string; 
    };
    
    const query: any = {};
    if (status) query.status = status;
    
    const letters = await DeadLetterQueue.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    
    const total = await DeadLetterQueue.countDocuments(query);
    
    return reply.send({ 
      letters, 
      pagination: { page, limit, total, pages: Math.ceil(total / limit) } 
    });
  });
  
  // Retry dead letter
  fastify.post('/api/admin/dead-letters/:id/retry', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const letter = await DeadLetterQueue.findById(id);
    if (!letter) {
      return reply.status(404).send({ error: 'Dead letter not found' });
    }
    
    // Retry the request
    try {
      const result = await executeRequest({
        user: { id: letter.userId },
        body: letter.requestBody,
        startTime: Date.now(),
        requestId: uuidv4(),
      }, fastify, reply);
      
      // Update dead letter status
      await DeadLetterQueue.findByIdAndUpdate(id, {
        $set: { 
          status: 'retried', 
          retriedAt: new Date(),
          retryResult: result,
        },
      });
      
      return reply.send({ success: true, result });
    } catch (error: any) {
      await DeadLetterQueue.findByIdAndUpdate(id, {
        $inc: { retryCount: 1 },
        $set: { lastError: error.message },
      });
      return reply.status(500).send({ error: error.message });
    }
  });
}

async function executeWithHedging(
  context: ProxyContext,
  fastify: FastifyInstance,
  reply: FastifyReply
): Promise<any> {
  const { user, body, startTime, requestId } = context;
  
  // Resolve primary mapping
  const primaryResolved = await mappingService.resolveModel(user.id, body.model);
  
  if (!primaryResolved) {
    return reply.status(404).send({ 
      error: { 
        type: 'not_found', 
        message: `Model ${body.model} not configured. Please set up a model mapping in the dashboard.` 
      } 
    });
  }
  
  const { entry, endpoint, apiKey } = primaryResolved;
  
  // Apply overrides
  const finalRequest = applyOverrides(body, entry.overrides);
  const isStream = finalRequest.stream === true;
  
  // Get fallback chain
  const fallbackChain = await mappingService.getFallbackChain(user.id, body.model);
  
  // Prepare all candidates (primary + fallbacks)
  const candidates = [
    { entry, endpoint, apiKey, isPrimary: true, index: -1 },
    ...fallbackChain.map((f, i) => ({ ...f, isPrimary: false, index: i })),
  ];
  
  // Execute with hedging
  const hedgingDelay = 100; // Start hedging after 100ms
  const maxConcurrent = 3; // Max concurrent requests
  
  let completed = false;
  let result: any = null;
  let error: Error | null = null;
  const abortControllers = candidates.map(() => new AbortController());
  
  // Execute requests with staggered starts
  const promises = candidates.map(async (candidate, index) => {
    // Stagger start times for hedging
    if (index > 0) {
      await new Promise(resolve => setTimeout(resolve, hedgingDelay * index));
    }
    
    // Skip if already completed
    if (completed) return;
    
    try {
      const candidateResult = await executeCandidate(
        candidate,
        finalRequest,
        isStream,
        context,
        fastify,
        reply,
        abortControllers[index]
      );
      
      if (!completed) {
        completed = true;
        result = candidateResult;
        
        // Abort other requests
        abortControllers.forEach((ac, i) => {
          if (i !== index) ac.abort();
        });
      }
      
      return candidateResult;
    } catch (err) {
      error = err as Error;
      // Continue to next candidate
      if (index === candidates.length - 1 && !completed) {
        throw error;
      }
    }
  });
  
  // Wait for first successful completion
  try {
    await Promise.race(promises);
  } catch (err) {
    if (!completed) {
      // All candidates failed - add to dead letter queue
      await addToDeadLetterQueue({
        userId: user.id,
        requestBody: finalRequest,
        error: err instanceof Error ? err : new Error(String(err)),
        context: {
          claudeModelId: body.model,
          requestId,
          timestamp: new Date(),
        },
      });
      throw err;
    }
  }
  
  return result;
}

async function executeCandidate(
  candidate: any,
  request: AnthropicMessagesRequest,
  isStream: boolean,
  context: ProxyContext,
  fastify: FastifyInstance,
  reply: FastifyReply,
  abortController: AbortController
): Promise<any> {
  const { user, startTime, requestId } = context;
  const { entry, endpoint, apiKey, isPrimary } = candidate;
  
  try {
    if (isStream) {
      return await handleStreamingWithAbort(
        request, reply, user, entry, endpoint, apiKey, request,
        startTime, abortController, isPrimary
      );
    } else {
      return await handleNonStreamingWithAbort(
        request, reply, user, entry, endpoint, apiKey, request,
        startTime, abortController, isPrimary
      );
    }
  } catch (error) {
    // Log fallback activation
    if (!isPrimary) {
      fastify.metrics?.recordFallback(entry.claudeModelId, candidate.entry.providerModelId);
    }
    throw error;
  }
}

async function handleNonStreamingWithAbort(
  request: FastifyRequest,
  reply: FastifyReply,
  user: any,
  entry: any,
  endpoint: any,
  apiKey: string,
  body: AnthropicMessagesRequest,
  startTime: number,
  abortController: AbortController,
  isPrimary: boolean
): Promise<any> {
  // Check for abort
  if (abortController.signal.aborted) {
    throw new Error('Request aborted due to hedging');
  }
  
  const result = await translationService.translateAndForward({
    claudeModelId: entry.claudeModelId,
    providerModelId: entry.providerModelId,
    endpoint,
    apiKey,
  }, body);
  
  // Log successful request
  await logRequest(
    user.id, 
    entry.claudeModelId, 
    entry.providerModelId, 
    endpoint._id.toString(), 
    result.usage.inputTokens, 
    result.usage.outputTokens, 
    Date.now() - startTime, 
    200
  );
  
  // Add gateway headers
  reply.header('x-gateway-model', entry.providerModelId);
  reply.header('x-gateway-endpoint', endpoint.name);
  reply.header('x-gateway-latency', `${Date.now() - startTime}ms`);
  if (!isPrimary) {
    reply.header('x-gateway-fallback', 'true');
    reply.header('x-gateway-fallback-index', '1');
  }
  
  return result.response;
}

async function handleStreamingWithAbort(
  request: FastifyRequest,
  reply: FastifyReply,
  user: any,
  entry: any,
  endpoint: any,
  apiKey: string,
  body: AnthropicMessagesRequest,
  startTime: number,
  abortController: AbortController,
  isPrimary: boolean
): Promise<void> {
  reply.header('Content-Type', 'text/event-stream');
  reply.header('Cache-Control', 'no-cache');
  reply.header('Connection', 'keep-alive');
  reply.header('x-gateway-model', entry.providerModelId);
  reply.header('x-gateway-endpoint', endpoint.name);
  if (!isPrimary) {
    reply.header('x-gateway-fallback', 'true');
  }
  
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let hasError = false;
  let error: Error | null = null;
  
  try {
    for await (const event of translationService.translateAndForwardStream({
      claudeModelId: entry.claudeModelId,
      providerModelId: entry.providerModelId,
      endpoint,
      apiKey,
    }, body)) {
      // Check for abort
      if (abortController.signal.aborted) {
        throw new Error('Stream aborted due to hedging');
      }
      
      // Track usage from events
      if (event.type === 'message_start' && event.message?.usage) {
        totalInputTokens = event.message.usage.input_tokens;
        totalOutputTokens = event.message.usage.output_tokens;
      } else if (event.type === 'message_delta' && event.usage) {
        totalOutputTokens = event.usage.output_tokens;
      }
      
      // Send SSE event
      const data = `data: ${JSON.stringify(event)}\n\n`;
      await reply.raw.write(data);
    }
    
    await reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  } catch (err) {
    hasError = true;
    error = err instanceof Error ? err : new Error('Streaming error');
    
    // Send error event
    const errorEvent: AnthropicStreamEvent = {
      type: 'message_delta',
      delta: { stop_reason: 'max_tokens' },
      usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
    };
    await reply.raw.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    await reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  } finally {
    await logRequest(
      user.id, 
      entry.claudeModelId, 
      entry.providerModelId, 
      endpoint._id.toString(), 
      totalInputTokens, 
      totalOutputTokens, 
      Date.now() - startTime, 
      hasError ? 500 : 200, 
      error
    );
  }
}

function applyOverrides(request: AnthropicMessagesRequest, overrides?: any): AnthropicMessagesRequest {
  if (!overrides) return request;
  
  return {
    ...request,
    temperature: overrides.temperature ?? request.temperature,
    max_tokens: overrides.maxTokens ?? request.max_tokens,
    system: overrides.systemPrompt ?? request.system,
    tools: overrides.tools ?? request.tools,
  };
}

function generateDedupKey(userId: string, body: AnthropicMessagesRequest): string {
  // Create a hash of the request for deduplication
  const keyParts = [
    userId,
    body.model,
    body.messages.map(m => `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('|'),
    body.system || '',
    body.temperature?.toString() || '',
    body.max_tokens.toString(),
  ];
  return require('crypto').createHash('sha256').update(keyParts.join('|')).digest('hex');
}

async function logRequest(
  userId: string,
  claudeModelId: string,
  providerModelId: string,
  endpointId: string,
  inputTokens: number,
  outputTokens: number,
  latencyMs: number,
  statusCode: number,
  error?: Error | null
) {
  try {
    await RequestLog.create({
      userId,
      claudeModelId,
      providerModelId,
      endpointId,
      requestType: 'messages',
      inputTokens,
      outputTokens,
      latencyMs,
      statusCode,
      error: error?.message,
    });
  } catch (logError) {
    console.error('Failed to log request:', logError);
  }
}

async function addToDeadLetterQueue(data: {
  userId: string;
  requestBody: AnthropicMessagesRequest;
  error: Error;
  context: any;
}): Promise<void> {
  try {
    await DeadLetterQueue.create({
      userId: data.userId,
      requestBody: data.requestBody,
      error: data.error.message,
      errorStack: data.error.stack,
      context: data.context,
      status: 'failed',
      retryCount: 0,
      createdAt: new Date(),
    });
  } catch (e) {
    console.error('Failed to add to dead letter queue:', e);
  }
}

async function requireAdmin(request: any, reply: any) {
  const user = request.auth.user;
  const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
  if (!adminEmails.includes(user.email)) {
    return reply.status(403).send({ error: 'Admin access required' });
  }
}