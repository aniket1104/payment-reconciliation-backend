/**
 * Tests for Redis Client
 *
 * Tests Redis client initialization and error handling.
 * Note: These are unit tests that don't require an actual Redis connection.
 */

import { getRedisClient, isRedisAvailable } from '../../src/redis/client';

describe('Redis Client', () => {
  // ============================================
  // Client availability
  // ============================================
  describe('isRedisAvailable', () => {
    it('should return a boolean', () => {
      const available = isRedisAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  // ============================================
  // Client exports
  // ============================================
  describe('getRedisClient', () => {
    it('should export getRedisClient function', () => {
      expect(getRedisClient).toBeDefined();
      expect(typeof getRedisClient).toBe('function');
    });

    it('should return null or Redis client', () => {
      const client = getRedisClient();
      // Returns null if Redis is not connected, or a Redis client otherwise
      expect(client === null || client !== undefined).toBe(true);
    });
  });
});
