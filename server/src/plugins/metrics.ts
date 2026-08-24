import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { FastifyInstance } from 'fastify';

// Create a Registry to register the metrics
export const register = new Registry();

// Add default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register, prefix: 'gateway_' });

// Custom metrics
export const httpRequestsTotal = new Counter({
  name: 'gateway_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'gateway_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const proxyRequestsTotal = new Counter({
  name: 'gateway_proxy_requests_total',
  help: 'Total number of proxy requests to LLM providers',
  labelNames: ['provider', 'model', 'status'],
  registers: [register],
});

export const proxyRequestDuration = new Histogram({
  name: 'gateway_proxy_request_duration_seconds',
  help: 'Proxy request latency in seconds',
  labelNames: ['provider', 'model'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const proxyTokensTotal = new Counter({
  name: 'gateway_proxy_tokens_total',
  help: 'Total tokens processed',
  labelNames: ['provider', 'model', 'type'], // type: input | output
  registers: [register],
});

export const proxyErrorsTotal = new Counter({
  name: 'gateway_proxy_errors_total',
  help: 'Total number of proxy errors',
  labelNames: ['provider', 'model', 'error_type'],
  registers: [register],
});

export const activeConnections = new Gauge({
  name: 'gateway_active_connections',
  help: 'Number of active connections',
  registers: [register],
});

export const activeUsers = new Gauge({
  name: 'gateway_active_users',
  help: 'Number of active users',
  registers: [register],
});

export const apiKeysTotal = new Gauge({
  name: 'gateway_api_keys_total',
  help: 'Total number of API keys',
  labelNames: ['provider', 'status'], // status: active | inactive
  registers: [register],
});

export const endpointsTotal = new Gauge({
  name: 'gateway_endpoints_total',
  help: 'Total number of endpoints',
  labelNames: ['provider', 'status'],
  registers: [register],
});

export const mappingsTotal = new Gauge({
  name: 'gateway_mappings_total',
  help: 'Total number of model mappings',
  labelNames: ['status'],
  registers: [register],
});

export const cacheHitsTotal = new Counter({
  name: 'gateway_cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheMissesTotal = new Counter({
  name: 'gateway_cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

export const fallbackActivationsTotal = new Counter({
  name: 'gateway_fallback_activations_total',
  help: 'Total fallback chain activations',
  labelNames: ['primary_model', 'fallback_model'],
  registers: [register],
});

export const webhookDeliveriesTotal = new Counter({
  name: 'gateway_webhook_deliveries_total',
  help: 'Total webhook deliveries',
  labelNames: ['event', 'status'],
  registers: [register],
});

export const personaEnforcementsTotal = new Counter({
  name: 'gateway_persona_enforcements_total',
  help: 'Total persona enforcements',
  labelNames: ['persona_id', 'provider', 'model'],
  registers: [register],
});

export const personaViolationsTotal = new Counter({
  name: 'gateway_persona_violations_total',
  help: 'Total persona violations detected',
  labelNames: ['persona_id', 'violation_type', 'severity'],
  registers: [register],
});

export const personaSwitchesTotal = new Counter({
  name: 'gateway_persona_switches_total',
  help: 'Total persona switches',
  labelNames: ['from_persona_id', 'to_persona_id', 'transition_type'],
  registers: [register],
});

export const personaTestsTotal = new Counter({
  name: 'gateway_persona_tests_total',
  help: 'Total persona tests run',
  labelNames: ['persona_id', 'result'],
  registers: [register],
});

export const templateApplicationsTotal = new Counter({
  name: 'gateway_template_applications_total',
  help: 'Total template applications',
  labelNames: ['template_id'],
  registers: [register],
});

// Metrics middleware for Fastify
export async function metricsPlugin(fastify: FastifyInstance) {
  // Expose metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  // Request tracking hook
  fastify.addHook('onRequest', async (request, reply) => {
    const startTime = process.hrtime.bigint();
    (request as any).metricsStartTime = startTime;
    activeConnections.inc();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const startTime = (request as any).metricsStartTime;
    if (startTime) {
      const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
      const route = request.routeOptions?.url || request.url;
      
      httpRequestsTotal.inc({
        method: request.method,
        route,
        status_code: reply.statusCode,
      });
      
      httpRequestDuration.observe({ method: request.method, route }, duration);
    }
    activeConnections.dec();
  });

  // Proxy-specific metrics
  fastify.decorate('metrics', {
    recordProxyRequest: (provider: string, model: string, status: 'success' | 'error', duration: number, tokensIn: number, tokensOut: number) => {
      proxyRequestsTotal.inc({ provider, model, status });
      proxyRequestDuration.observe({ provider, model }, duration);
      if (tokensIn > 0) proxyTokensTotal.inc({ provider, model, type: 'input' }, tokensIn);
      if (tokensOut > 0) proxyTokensTotal.inc({ provider, model, type: 'output' }, tokensOut);
    },
    recordProxyError: (provider: string, model: string, errorType: string) => {
      proxyErrorsTotal.inc({ provider, model, error_type: errorType });
    },
    recordFallback: (primaryModel: string, fallbackModel: string) => {
      fallbackActivationsTotal.inc({ primary_model: primaryModel, fallback_model: fallbackModel });
    },
    recordCacheHit: (cacheType: string) => {
      cacheHitsTotal.inc({ cache_type: cacheType });
    },
    recordCacheMiss: (cacheType: string) => {
      cacheMissesTotal.inc({ cache_type: cacheType });
    },
    recordWebhookDelivery: (event: string, status: 'success' | 'failed') => {
      webhookDeliveriesTotal.inc({ event, status });
    },
    recordPersonaEnforcement: (personaId: string, provider: string, model: string) => {
      personaEnforcementsTotal.inc({ persona_id: personaId, provider, model });
    },
    recordPersonaViolation: (personaId: string, violationType: string, severity: string) => {
      personaViolationsTotal.inc({ persona_id: personaId, violation_type: violationType, severity });
    },
    recordPersonaSwitch: (fromPersonaId: string, toPersonaId: string, transitionType: string) => {
      personaSwitchesTotal.inc({ from_persona_id: fromPersonaId, to_persona_id: toPersonaId, transition_type: transitionType });
    },
    recordPersonaTest: (personaId: string, result: string) => {
      personaTestsTotal.inc({ persona_id: personaId, result });
    },
    recordTemplateApplication: (templateId: string) => {
      templateApplicationsTotal.inc({ template_id: templateId });
    },
    updateGauges: (gauges: { activeUsers?: number; apiKeys?: { provider: string; active: number; inactive: number }[]; endpoints?: { provider: string; active: number; inactive: number }[]; mappings?: { active: number; inactive: number } }) => {
      if (gauges.activeUsers !== undefined) {
        activeUsers.set(gauges.activeUsers);
      }
      if (gauges.apiKeys) {
        for (const { provider, active, inactive } of gauges.apiKeys) {
          apiKeysTotal.set({ provider, status: 'active' }, active);
          apiKeysTotal.set({ provider, status: 'inactive' }, inactive);
        }
      }
      if (gauges.endpoints) {
        for (const { provider, active, inactive } of gauges.endpoints) {
          endpointsTotal.set({ provider, status: 'active' }, active);
          endpointsTotal.set({ provider, status: 'inactive' }, inactive);
        }
      }
      if (gauges.mappings) {
        mappingsTotal.set({ status: 'active' }, gauges.mappings.active);
        mappingsTotal.set({ status: 'inactive' }, gauges.mappings.inactive);
      }
    },
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      recordProxyRequest: (provider: string, model: string, status: 'success' | 'error', duration: number, tokensIn: number, tokensOut: number) => void;
      recordProxyError: (provider: string, model: string, errorType: string) => void;
      recordFallback: (primaryModel: string, fallbackModel: string) => void;
      recordCacheHit: (cacheType: string) => void;
      recordCacheMiss: (cacheType: string) => void;
      recordWebhookDelivery: (event: string, status: 'success' | 'failed') => void;
      recordPersonaEnforcement: (personaId: string, provider: string, model: string) => void;
      recordPersonaViolation: (personaId: string, violationType: string, severity: string) => void;
      recordPersonaSwitch: (fromPersonaId: string, toPersonaId: string, transitionType: string) => void;
      recordPersonaTest: (personaId: string, result: string) => void;
      recordTemplateApplication: (templateId: string) => void;
      updateGauges: (gauges: { activeUsers?: number; apiKeys?: { provider: string; active: number; inactive: number }[]; endpoints?: { provider: string; active: number; inactive: number }[]; mappings?: { active: number; inactive: number } }) => void;
    };
  }
}