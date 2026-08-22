import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Budget, BudgetAlert, UsageRecord } from '../models';
import { Types } from 'mongoose';

const CreateBudgetSchema = z.object({
  name: z.string().min(1).max(100),
  scope: z.enum(['user', 'team', 'organization']),
  scopeId: z.string(),
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  limits: z.object({
    maxRequests: z.number().min(1).optional(),
    maxInputTokens: z.number().min(1).optional(),
    maxOutputTokens: z.number().min(1).optional(),
    maxTotalTokens: z.number().min(1).optional(),
    maxCostUsd: z.number().min(0.01).optional(),
  }),
  alerts: z.array(z.object({
    threshold: z.number().min(0).max(100), // percentage
    channels: z.array(z.enum(['email', 'webhook', 'slack', 'in_app'])),
    webhookUrl: z.string().url().optional(),
  })).optional(),
  actions: z.array(z.object({
    trigger: z.enum(['warning', 'critical', 'exceeded']),
    action: z.enum(['notify', 'throttle', 'block', 'switch_cheaper_model']),
    config: z.record(z.any()).optional(),
  })).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  timezone: z.string().default('UTC'),
});

const UpdateBudgetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  limits: z.object({
    maxRequests: z.number().min(1).optional(),
    maxInputTokens: z.number().min(1).optional(),
    maxOutputTokens: z.number().min(1).optional(),
    maxTotalTokens: z.number().min(1).optional(),
    maxCostUsd: z.number().min(0.01).optional(),
  }).optional(),
  alerts: z.array(z.object({
    threshold: z.number().min(0).max(100),
    channels: z.array(z.enum(['email', 'webhook', 'slack', 'in_app'])),
    webhookUrl: z.string().url().optional(),
  })).optional(),
  actions: z.array(z.object({
    trigger: z.enum(['warning', 'critical', 'exceeded']),
    action: z.enum(['notify', 'throttle', 'block', 'switch_cheaper_model']),
    config: z.record(z.any()).optional(),
  })).optional(),
  isActive: z.boolean().optional(),
});

interface BudgetUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  periodStart: Date;
  periodEnd: Date;
}

export async function budgetRoutes(fastify: FastifyInstance) {
  // Create budget
  fastify.post('/api/budgets', {
    schema: { body: CreateBudgetSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const input = request.body as z.infer<typeof CreateBudgetSchema>;
    
    // Verify user has permission to create budget for scope
    if (!await canManageBudget(user.id, input.scope, input.scopeId)) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
    
    const budget = await Budget.create({
      ...input,
      scopeId: new Types.ObjectId(input.scopeId),
      createdBy: new Types.ObjectId(user.id),
      isActive: true,
      currentUsage: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
      },
    });
    
    return reply.status(201).send({ budget });
  });
  
  // List budgets
  fastify.get('/api/budgets', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { scope, scopeId, isActive } = request.query as { 
      scope?: string; 
      scopeId?: string; 
      isActive?: string; 
    };
    
    const query: any = { createdBy: new Types.ObjectId(user.id) };
    if (scope) query.scope = scope;
    if (scopeId) query.scopeId = new Types.ObjectId(scopeId);
    if (isActive !== undefined) query.isActive = isActive === 'true';
    
    const budgets = await Budget.find(query).sort({ createdAt: -1 }).lean();
    
    // Calculate current usage for each budget
    const budgetsWithUsage = await Promise.all(
      budgets.map(async (budget) => {
        const usage = await getCurrentUsage(budget);
        const percentages = calculatePercentages(usage, budget.limits);
        return { ...budget, usage, percentages };
      })
    );
    
    return reply.send({ budgets: budgetsWithUsage });
  });
  
  // Get budget details
  fastify.get('/api/budgets/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const budget = await Budget.findOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (!budget) {
      return reply.status(404).send({ error: 'Budget not found' });
    }
    
    const usage = await getCurrentUsage(budget);
    const percentages = calculatePercentages(usage, budget.limits);
    const alerts = await BudgetAlert.find({ budgetId: budget._id }).sort({ createdAt: -1 }).limit(50).lean();
    const usageHistory = await getUsageHistory(budget, 30); // Last 30 periods
    
    return reply.send({ budget: { ...budget, usage, percentages, alerts, usageHistory } });
  });
  
  // Update budget
  fastify.patch('/api/budgets/:id', {
    schema: { body: UpdateBudgetSchema },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const updates = request.body;
    
    const budget = await Budget.findOneAndUpdate(
      { _id: id, createdBy: new Types.ObjectId(user.id) },
      { $set: updates },
      { new: true }
    );
    
    if (!budget) {
      return reply.status(404).send({ error: 'Budget not found or unauthorized' });
    }
    
    return reply.send({ budget });
  });
  
  // Delete budget
  fastify.delete('/api/budgets/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const deleted = await Budget.deleteOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (deleted.deletedCount === 0) {
      return reply.status(404).send({ error: 'Budget not found' });
    }
    
    return reply.send({ success: true });
  });
  
  // Get budget usage (real-time)
  fastify.get('/api/budgets/:id/usage', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const budget = await Budget.findOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (!budget) {
      return reply.status(404).send({ error: 'Budget not found' });
    }
    
    const usage = await getCurrentUsage(budget);
    const percentages = calculatePercentages(usage, budget.limits);
    const projected = projectUsage(usage, budget.period);
    
    return reply.send({ usage, percentages, projected });
  });
  
  // Get budget alerts
  fastify.get('/api/budgets/:id/alerts', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const { page = 1, limit = 50, status } = request.query as { 
      page?: number; 
      limit?: number; 
      status?: string; 
    };
    
    const budget = await Budget.findOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (!budget) {
      return reply.status(404).send({ error: 'Budget not found' });
    }
    
    const query: any = { budgetId: budget._id };
    if (status) query.status = status;
    
    const alerts = await BudgetAlert.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    
    const total = await BudgetAlert.countDocuments(query);
    
    return reply.send({ alerts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });
  
  // Acknowledge alert
  fastify.post('/api/budgets/alerts/:alertId/acknowledge', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { alertId } = request.params as { alertId: string };
    
    const alert = await BudgetAlert.findByIdAndUpdate(
      alertId,
      { $set: { status: 'acknowledged', acknowledgedBy: user.id, acknowledgedAt: new Date() } },
      { new: true }
    );
    
    if (!alert) {
      return reply.status(404).send({ error: 'Alert not found' });
    }
    
    return reply.send({ alert });
  });
  
  // Cost forecast
  fastify.get('/api/budgets/:id/forecast', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    const { periods = 3 } = request.query as { periods?: number };
    
    const budget = await Budget.findOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (!budget) {
      return reply.status(404).send({ error: 'Budget not found' });
    }
    
    const forecast = await forecastCosts(budget, periods);
    return reply.send({ forecast });
  });
  
  // Cost optimization recommendations
  fastify.get('/api/budgets/:id/recommendations', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const { id } = request.params as { id: string };
    
    const budget = await Budget.findOne({ _id: id, createdBy: new Types.ObjectId(user.id) });
    if (!budget) {
      return reply.status(404).send({ error: 'Budget not found' });
    }
    
    const recommendations = await getCostOptimizationRecommendations(budget);
    return reply.send({ recommendations });
  });
}

// Helper functions
async function canManageBudget(userId: string, scope: string, scopeId: string): Promise<boolean> {
  // Check if user is owner/admin of the scope
  switch (scope) {
    case 'user':
      return userId === scopeId;
    case 'team':
      const { teamService } = await import('../services/team.service');
      const role = await teamService.getUserRole(scopeId, userId);
      return role === 'owner' || role === 'admin';
    case 'organization':
      const { organizationService } = await import('../services/organization.service');
      const org = await organizationService.findById(scopeId);
      return org?.ownerId.toString() === userId;
    default:
      return false;
  }
}

async function getCurrentUsage(budget: any): Promise<BudgetUsage> {
  const { RequestLog } = await import('../models');
  
  const now = new Date();
  let periodStart: Date;
  
  switch (budget.period) {
    case 'daily':
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'weekly':
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      break;
    case 'monthly':
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'yearly':
      periodStart = new Date(now.getFullYear(), 0, 1);
      break;
  }
  
  const periodEnd = new Date(now);
  
  const match: any = {
    createdAt: { $gte: periodStart, $lte: periodEnd },
  };
  
  // Add scope filter
  switch (budget.scope) {
    case 'user':
      match.userId = budget.scopeId;
      break;
    case 'team':
      match.teamId = budget.scopeId;
      break;
    case 'organization':
      match.organizationId = budget.scopeId;
      break;
  }
  
  const logs = await RequestLog.find(match).lean();
  
  return {
    requests: logs.length,
    inputTokens: logs.reduce((sum, l) => sum + l.inputTokens, 0),
    outputTokens: logs.reduce((sum, l) => sum + l.outputTokens, 0),
    totalTokens: logs.reduce((sum, l) => sum + l.inputTokens + l.outputTokens, 0),
    costUsd: logs.reduce((sum, l) => sum + (l.inputTokens + l.outputTokens) * 0.001 / 1000, 0), // Estimate
    periodStart,
    periodEnd,
  };
}

function calculatePercentages(usage: BudgetUsage, limits: any): Record<string, number> {
  const percentages: Record<string, number> = {};
  
  if (limits.maxRequests) percentages.requests = (usage.requests / limits.maxRequests) * 100;
  if (limits.maxInputTokens) percentages.inputTokens = (usage.inputTokens / limits.maxInputTokens) * 100;
  if (limits.maxOutputTokens) percentages.outputTokens = (usage.outputTokens / limits.maxOutputTokens) * 100;
  if (limits.maxTotalTokens) percentages.totalTokens = (usage.totalTokens / limits.maxTotalTokens) * 100;
  if (limits.maxCostUsd) percentages.costUsd = (usage.costUsd / limits.maxCostUsd) * 100;
  
  return percentages;
}

async function getUsageHistory(budget: any, periods: number): Promise<BudgetUsage[]> {
  const { RequestLog } = await import('../models');
  const history: BudgetUsage[] = [];
  
  for (let i = 0; i < periods; i++) {
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() - i);
    periodEnd.setDate(1);
    periodEnd.setHours(0, 0, 0, 0);
    
    const periodStart = new Date(periodEnd);
    periodStart.setMonth(periodStart.getMonth() - 1);
    
    const match: any = {
      createdAt: { $gte: periodStart, $lt: periodEnd },
    };
    
    switch (budget.scope) {
      case 'user':
        match.userId = budget.scopeId;
        break;
      case 'team':
        match.teamId = budget.scopeId;
        break;
      case 'organization':
        match.organizationId = budget.scopeId;
        break;
    }
    
    const logs = await RequestLog.find(match).lean();
    
    history.push({
      requests: logs.length,
      inputTokens: logs.reduce((sum, l) => sum + l.inputTokens, 0),
      outputTokens: logs.reduce((sum, l) => sum + l.outputTokens, 0),
      totalTokens: logs.reduce((sum, l) => sum + l.inputTokens + l.outputTokens, 0),
      costUsd: logs.reduce((sum, l) => sum + (l.inputTokens + l.outputTokens) * 0.001 / 1000, 0),
      periodStart,
      periodEnd,
    });
  }
  
  return history.reverse();
}

function projectUsage(usage: BudgetUsage, period: string): BudgetUsage {
  const now = new Date();
  let elapsedMs: number;
  let totalMs: number;
  
  switch (period) {
    case 'daily':
      elapsedMs = now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000;
      totalMs = 24 * 3600000;
      break;
    case 'weekly':
      elapsedMs = (now.getDay() * 86400000) + now.getHours() * 3600000 + now.getMinutes() * 60000;
      totalMs = 7 * 86400000;
      break;
    case 'monthly':
      elapsedMs = (now.getDate() - 1) * 86400000 + now.getHours() * 3600000;
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      totalMs = daysInMonth * 86400000;
      break;
    default:
      elapsedMs = now.getTime() - new Date(now.getFullYear(), 0, 1).getTime();
      totalMs = new Date(now.getFullYear() + 1, 0, 1).getTime() - new Date(now.getFullYear(), 0, 1).getTime();
  }
  
  const progress = elapsedMs / totalMs;
  const multiplier = progress > 0 ? 1 / progress : 1;
  
  return {
    requests: Math.round(usage.requests * multiplier),
    inputTokens: Math.round(usage.inputTokens * multiplier),
    outputTokens: Math.round(usage.outputTokens * multiplier),
    totalTokens: Math.round(usage.totalTokens * multiplier),
    costUsd: usage.costUsd * multiplier,
    periodStart: usage.periodStart,
    periodEnd: usage.periodEnd,
  };
}

async function forecastCosts(budget: any, periods: number): Promise<any[]> {
  const history = await getUsageHistory(budget, 12); // Last 12 periods
  
  // Simple linear regression for forecasting
  const forecasts = [];
  for (let i = 1; i <= periods; i++) {
    const recentCosts = history.slice(-3).map(h => h.costUsd);
    const avgCost = recentCosts.reduce((a, b) => a + b, 0) / recentCosts.length;
    const trend = (recentCosts[2] - recentCosts[0]) / 2; // Monthly trend
    
    forecasts.push({
      period: i,
      estimatedCost: Math.max(0, avgCost + trend * i),
      confidence: Math.max(0.5, 1 - i * 0.1), // Decreasing confidence
    });
  }
  
  return forecasts;
}

async function getCostOptimizationRecommendations(budget: any): Promise<any[]> {
  const recommendations = [];
  
  const { Endpoint } = await import('../models');
  const endpoints = await Endpoint.find({ 
    $or: [
      { userId: budget.scopeId },
      { organizationId: budget.scopeId },
      { teamId: budget.scopeId },
    ],
    isActive: true,
  }).lean();
  
  // Find cheaper alternatives
  const modelCosts: Record<string, { input: number; output: number }> = {};
  for (const endpoint of endpoints) {
    for (const model of endpoint.models) {
      if (model.pricing) {
        const key = `${endpoint.provider}:${model.id}`;
        if (!modelCosts[key] || modelCosts[key].input > model.pricing.inputPer1k) {
          modelCosts[key] = {
            input: model.pricing.inputPer1k,
            output: model.pricing.outputPer1k,
          };
        }
      }
    }
    
    // Find models that have cheaper alternatives
    for (const [key, cost] of Object.entries(modelCosts)) {
      const [provider, modelId] = key.split(':');
      const alternatives = Object.entries(modelCosts)
        .filter(([k, c]) => k.startsWith(provider + ':') && c.input < cost.input)
        .sort((a, b) => a[1].input - b[1].input);
      
      if (alternatives.length > 0) {
        const savings = cost.input - alternatives[0][1].input;
        recommendations.push({
          type: 'cheaper_alternative',
          currentModel: key,
          recommendedModel: alternatives[0][0],
          estimatedSavingsPer1k: savings,
          confidence: 0.8,
        });
      }
    }
  
  // Check for unused endpoints
  const { RequestLog } = await import('../models');
  const recentLogs = await RequestLog.find({
    createdAt: { $gte: new Date(Date.now() - 30 * 86400000) },
  }).lean();
  
  const usedEndpoints = new Set(recentLogs.map(l => l.endpointId.toString()));
  const unusedEndpoints = endpoints.filter(e => !usedEndpoints.has(e._id.toString()));
  
  for (const endpoint of unusedEndpoints) {
    recommendations.push({
      type: 'unused_endpoint',
      endpointId: endpoint._id,
      endpointName: endpoint.name,
      message: 'Endpoint not used in last 30 days',
      action: 'Consider removing or disabling',
    });
  }
  
  return recommendations;
}