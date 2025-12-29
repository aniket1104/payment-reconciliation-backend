/**
 * Redis Module
 *
 * Exports Redis client and cache helpers for the Payment Reconciliation Engine.
 *
 * IMPORTANT: Redis is an OPTIONAL performance optimization.
 * The application works correctly without Redis.
 * PostgreSQL remains the source of truth.
 */

// Client exports
export {
  getRedisClient,
  isRedisAvailable,
  disconnectRedis,
  safeRedisOperation,
  safeRedisWrite,
} from './client';

// Invoice cache exports
export {
  getCachedInvoices,
  setCachedInvoices,
  invalidateCachedInvoices,
  clearInvoiceCache,
  getInvoicesWithCache,
} from './invoiceCache';

// Batch progress exports
export {
  getCachedBatchProgress,
  setCachedBatchProgress,
  initBatchProgress,
  incrementBatchProgress,
  updateBatchStatus,
  updateBatchProgress,
  markBatchCompletedInCache,
  markBatchFailedInCache,
  clearBatchProgress,
  type BatchProgress,
} from './batchProgress';
