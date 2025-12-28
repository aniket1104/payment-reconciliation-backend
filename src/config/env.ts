import dotenv from 'dotenv';
import { z } from 'zod';
import { EnvConfig } from '../types';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('8080'),
  HOST: z.string().default('localhost'),
  API_PREFIX: z.string().default('/api/v1'),
  CORS_ORIGIN: z.string().default('*').transform(s => s.split(',').map(o => o.trim())),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  LOG_LEVEL: z.string().default('debug'),
  DATABASE_URL: z.string().url('Invalid DATABASE_URL'),
  // Redis configuration (OPTIONAL - app works without Redis)
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
});

// Validate and parse environment variables
const parseEnv = (): EnvConfig => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data as unknown as EnvConfig;
};

export const env = parseEnv();

export default env;
