/**
 * Batch Progress Module
 *
 * Provides Redis-backed progress tracking for reconciliation batches.
 *
 * DESIGN PRINCIPLES:
 * - PostgreSQL remains the SOURCE OF TRUTH
 * - Redis is a FAST MIRROR for UI progress reads
 * - Redis updates happen AFTER database updates
 * - Redis failures do not affect batch processing
 * - All reads fall back to database if Redis unavailable
 *
 * KEY FORMAT: batch:{batchId}:progress
 */

import { safeRedisOperation, safeRedisWrite } from './client';

// ============================================
// Configuration
// ============================================

/**
 * Cache key prefix for batch progress
 */
const CACHE_KEY_PREFIX = 'batch:';
const CACHE_KEY_SUFFIX = ':progress';

/**
 * Cache TTL in seconds (1 hour)
 * Batches should complete well within this time
 */
const CACHE_TTL_SECONDS = 60 * 60;

// ============================================
// Key Generation
// ============================================

/**
 * Generates the cache key for a batch
 */
function getCacheKey(batchId: string): string {
  return `${CACHE_KEY_PREFIX}${batchId}${CACHE_KEY_SUFFIX}`;
}

// ============================================
// Data Structure
// ============================================

/**
 * Batch progress data stored in Redis
 */
export interface BatchProgress {
  processedCount: number;
  autoMatchedCount: number;
  needsReviewCount: number;
  unmatchedCount: number;
  totalTransactions: number;
  status: string;
}

// ============================================
// Cache Operations
// ============================================

/**
 * Gets cached batch progress
 *
 * @param batchId - UUID of the batch
 * @returns Cached progress or null if not in cache
 */
export async function getCachedBatchProgress(batchId: string): Promise<BatchProgress | null> {
  const cacheKey = getCacheKey(batchId);

  return safeRedisOperation(
    async (client) => {
      const data = await client.hgetall(cacheKey);

      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      return {
        processedCount: parseInt(data.processedCount || '0', 10),
        autoMatchedCount: parseInt(data.autoMatchedCount || '0', 10),
        needsReviewCount: parseInt(data.needsReviewCount || '0', 10),
        unmatchedCount: parseInt(data.unmatchedCount || '0', 10),
        totalTransactions: parseInt(data.totalTransactions || '0', 10),
        status: data.status || 'unknown',
      };
    },
    null,
    `Batch progress GET (${batchId})`
  );
}

/**
 * Sets the full batch progress in cache
 *
 * @param batchId - UUID of the batch
 * @param progress - Progress data to cache
 */
export async function setCachedBatchProgress(
  batchId: string,
  progress: BatchProgress
): Promise<void> {
  const cacheKey = getCacheKey(batchId);

  await safeRedisWrite(async (client) => {
    const multi = client.multi();

    multi.hset(cacheKey, {
      processedCount: progress.processedCount.toString(),
      autoMatchedCount: progress.autoMatchedCount.toString(),
      needsReviewCount: progress.needsReviewCount.toString(),
      unmatchedCount: progress.unmatchedCount.toString(),
      totalTransactions: progress.totalTransactions.toString(),
      status: progress.status,
    });

    multi.expire(cacheKey, CACHE_TTL_SECONDS);

    await multi.exec();
  }, `Batch progress SET (${batchId})`);
}

/**
 * Initializes batch progress in cache
 *
 * Call this when starting batch processing
 */
export async function initBatchProgress(
  batchId: string,
  totalTransactions: number = 0
): Promise<void> {
  await setCachedBatchProgress(batchId, {
    processedCount: 0,
    autoMatchedCount: 0,
    needsReviewCount: 0,
    unmatchedCount: 0,
    totalTransactions,
    status: 'processing',
  });
}

/**
 * Increments batch counters atomically
 *
 * Uses Redis HINCRBY for atomic increments
 *
 * @param batchId - UUID of the batch
 * @param increments - Counter increments
 */
export async function incrementBatchProgress(
  batchId: string,
  increments: {
    processed?: number;
    autoMatched?: number;
    needsReview?: number;
    unmatched?: number;
  }
): Promise<void> {
  const cacheKey = getCacheKey(batchId);

  await safeRedisWrite(async (client) => {
    const multi = client.multi();

    if (increments.processed) {
      multi.hincrby(cacheKey, 'processedCount', increments.processed);
    }
    if (increments.autoMatched) {
      multi.hincrby(cacheKey, 'autoMatchedCount', increments.autoMatched);
    }
    if (increments.needsReview) {
      multi.hincrby(cacheKey, 'needsReviewCount', increments.needsReview);
    }
    if (increments.unmatched) {
      multi.hincrby(cacheKey, 'unmatchedCount', increments.unmatched);
    }

    // Refresh TTL on update
    multi.expire(cacheKey, CACHE_TTL_SECONDS);

    await multi.exec();
  }, `Batch progress INCREMENT (${batchId})`);
}

/**
 * Updates batch status in cache
 */
export async function updateBatchStatus(batchId: string, status: string): Promise<void> {
  const cacheKey = getCacheKey(batchId);

  await safeRedisWrite(async (client) => {
    await client.hset(cacheKey, 'status', status);
  }, `Batch status UPDATE (${batchId})`);
}

/**
 * Sets total transactions count in cache
 */
export async function setTotalTransactions(batchId: string, total: number): Promise<void> {
  const cacheKey = getCacheKey(batchId);

  await safeRedisWrite(async (client) => {
    await client.hset(cacheKey, 'totalTransactions', total.toString());
  }, `Batch total SET (${batchId})`);
}

/**
 * Marks batch as completed in cache
 */
export async function markBatchCompletedInCache(batchId: string): Promise<void> {
  await updateBatchStatus(batchId, 'completed');
}

/**
 * Marks batch as failed in cache
 */
export async function markBatchFailedInCache(batchId: string): Promise<void> {
  await updateBatchStatus(batchId, 'failed');
}

/**
 * Removes batch progress from cache
 *
 * Call this to clean up after batch is done
 */
export async function clearBatchProgress(batchId: string): Promise<void> {
  const cacheKey = getCacheKey(batchId);

  await safeRedisWrite(async (client) => {
    await client.del(cacheKey);
  }, `Batch progress CLEAR (${batchId})`);
}

export default {
  getCachedBatchProgress,
  setCachedBatchProgress,
  initBatchProgress,
  incrementBatchProgress,
  updateBatchStatus,
  setTotalTransactions,
  markBatchCompletedInCache,
  markBatchFailedInCache,
  clearBatchProgress,
};
