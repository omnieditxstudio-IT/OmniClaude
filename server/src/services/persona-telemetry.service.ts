import { FastifyInstance } from 'fastify';

export interface PersonaTelemetryEvent {
  type: 'enforcement' | 'violation' | 'switch' | 'test' | 'template_application' | 'audit';
  personaId?: string;
  userId?: string;
  provider?: string;
  model?: string;
  data?: Record<string, any>;
  timestamp?: Date;
}

export class PersonaTelemetryService {
  private fastify: FastifyInstance | null = null;

  initialize(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  private record(event: PersonaTelemetryEvent) {
    if (!this.fastify) return;

    const timestamp = event.timestamp || new Date();

    // Record metrics if available
    if (this.fastify.metrics) {
      switch (event.type) {
        case 'enforcement':
          if (event.personaId && event.provider && event.model) {
            this.fastify.metrics.recordPersonaEnforcement(event.personaId, event.provider, event.model);
          }
          break;
        case 'violation':
          if (event.personaId && event.data) {
            this.fastify.metrics.recordPersonaViolation(
              event.personaId,
              event.data.violationType || 'unknown',
              event.data.severity || 'medium'
            );
          }
          break;
        case 'switch':
          if (event.data) {
            this.fastify.metrics.recordPersonaSwitch(
              event.data.fromPersonaId || 'unknown',
              event.personaId || 'unknown',
              event.data.transitionType || 'immediate'
            );
          }
          break;
        case 'test':
          if (event.personaId && event.data) {
            this.fastify.metrics.recordPersonaTest(event.personaId, event.data.result || 'unknown');
          }
          break;
        case 'template_application':
          if (event.data?.templateId) {
            this.fastify.metrics.recordTemplateApplication(event.data.templateId);
          }
          break;
      }
    }

    // Could also emit to external telemetry systems here
    // e.g. OpenTelemetry spans, logs, etc.
  }

  recordEnforcement(personaId: string, provider: string, model: string, userId?: string) {
    this.record({
      type: 'enforcement',
      personaId,
      provider,
      model,
      userId,
      data: { action: 'request_enforced' },
    });
  }

  recordViolation(personaId: string, violationType: string, severity: string, data?: Record<string, any>, userId?: string) {
    this.record({
      type: 'violation',
      personaId,
      userId,
      data: { violationType, severity, ...data },
    });
  }

  recordSwitch(fromPersonaId: string, toPersonaId: string, transitionType: string, userId?: string) {
    this.record({
      type: 'switch',
      personaId: toPersonaId,
      userId,
      data: { fromPersonaId, transitionType },
    });
  }

  recordTest(personaId: string, result: 'passed' | 'failed', testCount: number, passedCount: number, userId?: string) {
    this.record({
      type: 'test',
      personaId,
      userId,
      data: { result, testCount, passedCount },
    });
  }

  recordTemplateApplication(templateId: string, userId?: string) {
    this.record({
      type: 'template_application',
      userId,
      data: { templateId },
    });
  }

  recordAudit(personaId: string, action: string, userId?: string, data?: Record<string, any>) {
    this.record({
      type: 'audit',
      personaId,
      userId,
      data: { action, ...data },
    });
  }
}

export const personaTelemetryService = new PersonaTelemetryService();
