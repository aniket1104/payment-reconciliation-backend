/**
 * Invoice Cache Module
 *
 * Provides READ-THROUGH caching for invoice lookups by amount.
 *
 * DESIGN PRINCIPLES:
 * - Cache reduces repeated database queries during CSV processing
 * - PostgreSQL remains the SOURCE OF TRUTH
 * - Cache misses transparently fall back to database
 * - Redis failures fall back to database seamlessly
 * - Cached invoices NEVER include paid invoices
 *
 * KEY FORMAT: invoices:amount:{amount}
 * TTL: 15 minutes (valid during a reconciliation run)
 */

import { safeRedisOperation, safeRedisWrite } from './client';
import type { InvoiceInput } from '../matching/types';

// ============================================
// Configuration
// ============================================

/**
 * Cache key prefix for invoice lookups
 */
const CACHE_KEY_PREFIX = 'invoices:amount:';

/**
 * Cache TTL in seconds (15 minutes)
 * This is long enough for a reconciliation batch to complete
 */
const CACHE_TTL_SECONDS = 15 * 60;

// ============================================
// Key Generation
// ============================================

/**
 * Generates the cache key for an amount
 *
 * Amount is rounded to 2 decimal places to ensure consistency
 *
 * @param amount - Transaction amount to lookup
 * @returns Cache key string
 */
function getCacheKey(amount: number): string {
  // Round to 2 decimal places and format consistently
  const normalizedAmount = amount.toFixed(2);
  return `${CACHE_KEY_PREFIX}${normalizedAmount}`;
}

// ============================================
// Cache Data Structure
// ============================================

/**
 * Cached invoice data (minimal fields for matching)
 */
interface CachedInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  dueDate: string; // ISO string for JSON serialization
}

/**
 * Converts InvoiceInput to cacheable format
 */
function toCachedFormat(invoice: InvoiceInput): CachedInvoice {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    dueDate: invoice.dueDate.toISOString(),
  };
}

/**
 * Converts cached format back to InvoiceInput
 */
function fromCachedFormat(cached: CachedInvoice): InvoiceInput {
  return {
    id: cached.id,
    invoiceNumber: cached.invoiceNumber,
    customerName: cached.customerName,
    dueDate: new Date(cached.dueDate),
  };
}

// ============================================
// Cache Operations
// ============================================

/**
 * Gets cached invoices for a given amount
 *
 * @param amount - Transaction amount to lookup
 * @returns Cached invoices or null if not in cache
 */
export async function getCachedInvoices(amount: number): Promise<InvoiceInput[] | null> {
  const cacheKey = getCacheKey(amount);

  const result = await safeRedisOperation(
    async (client) => {
      const cached = await client.get(cacheKey);

      if (!cached) {
        return null;
      }

      try {
        const parsed: CachedInvoice[] = JSON.parse(cached);
        return parsed.map(fromCachedFormat);
      } catch {
        // Invalid JSON - treat as cache miss
        return null;
      }
    },
    null,
    `Invoice cache GET (amount: ${amount})`
  );

  return result;
}

/**
 * Stores invoices in cache for a given amount
 *
 * @param amount - Transaction amount
 * @param invoices - Invoices to cache
 */
export async function setCachedInvoices(amount: number, invoices: InvoiceInput[]): Promise<void> {
  const cacheKey = getCacheKey(amount);
  const cachedData: CachedInvoice[] = invoices.map(toCachedFormat);

  await safeRedisWrite(async (client) => {
    await client.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(cachedData));
  }, `Invoice cache SET (amount: ${amount})`);
}

/**
 * Invalidates cached invoices for a given amount
 *
 * Call this when an invoice is paid or status changes
 *
 * @param amount - Amount to invalidate
 */
export async function invalidateCachedInvoices(amount: number): Promise<void> {
  const cacheKey = getCacheKey(amount);

  await safeRedisWrite(async (client) => {
    await client.del(cacheKey);
  }, `Invoice cache INVALIDATE (amount: ${amount})`);
}

/**
 * Clears all invoice cache entries
 *
 * Use sparingly - for testing or cache reset
 */
export async function clearInvoiceCache(): Promise<void> {
  await safeRedisWrite(async (client) => {
    // Find and delete all invoice cache keys
    const keys = await client.keys(`${CACHE_KEY_PREFIX}*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }, 'Invoice cache CLEAR ALL');
}

// ============================================
// Read-Through Cache Helper
// ============================================

/**
 * Gets invoices by amount with read-through caching
 *
 * This is the main function to use. It:
 * 1. Checks Redis cache first
 * 2. On cache hit: returns cached data
 * 3. On cache miss: calls the database fetch function
 * 4. Stores result in cache for future lookups
 * 5. On Redis failure: falls back to database seamlessly
 *
 * @param amount - Transaction amount to lookup
 * @param fetchFromDb - Function to fetch invoices from database
 * @returns Array of matching invoices
 *
 * @example
 * const invoices = await getInvoicesWithCache(
 *   1500.00,
 *   () => getCandidateInvoices(1500.00)
 * );
 */
export async function getInvoicesWithCache(
  amount: number,
  fetchFromDb: () => Promise<InvoiceInput[]>
): Promise<InvoiceInput[]> {
  // Step 1: Try cache first
  const cached = await getCachedInvoices(amount);

  if (cached !== null) {
    // Cache hit - return cached data
    return cached;
  }

  // Step 2: Cache miss - fetch from database
  const invoices = await fetchFromDb();

  // Step 3: Store in cache for future lookups (fire and forget)
  // Don't await - caching shouldn't slow down the response
  void setCachedInvoices(amount, invoices);

  return invoices;
}

export default {
  getCachedInvoices,
  setCachedInvoices,
  invalidateCachedInvoices,
  clearInvoiceCache,
  getInvoicesWithCache,
};
