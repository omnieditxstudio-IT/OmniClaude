import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { mappingService } from '../services/mapping.service';
import { translationService } from '../services/translation.service';
import { RequestLog } from '../models';
import { AnthropicMessagesRequest, AnthropicStreamEvent } from '@gateway/shared';

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

export async function proxyRoutes(fastify: FastifyInstance) {
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
    
    try {
      // Resolve model mapping
      const resolved = await mappingService.resolveModel(user.id, body.model);
      
      if (!resolved) {
        return reply.status(404).send({ 
          error: { 
            type: 'not_found', 
            message: `Model ${body.model} not configured. Please set up a model mapping in the dashboard.` 
          } 
        });
      }
      
      const { entry, endpoint, apiKey } = resolved;
      
      // Apply overrides
      const finalRequest = applyOverrides(body, entry.overrides);
      
      const isStream = finalRequest.stream === true;
      
      if (isStream) {
        return handleStreaming(request, reply, user, entry, endpoint, apiKey, finalRequest, startTime);
      } else {
        return handleNonStreaming(request, reply, user, entry, endpoint, apiKey, finalRequest, startTime);
      }
    } catch (error) {
      await logRequest(user.id, body.model, '', '', 0, 0, Date.now() - startTime, 500, error);
      throw error;
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
}

async function handleNonStreaming(
  request: FastifyRequest,
  reply: FastifyReply,
  user: any,
  entry: any,
  endpoint: any,
  apiKey: string,
  body: AnthropicMessagesRequest,
  startTime: number
) {
  try {
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
    
    return reply.send(result.response);
  } catch (error) {
    await logRequest(
      user.id, 
      entry.claudeModelId, 
      entry.providerModelId, 
      endpoint._id.toString(), 
      0, 0, 
      Date.now() - startTime, 
      500, 
      error
    );
    throw error;
  }
}

async function handleStreaming(
  request: FastifyRequest,
  reply: FastifyReply,
  user: any,
  entry: any,
  endpoint: any,
  apiKey: string,
  body: AnthropicMessagesRequest,
  startTime: number
) {
  reply.header('Content-Type', 'text/event-stream');
  reply.header('Cache-Control', 'no-cache');
  reply.header('Connection', 'keep-alive');
  reply.header('x-gateway-model', entry.providerModelId);
  reply.header('x-gateway-endpoint', endpoint.name);
  
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