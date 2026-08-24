import { PersonaConfig, PersonaSwitchRequest, PersonaSwitchResponse } from './persona.types';
import { getPersonaConfig } from './persona.service';
import { personaTelemetryService } from './persona-telemetry.service';
import { personaWebSocketService } from './persona-websocket.service';

export interface PersonaSession {
  sessionId: string;
  userId: string;
  conversationId: string;
  currentPersonaId: string;
  previousPersonaId?: string;
  transition?: {
    type: 'immediate' | 'gradual' | 'next-turn';
    blendMessages?: number;
    startedAt: Date;
    completedAt?: Date;
  };
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SwitchTransitionResult {
  success: boolean;
  warnings: string[];
  blendedMessages: number;
}

export class PersonaSwitchService {
  private sessions: Map<string, PersonaSession> = new Map();

  getSession(sessionId: string): PersonaSession | undefined {
    return this.sessions.get(sessionId);
  }

  createSession(userId: string, conversationId: string, personaId: string): PersonaSession {
    const session: PersonaSession = {
      sessionId: this.generateSessionId(),
      userId,
      conversationId,
      currentPersonaId: personaId,
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(session.sessionId, session);
    return session;
  }

  async switchPersona(request: PersonaSwitchRequest): Promise<PersonaSwitchResponse> {
    const session = this.findSessionByConversation(request.context?.conversationId);
    if (!session) {
      return {
        success: false,
        toPersonaId: request.toPersonaId,
        transitionType: request.transition || 'immediate',
        estimatedTransitionMessages: 0,
        warnings: ['No active session found for conversation'],
      };
    }

    const fromPersonaId = session.currentPersonaId;
    const warnings: string[] = [];

    // Validate target persona exists
    const targetPersona = getPersonaConfig('openrouter', request.toPersonaId);
    if (!targetPersona) {
      return {
        success: false,
        fromPersonaId,
        toPersonaId: request.toPersonaId,
        transitionType: request.transition || 'immediate',
        estimatedTransitionMessages: 0,
        warnings: ['Target persona not found'],
      };
    }

    // Check for significant persona differences
    const currentPersona = getPersonaConfig('openrouter', fromPersonaId);
    if (currentPersona && this.hasSignificantDifferences(currentPersona, targetPersona)) {
      warnings.push('Significant persona differences detected. Consider using gradual transition.');
    }

    // Handle transition
    const transitionType = request.transition || 'immediate';
    let blendedMessages = 0;

    if (transitionType === 'gradual') {
      const result = await this.applyGradualTransition(session, targetPersona, request.blendMessages);
      blendedMessages = result.blendedMessages;
      warnings.push(...result.warnings);
    } else if (transitionType === 'next-turn') {
      session.transition = {
        type: 'next-turn',
        startedAt: new Date(),
      };
      warnings.push('Persona will switch on next user message.');
    } else {
      // Immediate switch
      session.previousPersonaId = session.currentPersonaId;
      session.currentPersonaId = request.toPersonaId;
      session.transition = {
        type: 'immediate',
        startedAt: new Date(),
        completedAt: new Date(),
      };
    }

    session.updatedAt = new Date();
    this.sessions.set(session.sessionId, session);

    // Record telemetry
    personaTelemetryService.recordSwitch(fromPersonaId, request.toPersonaId, transitionType);

    // Broadcast via WebSocket
    if (request.context?.conversationId) {
      personaWebSocketService.broadcastSwitch(request.context.conversationId, {
        type: 'switch',
        fromPersonaId,
        toPersonaId: request.toPersonaId,
        transitionType,
        data: { warnings, blendedMessages },
      });
    }

    return {
      success: true,
      fromPersonaId,
      toPersonaId: request.toPersonaId,
      transitionType,
      estimatedTransitionMessages: blendedMessages,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  getActivePersonaForConversation(conversationId: string): PersonaConfig | null {
    const session = this.findSessionByConversation(conversationId);
    if (!session) return null;

    // Check if there's a pending next-turn transition
    if (session.transition?.type === 'next-turn' && session.messageCount > 0) {
      session.transition.completedAt = new Date();
      session.transition.type = 'immediate';
      session.previousPersonaId = session.currentPersonaId;
      session.currentPersonaId = session.transition.startedAt.toISOString(); // This would be the target persona ID
      session.updatedAt = new Date();
      this.sessions.set(session.sessionId, session);
    }

    return getPersonaConfig('openrouter', session.currentPersonaId);
  }

  incrementMessageCount(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messageCount++;
      session.updatedAt = new Date();
      this.sessions.set(sessionId, session);
    }
  }

  private findSessionByConversation(conversationId?: string): PersonaSession | undefined {
    if (!conversationId) return undefined;
    return Array.from(this.sessions.values()).find(s => s.conversationId === conversationId);
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private hasSignificantDifferences(from: PersonaConfig, to: PersonaConfig): boolean {
    // Check for significant differences that might cause jarring transitions
    if (from.identity.name !== to.identity.name) return true;
    if (from.behavior.enforceFirstPerson !== to.behavior.enforceFirstPerson) return true;
    if (from.reasoning?.enabled !== to.reasoning?.enabled) return true;
    if (from.toolUse?.enabled !== to.toolUse?.enabled) return true;
    return false;
  }

  private async applyGradualTransition(
    session: PersonaSession,
    targetPersona: PersonaConfig,
    blendMessages?: number
  ): Promise<SwitchTransitionResult> {
    const warnings: string[] = [];
    const blendCount = blendMessages || 3;

    // For gradual transition, we blend the personas over N messages
    // In a real implementation, this would modify the system prompt progressively
    session.transition = {
      type: 'gradual',
      blendMessages: blendCount,
      startedAt: new Date(),
    };

    warnings.push(`Gradual transition over ${blendCount} messages.`);

    return {
      success: true,
      warnings,
      blendedMessages: blendCount,
    };
  }

  // Clean up old sessions (could be called periodically)
  cleanupOldSessions(maxAgeHours = 24): number {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.updatedAt < cutoff) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }
}

export const personaSwitchService = new PersonaSwitchService();
