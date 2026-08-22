import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { auth } from './config/auth';
import { connectDatabase } from './config/database';
import { authPlugin } from './config/auth';
import { keyRoutes } from './routes/keys';
import { endpointRoutes } from './routes/endpoints';
import { mappingRoutes } from './routes/mappings';
import { proxyRoutes } from './routes/proxy';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { healthRoutes } from './routes/health';
import env from './config';
import { User } from './models';

const fastify = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport: env.LOG_FORMAT === 'pretty' ? {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
    } : undefined,
  },
  ajv: { customOptions: { strict: false } },
});

async function start() {
  try {
    // Connect to database
    await connectDatabase();
    
    // Register plugins
    await fastify.register(fastifyCors, {
      origin: env.DASHBOARD_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
    
    await fastify.register(fastifyHelmet, {
      contentSecurityPolicy: false, // Disable for API
    });
    
    await fastify.register(fastifyRateLimit, {
      max: 100,
      timeWindow: '1 minute',
      keyGenerator: (req) => req.ip,
    });
    
    await fastify.register(fastifySensible);
    
    // Swagger/OpenAPI documentation
    await fastify.register(fastifySwagger, {
      openapi: {
        info: {
          title: 'Model Translation Gateway API',
          description: 'Translate Anthropic/Claude API requests to any LLM provider',
          version: '1.0.0',
        },
        servers: [{ url: `http://localhost:${env.PORT}`, description: 'Development server' }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
        security: [{ bearerAuth: [] }],
      },
    });
    
    await fastify.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true },
    });
    
    // Register auth plugin (adds request.auth)
    await fastify.register(authPlugin);
    
    // Register Better-Auth handler
    fastify.route({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      handler: async (request, reply) => {
        const response = await auth.handler(request.raw, reply.raw);
        return response;
      },
    });
    
    // Serve dashboard static files in production
    if (env.NODE_ENV === 'production') {
      await fastify.register(fastifyStatic, {
        root: './dashboard/dist',
        prefix: '/',
        decorateReply: false,
      });
      
      // SPA fallback
      fastify.setNotFoundHandler(async (request, reply) => {
        if (!request.url.startsWith('/api') && !request.url.startsWith('/docs') && !request.url.startsWith('/health')) {
          return reply.sendFile('index.html');
        }
        return reply.status(404).send({ error: 'Not found' });
      });
    }
    
    // Register routes
    await fastify.register(healthRoutes);
    await fastify.register(authRoutes);
    await fastify.register(keyRoutes, { prefix: '/api' });
    await fastify.register(endpointRoutes, { prefix: '/api' });
    await fastify.register(mappingRoutes, { prefix: '/api' });
    await fastify.register(proxyRoutes);
    await fastify.register(adminRoutes);
    
    // Global error handler
    fastify.setErrorHandler(async (error, request, reply) => {
      fastify.log.error(error);
      
      if (error.validation) {
        return reply.status(400).send({
          error: 'Validation Error',
          details: error.validation,
        });
      }
      
      if (error.statusCode === 401) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      
      if (error.statusCode === 403) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      
      return reply.status(500).send({ 
        error: 'Internal Server Error',
        message: env.NODE_ENV === 'development' ? error.message : undefined,
      });
    });
    
    // Start server
    await fastify.listen({ port: env.PORT, host: env.HOST });
    
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Model Translation Gateway                                   ║
║  Server running at http://${env.HOST}:${env.PORT}                        ║
║  Dashboard: ${env.DASHBOARD_URL}                                    ║
║  API Docs: http://${env.HOST}:${env.PORT}/docs                                  ║
║  Health: http://${env.HOST}:${env.PORT}/health                                 ║
╚══════════════════════════════════════════════════════════════╝
    `);
    
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await fastify.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...');
  await fastify.close();
  process.exit(0);
});

start();