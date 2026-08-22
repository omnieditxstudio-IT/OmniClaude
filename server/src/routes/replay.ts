import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RequestLog, RequestReplay } from '../models';
import { Types } from 'mongoose';
import { proxyService } from '../services/proxy.service';

const ReplayRequestSchema = z.object({
  logId: z.string(),
  modifications: z.object({
    model: z.string().optional(),
    messages: z.array(z.any()).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(100000).optional(),
    systemPrompt: z.string().optional(),
    tools: z.array(z.any()).optional(),
  }).optional(),
});

export async function replayRoutes(fastify: FastifyInstance) {
  // Replay a request
  fastify.post('/api/replay', {
    schema: { body: ReplayRequestSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { logId, modifications } = request.body as z.infer<typeof ReplayRequestSchema>;
    
    const log = await RequestLog.findOne({ _id: logId, userId: new Types.ObjectId(user.id) });
    if (!log) {
      return reply.status(404).send({ error: 'Request log not found' });
    }
    
    // Get the original request from replay store
    const replayData = await RequestReplay.findOne({ logId: new Types.ObjectId(logId) });
    if (!replayData) {
      return reply.status(404).send({ error: 'Replay data not available' });
    }
    
    // Apply modifications
    const requestBody = { ...replayData.requestBody };
    if (modifications) {
      Object.assign(requestBody, modifications);
    }
    
    // Find the mapping for this request
    const { mappingService } = await import('../services/mapping.service');
    const mapping = await mappingService.resolveModel(user.id, log.claudeModelId);
    if (!mapping) {
      return reply.status(404).send({ error: 'No mapping found for model' });
    }
    
    // Replay the request
    const result = await proxyService.forwardRequest(
      mapping.entry,
      mapping.endpoint,
      mapping.apiKey,
      requestBody
    );
    
    // Store replay result
    await RequestReplay.create({
      userId: new Types.ObjectId(user.id),
      originalLogId: new Types.ObjectId(logId),
      requestBody,
      response: result,
      modifications,
      createdAt: new Date(),
    });
    
    return reply.send({ 
      replayId: replayData._id,
      request: requestBody,
      response: result,
    });
  });
  
  // Get replay history
  fastify.get('/api/replay/history', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { page = 1, limit = 20, logId } = request.query as { 
      page?: number; 
      limit?: number; 
      logId?: string; 
    };
    
    const query: any = { userId: new Types.ObjectId(user.id) };
    if (logId) query.originalLogId = new Types.ObjectId(logId);
    
    const replays = await RequestReplay.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    
    const total = await RequestReplay.countDocuments(query);
    
    return reply.send({ 
      replays, 
      pagination: { page, limit, total, pages: Math.ceil(total / limit) } 
    });
  });
  
  // Get replay details
  fastify.get('/api/replay/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const replay = await RequestReplay.findOne({ 
      _id: id, 
      userId: new Types.ObjectId(user.id) 
    });
    
    if (!replay) {
      return reply.status(404).send({ error: 'Replay not found' });
    }
    
    return reply.send({ replay });
  });
  
  // Compare replay with original
  fastify.get('/api/replay/:id/compare', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const replay = await RequestReplay.findOne({ 
      _id: id, 
      userId: new Types.ObjectId(user.id) 
    }).populate('originalLogId');
    
    if (!replay) {
      return reply.status(404).send({ error: 'Replay not found' });
    }
    
    const originalLog = replay.originalLogId as any;
    
    const comparison = {
      request: {
        original: replay.originalLogId ? (replay.originalLogId as any).requestBody : null,
        replay: replay.requestBody,
        diff: diffObjects(
          replay.originalLogId ? (replay.originalLogId as any).requestBody : null,
          replay.requestBody
        ),
      },
      response: {
        original: originalLog?.responseBody,
        replay: replay.response,
        diff: diffObjects(originalLog?.responseBody, replay.response),
      },
      metadata: {
        originalLatency: originalLog?.latencyMs,
        replayLatency: replay.response?.latencyMs,
        latencyDiff: replay.response?.latencyMs - (originalLog?.latencyMs || 0),
        originalTokens: {
          input: originalLog?.inputTokens,
          output: originalLog?.outputTokens,
        },
        replayTokens: {
          input: replay.response?.usage?.inputTokens,
          output: replay.response?.usage?.outputTokens,
        },
        originalCost: originalLog?.estimatedCost,
        replayCost: replay.response?.estimatedCost,
      },
    };
    
    return reply.send({ comparison });
  });
  
  // Batch replay
  fastify.post('/api/replay/batch', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { logIds, modifications } = request.body as { 
      logIds: string[]; 
      modifications?: any; 
    };
    
    if (!logIds || logIds.length === 0) {
      return reply.status(400).send({ error: 'No log IDs provided' });
    }
    
    if (logIds.length > 50) {
      return reply.status(400).send({ error: 'Maximum 50 replays per batch' });
    }
    
    const results = await Promise.allSettled(
      logIds.map(async (logId) => {
        const log = await RequestLog.findOne({ _id: logId, userId: new Types.ObjectId(user.id) });
        if (!log) throw new Error('Log not found');
        
        const replayData = await RequestReplay.findOne({ logId: new Types.ObjectId(logId) });
        if (!replayData) throw new Error('Replay data not available');
        
        const requestBody = { ...replayData.requestBody };
        if (modifications) Object.assign(requestBody, modifications);
        
        const { mappingService } = await import('../services/mapping.service');
        const mapping = await mappingService.resolveModel(user.id, log.claudeModelId);
        if (!mapping) throw new Error('No mapping found');
        
        const result = await proxyService.forwardRequest(
          mapping.entry,
          mapping.endpoint,
          mapping.apiKey,
          requestBody
        );
        
        const replay = await RequestReplay.create({
          userId: new Types.ObjectId(user.id),
          originalLogId: new Types.ObjectId(logId),
          requestBody,
          response: result,
          modifications,
          createdAt: new Date(),
        });
        
        return { logId, replayId: replay._id, success: true, response: result };
      })
    );
    
    return reply.send({ 
      results: results.map((r, i) => ({
        logId: logIds[i],
        ...(r.status === 'fulfilled' ? { success: true, ...r.value } : { success: false, error: r.reason?.message })
      }))
    });
  });
  
  // Debug request - detailed inspection
  fastify.get('/api/debug/request/:logId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { logId } = request.params as { logId: string };
    
    const log = await RequestLog.findOne({ _id: logId, userId: new Types.ObjectId(user.id) });
    if (!log) {
      return reply.status(404).send({ error: 'Request log not found' });
    }
    
    const replayData = await RequestReplay.findOne({ logId: new Types.ObjectId(logId) });
    
    return reply.send({
      log: {
        id: log._id,
        claudeModelId: log.claudeModelId,
        providerModelId: log.providerModelId,
        endpointId: log.endpointId,
        requestType: log.requestType,
        inputTokens: log.inputTokens,
        outputTokens: log.outputTokens,
        latencyMs: log.latencyMs,
        statusCode: log.statusCode,
        error: log.error,
        createdAt: log.createdAt,
      },
      requestBody: replayData?.requestBody,
      responseBody: replayData?.response,
      mapping: await getMappingDetails(log.claudeModelId, user.id),
      endpoint: await getEndpointDetails(log.endpointId, user.id),
      trace: await getTraceDetails(logId),
    });
  });
  
  // Request diff tool
  fastify.post('/api/debug/diff', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { object1, object2 } = request.body as { 
      object1: any; 
      object2: any; 
    };
    
    return reply.send({ diff: diffObjects(object1, object2) });
  });
  
  // Performance profile
  fastify.get('/api/debug/profile/:logId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { logId } = request.params as { logId: string };
    
    const log = await RequestLog.findOne({ _id: logId, userId: new Types.ObjectId(user.id) });
    if (!log) {
      return reply.status(404).send({ error: 'Request log not found' });
    }
    
    // Get related logs for context
    const relatedLogs = await RequestLog.find({
      userId: new Types.ObjectId(user.id),
      endpointId: log.endpointId,
      createdAt: { 
        $gte: new Date(log.createdAt.getTime() - 3600000),
        $lte: new Date(log.createdAt.getTime() + 3600000),
      },
    }).sort({ createdAt: 1 }).limit(100).lean();
    
    return reply.send({
      profile: {
        targetLog: log,
        timeline: relatedLogs.map(l => ({
          time: l.createdAt,
          latency: l.latencyMs,
          status: l.statusCode,
          model: l.providerModelId,
        })),
        stats: {
          avgLatency: relatedLogs.reduce((a, b) => a + b.latencyMs, 0) / relatedLogs.length,
          minLatency: Math.min(...relatedLogs.map(l => l.latencyMs)),
          maxLatency: Math.max(...relatedLogs.map(l => l.latencyMs)),
          errorRate: relatedLogs.filter(l => l.statusCode >= 400).length / relatedLogs.length,
        },
        bottlenecks: detectBottlenecks(relatedLogs),
      },
    });
  });
}

// Helper functions
function diffObjects(obj1: any, obj2: any, path = ''): any {
  if (obj1 === obj2) return null;
  if (obj1 === null || obj2 === null) return { old: obj1, new: obj2 };
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return { old: obj1, new: obj2 };
  }
  
  const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
  const diff: any = {};
  let hasChanges = false;
  
  for (const key of keys) {
    const newPath = path ? `${path}.${key}` : key;
    if (!(key in obj1)) {
      diff[key] = { type: 'added', value: obj2[key] };
      hasChanges = true;
    } else if (!(key in obj2)) {
      diff[key] = { type: 'removed', value: obj1[key] };
      hasChanges = true;
    } else {
      const childDiff = diffObjects(obj1[key], obj2[key], newPath);
      if (childDiff) {
        diff[key] = childDiff;
        hasChanges = true;
      }
    }
  }
  
  return hasChanges ? diff : null;
}

async function getMappingDetails(claudeModelId: string, userId: string) {
  const { mappingService } = await import('../services/mapping.service');
  return mappingService.resolveModel(userId, claudeModelId);
}

async function getEndpointDetails(endpointId: string, userId: string) {
  const { endpointService } = await import('../services/endpoint.service');
  return endpointService.findById(endpointId, userId);
}

async function getTraceDetails(logId: string) {
  // Would integrate with OpenTelemetry trace storage
  return { traceId: 'example-trace-id', spans: [] };
}

function detectBottlenecks(logs: any[]): string[] {
  const bottlenecks: string[] = [];
  
  // Check for high latency spikes
  const latencies = logs.map(l => l.latencyMs);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const maxLatency = Math.max(...latencies);
  
  if (maxLatency > avgLatency * 3) {
    bottlenecks.push('High latency spike detected');
  }
  
  // Check for error bursts
  const recentErrors = logs.slice(-10).filter(l => l.statusCode >= 400).length;
  if (recentErrors > 3) {
    bottlenecks.push('Error burst detected');
  }
  
  // Check for token usage anomalies
  const avgTokens = logs.reduce((a, b) => a + b.inputTokens + b.outputTokens, 0) / logs.length;
  const maxTokens = Math.max(...logs.map(l => l.inputTokens + l.outputTokens));
  
  if (maxTokens > avgTokens * 5) {
    bottlenecks.push('Unusual token usage spike');
  }
  
  return bottlenecks;
}