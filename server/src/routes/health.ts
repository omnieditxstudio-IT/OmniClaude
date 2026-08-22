import { FastifyInstance } from 'fastify';
import { getConnection } from '../config/database';

export async function healthRoutes(fastify: FastifyInstance) {
  // Basic health check
  fastify.get('/health', async (request, reply) => {
    const dbState = getConnection().readyState;
    const dbStatus = dbState === 1 ? 'connected' : 
                     dbState === 2 ? 'connecting' : 
                     dbState === 3 ? 'disconnecting' : 'disconnected';
    
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });
  
  // Detailed health check (requires auth)
  fastify.get('/health/detailed', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.auth.user!;
    const dbState = getConnection().readyState;
    
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: dbState === 1 ? 'connected' : 'disconnected',
        readyState: dbState,
        host: getConnection().host,
        name: getConnection().name,
      },
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.env.npm_package_version || '1.0.0',
      user: { id: user.id, email: user.email },
    });
  });
  
  // Readiness probe (for Kubernetes)
  fastify.get('/ready', async (request, reply) => {
    const dbState = getConnection().readyState;
    
    if (dbState !== 1) {
      return reply.status(503).send({ status: 'not ready', database: 'disconnected' });
    }
    
    return reply.send({ status: 'ready' });
  });
  
  // Liveness probe (for Kubernetes)
  fastify.get('/live', async (request, reply) => {
    return reply.send({ status: 'alive' });
  });
}