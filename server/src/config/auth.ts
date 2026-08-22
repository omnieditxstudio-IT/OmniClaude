import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { Google, GitHub } from 'arctic';
import { getConnection } from '../config/database';
import env from '../config';
import { User, ApiKey, Endpoint, ModelMapping, RequestLog } from './models';

// Better-Auth configuration
export const auth = betterAuth({
  database: mongodbAdapter(getConnection().db),
  emailAndPassword: {
    enabled: false, // We only use OAuth
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      redirectURI: `${env.OAUTH_REDIRECT_URI}/google`,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID!,
      clientSecret: env.GITHUB_CLIENT_SECRET!,
      redirectURI: `${env.OAUTH_REDIRECT_URI}/github`,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  user: {
    additionalFields: {
      provider: { type: 'string', required: true },
      providerId: { type: 'string', required: true },
      avatar: { type: 'string', required: false },
      settings: { type: 'object', required: false },
    },
  },
  advanced: {
    generateId: () => crypto.randomUUID(),
  },
  hooks: {
    after: [
      {
        matcher: (ctx) => ctx.path === '/sign-in/social',
        handler: async (ctx) => {
          // Auto-create default settings for new users
          if (ctx.context.newUser) {
            await User.findByIdAndUpdate(ctx.context.session.userId, {
              $set: {
                settings: {
                  theme: 'system',
                  requestTimeout: 60000,
                },
              },
            });
          }
        },
      },
    ],
  },
});

// Type-safe auth helpers
export type Session = typeof auth.$Infer.Session;
export type UserType = typeof auth.$Infer.User;

// Fastify plugin for Better-Auth
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    auth: {
      user: UserType | null;
      session: Session | null;
    };
  }
}

export async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('auth', { user: null, session: null });

  fastify.addHook('preHandler', async (request, reply) => {
    const session = await auth.api.getSession({
      headers: request.headers as Record<string, string>,
    });
    
    if (session) {
      request.auth = {
        user: session.user,
        session: session.session,
      };
    }
  });
}

// Middleware to require authentication
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth.user) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}

// Middleware to require ownership of resource
export function requireOwnership(resourceUserIdField: string = 'userId') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;
    
    const resourceUserId = (request.params as Record<string, string>)[resourceUserIdField] 
      || (request.body as Record<string, string>)[resourceUserIdField];
    
    if (resourceUserId && resourceUserId !== request.auth.user!.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  };
}

// Get current user from request
export function getCurrentUser(request: FastifyRequest): UserType | null {
  return request.auth.user;
}

// Get current session from request
export function getCurrentSession(request: FastifyRequest): Session | null {
  return request.auth.session;
}