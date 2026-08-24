import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';

export interface PersonaSwitchEvent {
  type: 'switch' | 'transition_start' | 'transition_complete' | 'error';
  conversationId: string;
  userId: string;
  fromPersonaId?: string;
  toPersonaId?: string;
  transitionType?: string;
  data?: Record<string, any>;
  timestamp: Date;
}

export class PersonaWebSocketService {
  private fastify: FastifyInstance | null = null;
  private connections: Map<string, WebSocket[]> = new Map();

  initialize(fastify: FastifyInstance) {
    this.fastify = fastify;

    // Register WebSocket route for persona events
    fastify.register(async (instance) => {
      instance.get('/ws/persona', { websocket: true }, (connection: any, request: any) => {
        const userId = request.user?.id || 'anonymous';
        const conversationId = request.query.conversationId || 'global';

        this.addConnection(conversationId, connection.socket);

        connection.socket.on('message', (data: any) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(conversationId, userId, message, connection.socket);
          } catch {
            // Ignore invalid messages
          }
        });

        connection.socket.on('close', () => {
          this.removeConnection(conversationId, connection.socket);
        });

        // Send welcome message
        this.sendToConnection(connection.socket, {
          type: 'connected',
          conversationId,
          userId,
          timestamp: new Date(),
        });
      });
    });
  }

  broadcastSwitch(conversationId: string, event: Omit<PersonaSwitchEvent, 'conversationId' | 'timestamp'>) {
    const fullEvent: PersonaSwitchEvent = {
      ...event,
      conversationId,
      timestamp: new Date(),
    };

    this.broadcast(conversationId, fullEvent);
  }

  private handleMessage(conversationId: string, userId: string, message: any, socket: WebSocket) {
    switch (message.type) {
      case 'subscribe':
        // Client wants to subscribe to persona switch events for this conversation
        this.sendToConnection(socket, {
          type: 'subscribed',
          conversationId,
          timestamp: new Date(),
        });
        break;

      case 'ping':
        this.sendToConnection(socket, {
          type: 'pong',
          timestamp: new Date(),
        });
        break;

      default:
        this.sendToConnection(socket, {
          type: 'error',
          data: { message: `Unknown message type: ${message.type}` },
          timestamp: new Date(),
        });
    }
  }

  private addConnection(conversationId: string, socket: WebSocket) {
    const existing = this.connections.get(conversationId) || [];
    existing.push(socket);
    this.connections.set(conversationId, existing);
  }

  private removeConnection(conversationId: string, socket: WebSocket) {
    const existing = this.connections.get(conversationId) || [];
    const filtered = existing.filter(s => s !== socket && s.readyState === WebSocket.OPEN);
    if (filtered.length > 0) {
      this.connections.set(conversationId, filtered);
    } else {
      this.connections.delete(conversationId);
    }
  }

  private broadcast(conversationId: string, event: PersonaSwitchEvent) {
    const connections = this.connections.get(conversationId) || [];
    const message = JSON.stringify(event);

    for (const socket of connections) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    }
  }

  private sendToConnection(socket: WebSocket, event: any) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }

  getConnectionCount(): number {
    let total = 0;
    for (const connections of this.connections.values()) {
      total += connections.length;
    }
    return total;
  }
}

export const personaWebSocketService = new PersonaWebSocketService();
