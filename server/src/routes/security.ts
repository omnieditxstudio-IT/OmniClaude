import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SecurityRule, SecurityEvent, RateLimitRule, IPFilter } from '../models';
import { Types } from 'mongoose';

const CreateSecurityRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['rate_limit', 'ip_filter', 'request_validation', 'response_filter', 'anomaly_detection']),
  action: z.enum(['allow', 'block', 'throttle', 'challenge', 'log_only']),
  priority: z.number().min(0).max(1000).default(0),
  conditions: z.object({
    ipRanges: z.array(z.string()).optional(),
    userAgents: z.array(z.string()).optional(),
    paths: z.array(z.string()).optional(),
    methods: z.array(z.string()).optional(),
    headers: z.record(z.string()).optional(),
    geoCountries: z.array(z.string()).optional(),
    asnNumbers: z.array(z.string()).optional(),
    requestSize: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
    }).optional(),
    timeWindow: z.object({
      start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      timezone: z.string().optional(),
    }).optional(),
  }).optional(),
  rateLimit: z.object({
    maxRequests: z.number().min(1),
    windowMs: z.number().min(1000),
    keyGenerator: z.enum(['ip', 'user_id', 'api_key', 'custom']).default('ip'),
    customKey: z.string().optional(),
  }).optional(),
  anomalyDetection: z.object({
    enabled: z.boolean().default(false),
    threshold: z.number().min(1).max(100).default(95),
    metrics: z.array(z.enum(['request_rate', 'error_rate', 'latency', 'token_usage', 'unique_ips'])).optional(),
    windowMs: z.number().min(60000).default(300000),
  }).optional(),
  isActive: z.boolean().default(true),
  scope: z.enum(['global', 'organization', 'team', 'user', 'endpoint']).default('global'),
  scopeId: z.string().optional(),
});

const CreateRateLimitRuleSchema = z.object({
  name: z.string().min(1).max(100),
  keyType: z.enum(['ip', 'user_id', 'api_key', 'endpoint', 'model']),
  keyValue: z.string().optional(),
  maxRequests: z.number().min(1),
  windowMs: z.number().min(1000),
  action: z.enum(['block', 'throttle', 'queue']).default('block'),
  message: z.string().optional(),
  scope: z.enum(['global', 'organization', 'team', 'user', 'endpoint']).default('global'),
  scopeId: z.string().optional(),
});

const CreateIPFilterSchema = z.object({
  type: z.enum(['allow', 'deny']),
  ip: z.string(),
  cidr: z.string().optional(),
  description: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
  scope: z.enum(['global', 'organization', 'team', 'user', 'endpoint']).default('global'),
  scopeId: z.string().optional(),
});

export async function securityRoutes(fastify: FastifyInstance) {
  // Security Rules
  fastify.get('/api/security/rules', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { type, scope, scopeId, isActive, page = 1, limit = 50 } = request.query as {
      type?: string; scope?: string; scopeId?: string; isActive?: string; page?: number; limit?: number;
    };
    
    const query: any = {};
    if (type) query.type = type;
    if (scope) query.scope = scope;
    if (scopeId) query.scopeId = scopeId;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    
    const rules = await SecurityRule.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    
    const total = await SecurityRule.countDocuments(query);
    
    return reply.send({ rules, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });
  
  fastify.post('/api/security/rules', {
    schema: { body: CreateSecurityRuleSchema },
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const input = request.body as z.infer<typeof CreateSecurityRuleSchema>;
    
    const rule = await SecurityRule.create({
      ...input,
      createdBy: new Types.ObjectId(user.id),
    });
    
    // Reload rules in middleware
    await reloadSecurityRules(fastify);
    
    return reply.status(201).send({ rule });
  });
  
  fastify.get('/api/security/rules/:id', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const rule = await SecurityRule.findById(id);
    
    if (!rule) {
      return reply.status(404).send({ error: 'Rule not found' });
    }
    
    return reply.send({ rule });
  });
  
  fastify.patch('/api/security/rules/:id', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body;
    
    const rule = await SecurityRule.findByIdAndUpdate(id, { $set: updates }, { new: true });
    if (!rule) {
      return reply.status(404).send({ error: 'Rule not found' });
    }
    
    await reloadSecurityRules(fastify);
    
    return reply.send({ rule });
  });
  
  fastify.delete('/api/security/rules/:id', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await SecurityRule.deleteOne({ _id: id });
    
    if (deleted.deletedCount === 0) {
      return reply.status(404).send({ error: 'Rule not found' });
    }
    
    await reloadSecurityRules(fastify);
    
    return reply.send({ success: true });
  });
  
  // Rate Limit Rules
  fastify.get('/api/security/rate-limits', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { keyType, scope, scopeId, page = 1, limit = 50 } = request.query as {
      keyType?: string; scope?: string; scopeId?: string; page?: number; limit?: number;
    };
    
    const query: any = {};
    if (keyType) query.keyType = keyType;
    if (scope) query.scope = scope;
    if (scopeId) query.scopeId = scopeId;
    
    const rules = await RateLimitRule.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    
    const total = await RateLimitRule.countDocuments(query);
    
    return reply.send({ rules, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });
  
  fastify.post('/api/security/rate-limits', {
    schema: { body: CreateRateLimitRuleSchema },
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const input = request.body as z.infer<typeof CreateRateLimitRuleSchema>;
    
    const rule = await RateLimitRule.create({
      ...input,
      createdBy: new Types.ObjectId(user.id),
    });
    
    return reply.status(201).send({ rule });
  });
  
  fastify.delete('/api/security/rate-limits/:id', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await RateLimitRule.deleteOne({ _id: id });
    
    if (deleted.deletedCount === 0) {
      return reply.status(404).send({ error: 'Rate limit rule not found' });
    }
    
    return reply.send({ success: true });
  });
  
  // IP Filters
  fastify.get('/api/security/ip-filters', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { type, scope, scopeId, page = 1, limit = 50 } = request.query as {
      type?: string; scope?: string; scopeId?: string; page?: number; limit?: number;
    };
    
    const query: any = {};
    if (type) query.type = type;
    if (scope) query.scope = scope;
    if (scopeId) query.scopeId = scopeId;
    
    const filters = await IPFilter.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    
    const total = await IPFilter.countDocuments(query);
    
    return reply.send({ filters, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });
  
  fastify.post('/api/security/ip-filters', {
    schema: { body: CreateIPFilterSchema },
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const input = request.body as z.infer<typeof CreateIPFilterSchema>;
    
    // Parse IP/CIDR
    let ip = input.ip;
    let cidr = input.cidr;
    
    if (input.cidr) {
      // Validate CIDR
      const parts = input.cidr.split('/');
      if (parts.length !== 2 || isNaN(parseInt(parts[1]))) {
        return reply.status(400).send({ error: 'Invalid CIDR format' });
      }
      ip = parts[0];
      cidr = input.cidr;
    }
    
    const filter = await IPFilter.create({
      ...input,
      ip,
      cidr,
      createdBy: new Types.ObjectId(user.id),
    });
    
    return reply.status(201).send({ filter });
  });
  
  fastify.delete('/api/security/ip-filters/:id', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await IPFilter.deleteOne({ _id: id });
    
    if (deleted.deletedCount === 0) {
      return reply.status(404).send({ error: 'IP filter not found' });
    }
    
    return reply.send({ success: true });
  });
  
  // Security Events
  fastify.get('/api/security/events', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { ruleId, eventType, severity, startDate, endDate, page = 1, limit = 50 } = request.query as {
      ruleId?: string; eventType?: string; severity?: string; startDate?: string; endDate?: string; page?: number; limit?: number;
    };
    
    const query: any = {};
    if (ruleId) query.ruleId = ruleId;
    if (eventType) query.eventType = eventType;
    if (severity) query.severity = severity;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const events = await SecurityEvent.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    
    const total = await SecurityEvent.countDocuments(query);
    
    return reply.send({ events, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });
  
  fastify.get('/api/security/events/stats', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    
    const match: any = {};
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }
    
    const [byType, bySeverity, byRule, timeline] = await Promise.all([
      SecurityEvent.aggregate([
        { $match: match },
        { $group: { _id: '$eventType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      SecurityEvent.aggregate([
        { $match: match },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]),
      SecurityEvent.aggregate([
        { $match: match },
        { $group: { _id: '$ruleId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      SecurityEvent.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 168 }, // Last 7 days hourly
      ]),
    ]);
    
    return reply.send({ byType, bySeverity, byRule, timeline });
  });
  
  // Security dashboard
  fastify.get('/api/security/dashboard', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 3600000);
    const last7d = new Date(now.getTime() - 7 * 86400000);
    
    const [
      totalRules,
      activeRules,
      totalEvents24h,
      blockedRequests24h,
      topBlockedIPs,
      recentAlerts,
      rateLimitStats,
    ] = await Promise.all([
      SecurityRule.countDocuments(),
      SecurityRule.countDocuments({ isActive: true }),
      SecurityEvent.countDocuments({ createdAt: { $gte: last24h } }),
      SecurityEvent.countDocuments({ 
        createdAt: { $gte: last24h }, 
        action: 'block' 
      }),
      SecurityEvent.aggregate([
        { $match: { createdAt: { $gte: last24h }, action: 'block' } },
        { $group: { _id: '$clientIp', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      SecurityEvent.find({ 
        createdAt: { $gte: last7d }, 
        severity: { $in: ['high', 'critical'] } 
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      RateLimitRule.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: '$keyType',
            totalRules: { $sum: 1 },
            totalRequests: { $sum: '$currentCount' },
            blockedRequests: { $sum: '$blockedCount' },
          },
        }),
    ]);
    
    return reply.send({
      overview: {
        totalRules,
        activeRules,
        totalEvents24h,
        blockedRequests24h,
      },
      topBlockedIPs,
      recentAlerts,
      rateLimitStats,
    });
  });
  
  // Test security rule
  fastify.post('/api/security/rules/:id/test', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { testRequest } = request.body as { testRequest: any };
    
    const rule = await SecurityRule.findById(id);
    if (!rule) {
      return reply.status(404).send({ error: 'Rule not found' });
    }
    
    const result = evaluateRule(rule, testRequest || {
      ip: '192.168.1.1',
      userAgent: 'test-agent',
      path: '/api/test',
      method: 'POST',
      headers: {},
      body: {},
    });
    
    return reply.send({ result });
  });
}

// Middleware to evaluate security rules
export async function securityMiddleware(fastify: FastifyInstance) {
  // Load rules on startup
  await loadSecurityRules(fastify);
  
  fastify.addHook('onRequest', async (request, reply) => {
    const rules = (fastify as any).securityRules || [];
    const clientIp = request.ip;
    const userId = request.auth?.user?.id;
    const organizationId = request.auth?.user?.organizationId;
    const teamId = request.auth?.user?.teamId;
    
    for (const rule of rules) {
      // Check scope
      if (!matchesScope(rule, { userId, organizationId, teamId })) continue;
      
      // Evaluate conditions
      if (matchesConditions(rule, { 
        ip: clientIp,
        userAgent: request.headers['user-agent'],
        path: request.url,
        method: request.method,
        headers: request.headers,
        body: request.body,
      })) {
        // Check rate limit if configured
        if (rule.rateLimit) {
          const allowed = await checkRateLimit(rule, clientIp, userId);
          if (!allowed) {
            await logSecurityEvent({
              ruleId: rule._id,
              eventType: 'rate_limit_exceeded',
              severity: 'medium',
              action: 'block',
              clientIp,
              userId,
              message: 'Rate limit exceeded',
            });
            return reply.status(429).send({ 
              error: 'Rate limit exceeded',
              retryAfter: rule.rateLimit.windowMs / 1000,
            });
          }
        }
        
        // Check IP filter
        if (rule.conditions?.ipRanges?.length) {
          const allowed = rule.conditions.ipRanges.some((range: string) => {
            return matchIPRange(clientIp, range);
          });
          
          if (!allowed) {
            await logSecurityEvent({
              ruleId: rule._id,
              eventType: 'ip_blocked',
              severity: 'high',
              action: 'block',
              clientIp,
              message: 'IP blocked by security rule',
            });
            return reply.status(403).send({ error: 'Access denied' });
          }
        }
        
        // Execute action
        switch (rule.action) {
          case 'block':
            await logSecurityEvent({
              ruleId: rule._id,
              eventType: 'request_blocked',
              severity: 'high',
              action: 'block',
              clientIp,
              userId,
              message: 'Request blocked by security rule',
            });
            return reply.status(403).send({ error: 'Access denied by security policy' });
            
          case 'throttle':
            // Add delay
            await new Promise(r => setTimeout(r, 1000));
            break;
            
          case 'challenge':
            // Could implement CAPTCHA or similar
            break;
            
          case 'log_only':
          default:
            await logSecurityEvent({
              ruleId: rule._id,
              eventType: 'rule_matched',
              severity: 'low',
              action: 'log_only',
              clientIp,
              userId,
              message: 'Security rule matched (log only)',
            });
            break;
        }
        
        // If action is block/throttle, stop processing further rules
        if (['block', 'throttle'].includes(rule.action)) {
          break;
        }
      }
    }
  });
  
  // Periodic rule reload
  setInterval(async () => {
    await loadSecurityRules(fastify);
  }, 60000); // Every minute
}

function matchesScope(rule: any, context: { userId?: string; organizationId?: string; teamId?: string }): boolean {
  switch (rule.scope) {
    case 'global':
      return true;
    case 'user':
      return rule.scopeId === context.userId;
    case 'organization':
      return rule.scopeId === context.organizationId;
    case 'team':
      return rule.scopeId === context.teamId;
    case 'endpoint':
      // Would need endpoint context
      return false;
    default:
      return false;
  }
}

function matchesConditions(rule: any, request: any): boolean {
  if (!rule.conditions) return true;
  
  const c = rule.conditions;
  
  if (c.ipRanges?.length) {
    const matched = c.ipRanges.some((range: string) => matchIPRange(request.ip, range));
    if (!matched) return false;
  }
  
  if (c.userAgents?.length) {
    const matched = c.userAgents.some((ua: string) => 
      request.userAgent?.toLowerCase().includes(ua.toLowerCase())
    );
    if (!matched) return false;
  }
  
  if (c.paths?.length) {
    const matched = c.paths.some((path: string) => 
      request.path.startsWith(path) || matchPath(path, request.path)
    );
    if (!matched) return false;
  }
  
  if (c.methods?.length) {
    if (!c.methods.includes(request.method)) return false;
  }
  
  if (c.headers) {
    for (const [key, value] of Object.entries(c.headers)) {
      if (request.headers[key.toLowerCase()] !== value) return false;
    }
  }
  
  if (c.geoCountries?.length) {
    // Would need GeoIP lookup
  }
  
  if (c.asnNumbers?.length) {
    // Would need ASN lookup
  }
  
  if (c.requestSize) {
    const size = JSON.stringify(request.body).length;
    if (c.requestSize.min && size < c.requestSize.min) return false;
    if (c.requestSize.max && size > c.requestSize.max) return false;
  }
  
  if (c.timeWindow) {
    const now = new Date();
    const tz = c.timeWindow.timezone || 'UTC';
    // Simplified time check
  }
  
  return true;
}

function matchIPRange(ip: string, range: string): boolean {
  if (range.includes('/')) {
    // CIDR notation
    const [rangeIp, prefixLength] = range.split('/');
    const prefix = parseInt(prefixLength);
    const ipParts = ip.split('.').map(Number);
    const rangeParts = rangeIp.split('.').map(Number);
    
    const mask = ~((1 << (32 - prefix)) - 1);
    const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
    
    return (ipNum & mask) === (rangeNum & mask);
  }
  
  return ip === range;
}

function matchPath(pattern: string, path: string): boolean {
  // Convert glob pattern to regex
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return regex.test(path);
}

async function checkRateLimit(rule: any, ip: string, userId?: string): Promise<boolean> {
  // Implementation would use Redis for distributed rate limiting
  return true; // Placeholder
}

async function logSecurityEvent(event: any): Promise<void> {
  const { SecurityEvent } = await import('../models');
  await SecurityEvent.create({
    ...event,
    createdAt: new Date(),
  });
}

async function loadSecurityRules(fastify: FastifyInstance): Promise<void> {
  const { SecurityRule } = await import('../models');
  const rules = await SecurityRule.find({ isActive: true })
    .sort({ priority: -1 })
    .lean();
  
  (fastify as any).securityRules = rules;
}

async function reloadSecurityRules(fastify: FastifyInstance): Promise<void> {
  await loadSecurityRules(fastify);
}

// Admin middleware
async function requireAdmin(request: any, reply: any) {
  const user = request.auth.user;
  const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
  if (!adminEmails.includes(user.email)) {
    return reply.status(403).send({ error: 'Admin access required' });
  }
}