import { FastifyInstance } from 'fastify';
import { initializeTracing } from '../plugins/tracing';

export async function tracingPlugin(fastify: FastifyInstance) {
  // Initialize OpenTelemetry tracing
  await initializeTracing();
  
  // Add request tracing hook
  fastify.addHook('onRequest', async (request, reply) => {
    const { createGatewaySpan } = await import('../plugins/tracing');
    const span = createGatewaySpan(`${request.method} ${request.url}`, {
      'http.method': request.method,
      'http.url': request.url,
      'http.route': request.routeOptions?.url || request.url,
      'gateway.user_id': request.auth?.user?.id,
    });
    
    // Store span on request for later use
    (request as any).otelSpan = span;
  });
  
  fastify.addHook('onResponse', async (request, reply) => {
    const span = (request as any).otelSpan;
    if (span) {
      span.setAttribute('http.status_code', reply.statusCode);
      span.setAttribute('gateway.latency_ms', Date.now() - (request as any).startTime);
      span.end();
    }
  });
  
  // Error tracing hook
  fastify.addHook('onError', async (request, reply, error) => {
    const span = (request as any).otelSpan;
    if (span) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message }); // ERROR
      span.end();
    }
  });
}