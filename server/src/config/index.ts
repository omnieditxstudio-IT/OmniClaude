import dotenv from 'dotenv';
dotenv.config();

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  MONGODB_URI: z.string().min(1),
  MONGODB_URI_TEST: z.string().optional(),

  ENCRYPTION_KEY: z.string().length(44), // base64 encoded 32 bytes
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  OAUTH_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/auth/callback'),

  DASHBOARD_URL: z.string().url().default('http://localhost:5173'),
  PYTHON_ROUTER_URL: z.string().url().optional(),
  PYTHON_ROUTER_ENABLED: z.coerce.boolean().default(false),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('debug'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('pretty'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment variables:');
    error.errors.forEach(e => {
      console.error(`  ${e.path.join('.')}: ${e.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export default env;