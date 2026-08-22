import { FastifyInstance } from 'fastify';
import { auth } from '../config/auth';
import { User } from '../models';

export async function authRoutes(fastify: FastifyInstance) {
  // Better-Auth handles all OAuth routes automatically
  // We just need to expose the Better-Auth API endpoints
  
  // Get current user
  fastify.get('/api/auth/me', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    
    // Get full user with settings
    const fullUser = await User.findById(user.id).lean();
    
    return reply.send({
      user: {
        id: fullUser!._id,
        email: fullUser!.email,
        name: fullUser!.name,
        avatar: fullUser!.avatar,
        provider: fullUser!.provider,
        settings: fullUser!.settings,
        createdAt: fullUser!.createdAt,
      },
    });
  });
  
  // Logout (handled by Better-Auth)
  fastify.post('/api/auth/logout', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const session = request.auth.session!;
    await auth.api.revokeSession({ sessionId: session.id });
    return reply.send({ success: true });
  });
  
  // Update user settings
  fastify.patch('/api/auth/settings', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const updates = request.body as { theme?: string; requestTimeout?: number; defaultProvider?: string };
    
    const allowedUpdates = ['theme', 'requestTimeout', 'defaultProvider'];
    const filteredUpdates: Record<string, unknown> = {};
    
    for (const key of allowedUpdates) {
      if (updates[key as keyof typeof updates] !== undefined) {
        filteredUpdates[`settings.${key}`] = updates[key as keyof typeof updates];
      }
    }
    
    await User.findByIdAndUpdate(user.id, { $set: filteredUpdates });
    
    const updated = await User.findById(user.id).lean();
    
    return reply.send({
      user: {
        id: updated!._id,
        email: updated!.email,
        name: updated!.name,
        avatar: updated!.avatar,
        provider: updated!.provider,
        settings: updated!.settings,
      },
    });
  });
  
  // Better-Auth routes are mounted at /api/auth/*
  // The Better-Auth handler will handle:
  // GET  /api/auth/sign-in/social?provider=google
  // GET  /api/auth/sign-in/social?provider=github
  // GET  /api/auth/callback/google
  // GET  /api/auth/callback/github
  // POST /api/auth/sign-out
  // GET  /api/auth/session
  
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      // Forward to Better-Auth handler
      const response = await auth.handler(request.raw, reply.raw);
      return response;
    },
  });
}