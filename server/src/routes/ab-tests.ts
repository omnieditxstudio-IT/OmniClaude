import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ABTest, ABTestVariant, ABTestResult } from '../models';
import { Types } from 'mongoose';

const CreateABTestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  hypothesis: z.string().min(1).max(500),
  targetMetric: z.enum(['latency', 'cost', 'quality', 'error_rate', 'tokens_per_second']),
  targetDirection: z.enum(['minimize', 'maximize']),
  variants: z.array(z.object({
    name: z.string().min(1).max(50),
    description: z.string().optional(),
    weight: z.number().min(0).max(100),
    config: z.object({
      modelMappingId: z.string().optional(),
      endpointId: z.string().optional(),
      providerModelId: z.string().optional(),
      routingStrategy: z.enum(['round_robin', 'least_latency', 'least_errors', 'cost_optimized', 'priority', 'weighted', 'adaptive']).optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).max(100000).optional(),
      systemPrompt: z.string().optional(),
    }),
    isControl: z.boolean().default(false),
  })).min(2).max(10),
  targeting: z.object({
    userIds: z.array(z.string()).optional(),
    teamIds: z.array(z.string()).optional(),
    organizationIds: z.array(z.string()).optional(),
    modelIds: z.array(z.string()).optional(),
    percentage: z.number().min(0).max(100).default(100),
    conditions: z.array(z.object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'contains', 'gt', 'lt', 'in', 'not_in']),
      value: z.any(),
    })).optional(),
  }).optional(),
  schedule: z.object({
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    timezone: z.string().default('UTC'),
  }).optional(),
  minimumSampleSize: z.number().min(10).default(100),
  significanceLevel: z.number().min(0.001).max(0.1).default(0.05),
  minimumDetectableEffect: z.number().min(0.01).max(1).default(0.1),
});

const UpdateABTestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['draft', 'running', 'paused', 'completed', 'cancelled']).optional(),
  variants: z.array(z.object({
    name: z.string().min(1).max(50),
    weight: z.number().min(0).max(100),
    config: z.record(z.any()).optional(),
    isControl: z.boolean().optional(),
  })).optional(),
  targeting: z.object({
    percentage: z.number().min(0).max(100).optional(),
  }).optional(),
});

interface VariantAssignment {
  testId: string;
  variantId: string;
  variantName: string;
  config: any;
}

export async function abTestRoutes(fastify: FastifyInstance) {
  // Create A/B test
  fastify.post('/api/ab-tests', {
    schema: { body: CreateABTestSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const input = request.body as z.infer<typeof CreateABTestSchema>;
    
    // Validate variants have exactly one control
    const controlCount = input.variants.filter(v => v.isControl).length;
    if (controlCount !== 1) {
      return reply.status(400).send({ error: 'Exactly one variant must be marked as control' });
    }
    
    // Validate weights sum to 100
    const totalWeight = input.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight !== 100) {
      return reply.status(400).send({ error: 'Variant weights must sum to 100' });
    }
    
    const variants = input.variants.map((v, i) => ({
      ...v,
      _id: new Types.ObjectId(),
      index: i,
    }));
    
    const test = await ABTest.create({
      ...input,
      variants,
      createdBy: new Types.ObjectId(user.id),
      status: 'draft',
      results: [],
    });
    
    return reply.status(201).send({ test });
  });
  
  // List A/B tests
  fastify.get('/api/ab-tests', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { status, page = 1, limit = 20 } = request.query as { 
      status?: string; 
      page?: number; 
      limit?: number; 
    };
    
    const query: any = { createdBy: new Types.ObjectId(user.id) };
    if (status) query.status = status;
    
    const tests = await ABTest.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    
    const total = await ABTest.countDocuments(query);
    
    // Add real-time stats
    const testsWithStats = await Promise.all(
      tests.map(async (test) => {
        const stats = await getTestStats(test);
        return { ...test, stats };
      })
    );
    
    return reply.send({ 
      tests: testsWithStats, 
      pagination: { page, limit, total, pages: Math.ceil(total / limit) } 
    });
  });
  
  // Get A/B test details
  fastify.get('/api/ab-tests/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const test = await ABTest.findOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (!test) {
      return reply.status(404).send({ error: 'A/B test not found' });
    }
    
    const stats = await getTestStats(test);
    const recentResults = await ABTestResult.find({ testId: test._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    
    return reply.send({ test: { ...test, stats, recentResults } });
  });
  
  // Update A/B test
  fastify.patch('/api/ab-tests/:id', {
    schema: { body: UpdateABTestSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const updates = request.body;
    
    // Validate weights if variants updated
    if (updates.variants) {
      const totalWeight = updates.variants.reduce((sum, v) => sum + v.weight, 0);
      if (totalWeight !== 100) {
        return reply.status(400).send({ error: 'Variant weights must sum to 100' });
      }
      
      const controlCount = updates.variants.filter(v => v.isControl).length;
      if (controlCount !== 1) {
        return reply.status(400).send({ error: 'Exactly one variant must be marked as control' });
      }
    }
    
    const test = await ABTest.findOneAndUpdate(
      { _id: id, createdBy: new Types.ObjectId(user.id) },
      { $set: updates },
      { new: true }
    );
    
    if (!test) {
      return reply.status(404).send({ error: 'A/B test not found or unauthorized' });
    }
    
    return reply.send({ test });
  });
  
  // Start A/B test
  fastify.post('/api/ab-tests/:id/start', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const test = await ABTest.findOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (!test) {
      return reply.status(404).send({ error: 'A/B test not found' });
    }
    
    if (test.status !== 'draft' && test.status !== 'paused') {
      return reply.status(400).send({ error: 'Test can only be started from draft or paused status' });
    }
    
    test.status = 'running';
    test.startedAt = new Date();
    await test.save();
    
    // Register test in routing engine
    await registerTestInRouter(test);
    
    return reply.send({ test });
  });
  
  // Pause A/B test
  fastify.post('/api/ab-tests/:id/pause', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const test = await ABTest.findOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (!test) {
      return reply.status(404).send({ error: 'A/B test not found' });
    }
    
    if (test.status !== 'running') {
      return reply.status(400).send({ error: 'Test can only be paused when running' });
    }
    
    test.status = 'paused';
    await test.save();
    
    // Unregister from router
    await unregisterTestFromRouter(test);
    
    return reply.send({ test });
  });
  
  // Complete A/B test
  fastify.post('/api/ab-tests/:id/complete', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const { winningVariantId, notes } = request.body as { 
      winningVariantId?: string; 
      notes?: string; 
    };
    
    const test = await ABTest.findOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (!test) {
      return reply.status(404).send({ error: 'A/B test not found' });
    }
    
    if (test.status !== 'running') {
      return reply.status(400).send({ error: 'Test can only be completed when running' });
    }
    
    // Calculate final results
    const finalResults = await calculateFinalResults(test);
    
    test.status = 'completed';
    test.completedAt = new Date();
    test.winningVariantId = winningVariantId || finalResults.winningVariantId;
    test.finalResults = finalResults;
    test.notes = notes;
    await test.save();
    
    // Unregister from router
    await unregisterTestFromRouter(test);
    
    return reply.send({ test, results: finalResults });
  });
  
  // Get variant assignment for request (used by proxy)
  fastify.post('/api/ab-tests/assign', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { testId, userId, modelId, teamId, organizationId } = request.body as {
      testId?: string;
      userId?: string;
      modelId?: string;
      teamId?: string;
      organizationId?: string;
    };
    
    let test;
    
    if (testId) {
      test = await ABTest.findOne({ _id: testId, createdBy: new Types.ObjectId(user.id) });
    } else {
      // Find matching test based on targeting
      test = await findMatchingTest(user, { userId, modelId, teamId, organizationId });
    }
    
    if (!test || test.status !== 'running') {
      return reply.send({ assigned: false });
    }
    
    // Check targeting
    if (!matchesTargeting(test, { userId, modelId, teamId, organizationId })) {
      return reply.send({ assigned: false });
    }
    
    // Assign variant using weighted random
    const assignment = assignVariant(test);
    
    // Record assignment
    await recordAssignment(test._id, assignment.variant._id, userId || user.id);
    
    return reply.send({ 
      assigned: true, 
      testId: test._id,
      testName: test.name,
      variant: assignment 
    });
  });
  
  // Record result for variant
  fastify.post('/api/ab-tests/:id/results', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const { variantId, metrics, userId } = request.body as {
      variantId: string;
      metrics: {
        latencyMs?: number;
        costUsd?: number;
        qualityScore?: number;
        errorRate?: number;
        tokensPerSecond?: number;
        success?: boolean;
      };
      userId?: string;
    };
    
    const test = await ABTest.findOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (!test) {
      return reply.status(404).send({ error: 'A/B test not found' });
    }
    
    const variant = test.variants.find(v => v._id.toString() === variantId);
    if (!variant) {
      return reply.status(404).send({ error: 'Variant not found' });
    }
    
    const result = await ABTestResult.create({
      testId: test._id,
      variantId: new Types.ObjectId(variantId),
      userId: userId ? new Types.ObjectId(userId) : undefined,
      metrics,
    });
    
    // Update variant running stats
    await updateVariantStats(test._id, variant._id, metrics);
    
    return reply.status(201).send({ result });
  });
  
  // Get test results/analytics
  fastify.get('/api/ab-tests/:id/results', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const { variantId, startDate, endDate } = request.query as {
      variantId?: string;
      startDate?: string;
      endDate?: string;
    };
    
    const test = await ABTest.findOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (!test) {
      return reply.status(404).send({ error: 'A/B test not found' });
    }
    
    const query: any = { testId: test._id };
    if (variantId) query.variantId = variantId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const results = await ABTestResult.find(query)
      .sort({ createdAt: -1 })
      .lean();
    
    // Calculate statistics
    const stats = await calculateStatistics(test, results);
    
    return reply.send({ results, stats });
  });
  
  // Get test statistics
  fastify.get('/api/ab-tests/:id/stats', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const test = await ABTest.findOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (!test) {
      return reply.status(404).send({ error: 'A/B test not found' });
    }
    
    const stats = await getTestStats(test);
    return reply.send({ stats });
  });
  
  // Delete A/B test
  fastify.delete('/api/ab-tests/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const test = await ABTest.findOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (!test) {
      return reply.status(404).send({ error: 'A/B test not found' });
    }
    
    if (test.status === 'running') {
      return reply.status(400).send({ error: 'Cannot delete running test. Pause or complete first.' });
    }
    
    await ABTest.deleteOne({ _id: id });
    await ABTestResult.deleteMany({ testId: id });
    
    return reply.send({ success: true });
  });
}

// Helper functions
function assignVariant(test: any): VariantAssignment {
  const random = Math.random() * 100;
  let cumulative = 0;
  
  for (const variant of test.variants) {
    cumulative += variant.weight;
    if (random <= cumulative) {
      return {
        testId: test._id.toString(),
        variantId: variant._id.toString(),
        variantName: variant.name,
        config: variant.config,
      };
    }
  }
  
  // Fallback to first variant
  const variant = test.variants[0];
  return {
    testId: test._id.toString(),
    variantId: variant._id.toString(),
    variantName: variant.name,
    config: variant.config,
  };
}

function matchesTargeting(test: any, context: any): boolean {
  if (!test.targeting) return true;
  
  // Check percentage rollout
  if (test.targeting.percentage < 100) {
    const hash = hashString(context.userId || context.modelId || 'default');
    if (hash % 100 >= test.targeting.percentage) {
      return false;
    }
  }
  
  // Check user IDs
  if (test.targeting.userIds?.length && context.userId) {
    if (!test.targeting.userIds.includes(context.userId)) return false;
  }
  
  // Check team IDs
  if (test.targeting.teamIds?.length && context.teamId) {
    if (!test.targeting.teamIds.includes(context.teamId)) return false;
  }
  
  // Check organization IDs
  if (test.targeting.organizationIds?.length && context.organizationId) {
    if (!test.targeting.organizationIds.includes(context.organizationId)) return false;
  }
  
  // Check model IDs
  if (test.targeting.modelIds?.length && context.modelId) {
    if (!test.targeting.modelIds.includes(context.modelId)) return false;
  }
  
  // Check custom conditions
  if (test.targeting.conditions?.length) {
    for (const condition of test.targeting.conditions) {
      const value = context[condition.field];
      if (!evaluateCondition(value, condition.operator, condition.value)) {
        return false;
      }
    }
  }
  
  return true;
}

function evaluateCondition(value: any, operator: string, expected: any): boolean {
  switch (operator) {
    case 'equals': return value === expected;
    case 'not_equals': return value !== expected;
    case 'contains': return String(value).includes(String(expected));
    case 'gt': return Number(value) > Number(expected);
    case 'lt': return Number(value) < Number(expected);
    case 'in': return Array.isArray(expected) && expected.includes(value);
    case 'not_in': return Array.isArray(expected) && !expected.includes(value);
    default: return true;
  }
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

async function findMatchingTest(user: any, context: any): Promise<any> {
  const tests = await ABTest.find({ 
    createdBy: new Types.ObjectId(user.id),
    status: 'running',
  }).lean();
  
  for (const test of tests) {
    if (matchesTargeting(test, context)) {
      return test;
    }
  }
  return null;
}

async function registerTestInRouter(test: any): Promise<void> {
  // Register test with Python router for variant assignment
  try {
    const routerUrl = process.env.PYTHON_ROUTER_URL || 'http://localhost:8000';
    await fetch(`${routerUrl}/ab-tests/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testId: test._id.toString(),
        variants: test.variants.map((v: any) => ({
          variantId: v._id.toString(),
          name: v.name,
          weight: v.weight,
          config: v.config,
          isControl: v.isControl,
        })),
        targeting: test.targeting,
      }),
    });
  } catch (error) {
    console.error('Failed to register A/B test in router:', error);
  }
}

async function unregisterTestFromRouter(test: any): Promise<void> {
  try {
    const routerUrl = process.env.PYTHON_ROUTER_URL || 'http://localhost:8000';
    await fetch(`${routerUrl}/ab-tests/${test._id}/unregister`, {
      method: 'POST',
    });
  } catch (error) {
    console.error('Failed to unregister A/B test from router:', error);
  }
}

async function recordAssignment(testId: Types.ObjectId, variantId: Types.ObjectId, userId: string): Promise<void> {
  // Store assignment for later analysis
  // Could use Redis for fast writes
}

async function updateVariantStats(testId: Types.ObjectId, variantId: Types.ObjectId, metrics: any): Promise<void> {
  const { ABTest } = await import('../models');
  
  const test = await ABTest.findById(testId);
  if (!test) return;
  
  const variant = test.variants.find(v => v._id.equals(variantId));
  if (!variant) return;
  
  // Update running stats (exponential moving average)
  const alpha = 0.1;
  variant.stats = variant.stats || {
    sampleCount: 0,
    avgLatency: 0,
    avgCost: 0,
    avgQuality: 0,
    errorRate: 0,
    successRate: 0,
  };
  
  const s = variant.stats;
  s.sampleCount++;
  
  if (metrics.latencyMs !== undefined) {
    s.avgLatency = s.avgLatency * (1 - alpha) + metrics.latencyMs * alpha;
  }
  if (metrics.costUsd !== undefined) {
    s.avgCost = s.avgCost * (1 - alpha) + metrics.costUsd * alpha;
  }
  if (metrics.qualityScore !== undefined) {
    s.avgQuality = s.avgQuality * (1 - alpha) + metrics.qualityScore * alpha;
  }
  if (metrics.success !== undefined) {
    s.successRate = s.successRate * (1 - alpha) + (metrics.success ? 1 : 0) * alpha;
  }
  if (metrics.errorRate !== undefined) {
    s.errorRate = s.errorRate * (1 - alpha) + metrics.errorRate * alpha;
  }
  
  await test.save();
}

async function calculateFinalResults(test: any): Promise<any> {
  const results = await ABTestResult.find({ testId: test._id }).lean();
  
  const variantStats: Record<string, any> = {};
  
  for (const variant of test.variants) {
    const variantResults = results.filter(r => r.variantId.equals(variant._id));
    const stats = calculateVariantStatistics(variantResults);
    variantStats[variant._id.toString()] = {
      variantId: variant._id.toString(),
      variantName: variant.name,
      isControl: variant.isControl,
      sampleSize: variantResults.length,
      ...stats,
    };
  }
  
  // Determine winner using statistical significance
  const control = test.variants.find(v => v.isControl);
  const treatmentVariants = test.variants.filter(v => !v.isControl);
  
  let winningVariantId = control?._id.toString();
  let significance = false;
  
  if (control && treatmentVariants.length > 0) {
    const controlStats = variantStats[control._id.toString()];
    
    for (const treatment of treatmentVariants) {
      const treatmentStats = variantStats[treatment._id.toString()];
      const comparison = compareVariants(controlStats, treatmentStats, test.targetDirection);
      
      if (comparison.significant && comparison.better) {
        significance = true;
        winningVariantId = treatment._id.toString();
      }
    }
  }
  
  return {
    winningVariantId,
    significance,
    variantStats,
    testConfig: {
      targetMetric: test.targetMetric,
      targetDirection: test.targetDirection,
      significanceLevel: test.significanceLevel,
      minimumDetectableEffect: test.minimumDetectableEffect,
    },
  };
}

function compareVariants(control: any, treatment: any, direction: string): { significant: boolean; better: boolean } {
  // Simplified t-test for demonstration
  // In production, use proper statistical library
  const controlMean = control.mean || 0;
  const treatmentMean = treatment.mean || 0;
  const controlStd = control.std || 1;
  const treatmentStd = treatment.std || 1;
  const n1 = control.sampleSize || 1;
  const n2 = treatment.sampleSize || 1;
  
  const pooledStd = Math.sqrt((controlStd * controlStd) / n1 + (treatmentStd * treatmentStd) / n2);
  const tStat = (treatmentMean - controlMean) / pooledStd;
  
  // Simplified significance check
  const significant = Math.abs(tStat) > 1.96; // p < 0.05 two-tailed
  const better = direction === 'minimize' ? treatmentMean < controlMean : treatmentMean > controlMean;
  
  return { significant, better };
}

function calculateVariantStatistics(results: any[]): any {
  if (results.length === 0) return { sampleSize: 0 };
  
  const latencies = results.filter(r => r.metrics.latencyMs !== undefined).map(r => r.metrics.latencyMs);
  const costs = results.filter(r => r.metrics.costUsd !== undefined).map(r => r.metrics.costUsd);
  const qualities = results.filter(r => r.metrics.qualityScore !== undefined).map(r => r.metrics.qualityScore);
  const errors = results.filter(r => r.metrics.success !== undefined).map(r => r.metrics.success);
  
  return {
    sampleSize: results.length,
    latency: latencies.length > 0 ? {
      mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    } : null,
    cost: costs.length > 0 ? {
      mean: costs.reduce((a, b) => a + b, 0) / costs.length,
      total: costs.reduce((a, b) => a + b, 0),
    } : null,
    quality: qualities.length > 0 ? {
      mean: qualities.reduce((a, b) => a + b, 0) / qualities.length,
    } : null,
    successRate: errors.length > 0 ? errors.filter(e => e).length / errors.length : null,
  };
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function getTestStats(test: any): Promise<any> {
  const results = await ABTestResult.find({ testId: test._id }).lean();
  const totalResults = results.length;
  
  const variantStats: Record<string, any> = {};
  for (const variant of test.variants) {
    const variantResults = results.filter(r => r.variantId.equals(variant._id));
    variantStats[variant._id.toString()] = {
      variantName: variant.name,
      isControl: variant.isControl,
      sampleSize: variantResults.length,
      ...calculateVariantStatistics(variantResults),
    };
  }
  
  return {
    totalResults,
    variants: variantStats,
    status: test.status,
    startedAt: test.startedAt,
    completedAt: test.completedAt,
  };
}

async function calculateStatistics(test: any, results: any[]): Promise<any> {
  const variantStats: Record<string, any> = {};
  
  for (const variant of test.variants) {
    const variantResults = results.filter(r => r.variantId.equals(variant._id));
    variantStats[variant._id.toString()] = {
      variantName: variant.name,
      isControl: variant.isControl,
      ...calculateVariantStatistics(variantResults),
    };
  }
  
  return { variantStats };
}