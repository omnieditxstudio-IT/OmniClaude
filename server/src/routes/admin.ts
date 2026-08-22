import { FastifyInstance } from 'fastify';
import { RequestLog } from '../models';
import { User } from '../models';

export async function adminRoutes(fastify: FastifyInstance) {
  // Admin only - list all users
  fastify.get('/api/admin/users', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { page = 1, limit = 20, search } = request.query as { page?: number; limit?: number; search?: string };
    
    const query: any = {};
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }
    
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-settings')
      .lean();
    
    const total = await User.countDocuments(query);
    
    return reply.send({
      users: users.map(u => ({
        id: u._id,
        email: u.email,
        name: u.name,
        avatar: u.avatar,
        provider: u.provider,
        createdAt: u.createdAt,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });
  
  // Admin only - get user details
  fastify.get('/api/admin/users/:id', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = await User.findById(id).lean();
    
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }
    
    return reply.send({ user });
  });
  
  // Admin only - get analytics
  fastify.get('/api/admin/analytics', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    
    const match: any = {};
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }
    
    const [totalRequests, totalTokens, avgLatency, errorRate, topModels, topUsers] = await Promise.all([
      RequestLog.countDocuments(match),
      RequestLog.aggregate([
        { $match: match },
        { $group: { _id: null, input: { $sum: '$inputTokens' }, output: { $sum: '$outputTokens' } } },
      ]),
      RequestLog.aggregate([
        { $match: match },
        { $group: { _id: null, avg: { $avg: '$latencyMs' } } },
      ]),
      RequestLog.aggregate([
        { $match: { ...match, statusCode: { $gte: 400 } } },
        { $count: 'errors' },
      ]),
      RequestLog.aggregate([
        { $match: match },
        { $group: { _id: '$claudeModelId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      RequestLog.aggregate([
        { $match: match },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);
    
    const tokens = totalTokens[0] || { input: 0, output: 0 };
    const errors = errorRate[0]?.errors || 0;
    
    return reply.send({
      totalRequests,
      totalInputTokens: tokens.input,
      totalOutputTokens: tokens.output,
      avgLatencyMs: Math.round(avgLatency[0]?.avg || 0),
      errorRate: totalRequests > 0 ? (errors / totalRequests) * 100 : 0,
      topModels,
      topUsers,
    });
  });
  
  // Admin only - get recent logs
  fastify.get('/api/admin/logs', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { page = 1, limit = 50, statusCode, userId } = request.query as { 
      page?: number; 
      limit?: number; 
      statusCode?: string; 
      userId?: string;
    };
    
    const match: any = {};
    if (statusCode) match.statusCode = parseInt(statusCode);
    if (userId) match.userId = userId;
    
    const logs = await RequestLog.find(match)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'email name')
      .lean();
    
    const total = await RequestLog.countDocuments(match);
    
    return reply.send({
      logs: logs.map(l => ({
        id: l._id,
        user: l.userId,
        claudeModelId: l.claudeModelId,
        providerModelId: l.providerModelId,
        requestType: l.requestType,
        inputTokens: l.inputTokens,
        outputTokens: l.outputTokens,
        latencyMs: l.latencyMs,
        statusCode: l.statusCode,
        error: l.error,
        createdAt: l.createdAt,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });
}

async function requireAdmin(request: any, reply: any) {
  const user = request.auth.user;
  // Check if user is admin (you can add an admin field to user model)
  // For now, check if email is in admin list
  const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
  if (!adminEmails.includes(user.email)) {
    return reply.status(403).send({ error: 'Admin access required' });
  }
}