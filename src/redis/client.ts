/**
 * Redis Client Module
 *
 * Provides a singleton Redis client with GRACEFUL DEGRADATION.
 *
 * IMPORTANT DESIGN PRINCIPLES:
 * - Redis is an OPTIONAL performance optimization
 * - The application MUST function correctly without Redis
 * - Redis failures must NEVER break the application
 * - All Redis errors are caught and logged, not thrown
 *
 * PostgreSQL (via Prisma) remains the SOURCE OF TRUTH.
 */

import Redis from 'ioredis';
import { logger } from '../utils';

// ============================================
// Configuration
// ============================================

interface RedisConfig {
  host: string;
  port: number;
  maxRetriesPerRequest: number;
  retryStrategy: (times: number) => number | null;
  lazyConnect: boolean;
}

/**
 * Get Redis configuration from environment variables
 */
function getRedisConfig(): RedisConfig {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    // Limit retries to avoid blocking
    maxRetriesPerRequest: 1,
    // Retry strategy: exponential backoff with max 3 retries
    retryStrategy: (times: number) => {
      if (times > 3) {
        // Stop retrying after 3 attempts
        return null;
      }
      // Exponential backoff: 100ms, 200ms, 400ms
      return Math.min(times * 100, 400);
    },
    // Don't connect immediately - connect on first use
    lazyConnect: true,
  };
}

// ============================================
// Client State
// ============================================

let redisClient: Redis | null = null;
let isConnected = false;
let connectionAttempted = false;

// ============================================
// Client Initialization
// ============================================

/**
 * Creates and initializes the Redis client
 *
 * This function:
 * - Creates a new Redis client with configuration
 * - Sets up event handlers for connection status
 * - Returns null if connection fails (graceful degradation)
 */
function createRedisClient(): Redis | null {
  try {
    const config = getRedisConfig();
    const client = new Redis(config);

    // Handle connection events
    client.on('connect', () => {
      isConnected = true;
      logger.info('📦 Redis connected successfully');
      console.log('📦 Redis connected successfully');
    });

    client.on('ready', () => {
      isConnected = true;
      logger.debug('Redis client ready');
    });

    client.on('error', (error: Error) => {
      // Log but don't throw - Redis is optional
      logger.warn(`Redis error (non-fatal): ${error.message}`);
      isConnected = false;
    });

    client.on('close', () => {
      isConnected = false;
      logger.debug('Redis connection closed');
    });

    client.on('reconnecting', () => {
      logger.debug('Redis reconnecting...');
    });

    client.on('end', () => {
      isConnected = false;
      logger.debug('Redis connection ended');
    });

    return client;
  } catch (error) {
    logger.warn(
      `Failed to create Redis client (non-fatal): ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return null;
  }
}

/**
 * Gets the Redis client, creating it if necessary
 *
 * @returns Redis client or null if unavailable
 */
export function getRedisClient(): Redis | null {
  if (!connectionAttempted) {
    connectionAttempted = true;
    redisClient = createRedisClient();

    // Attempt initial connection
    if (redisClient) {
      redisClient.connect().catch((error) => {
        logger.warn(`Redis initial connection failed (non-fatal): ${error.message}`);
        isConnected = false;
      });
    }
  }

  return redisClient;
}

/**
 * Checks if Redis is currently connected and available
 */
export function isRedisAvailable(): boolean {
  return isConnected && redisClient !== null;
}

/**
 * Safely disconnects from Redis
 *
 * Call this during application shutdown
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis disconnected');
    } catch (error) {
      logger.warn(
        `Redis disconnect error (non-fatal): ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      redisClient = null;
      isConnected = false;
      connectionAttempted = false;
    }
  }
}

// ============================================
// Safe Redis Operations
// ============================================

/**
 * Safely executes a Redis operation with fallback
 *
 * This wrapper:
 * - Catches all Redis errors
 * - Returns fallback value on failure
 * - Logs errors without throwing
 *
 * @param operation - Async function that uses Redis
 * @param fallback - Value to return if Redis fails
 * @param operationName - Name for logging purposes
 */
export async function safeRedisOperation<T>(
  operation: (client: Redis) => Promise<T>,
  fallback: T,
  operationName: string = 'Redis operation'
): Promise<T> {
  const client = getRedisClient();

  if (!client || !isConnected) {
    logger.debug(`${operationName}: Redis unavailable, using fallback`);
    return fallback;
  }

  try {
    return await operation(client);
  } catch (error) {
    logger.warn(
      `${operationName} failed (non-fatal): ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return fallback;
  }
}

/**
 * Safely executes a Redis operation that doesn't need a return value
 *
 * Used for fire-and-forget operations like cache updates
 */
export async function safeRedisWrite(
  operation: (client: Redis) => Promise<unknown>,
  operationName: string = 'Redis write'
): Promise<void> {
  const client = getRedisClient();

  if (!client || !isConnected) {
    logger.debug(`${operationName}: Redis unavailable, skipping`);
    return;
  }

  try {
    await operation(client);
  } catch (error) {
    logger.warn(
      `${operationName} failed (non-fatal): ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export default {
  getRedisClient,
  isRedisAvailable,
  disconnectRedis,
  safeRedisOperation,
  safeRedisWrite,
};
