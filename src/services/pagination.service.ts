/**
 * Pagination Service for Payment Reconciliation Engine
 *
 * Implements CURSOR-BASED pagination for efficient querying of large datasets.
 *
 * CRITICAL DESIGN RULES:
 * - NEVER use OFFSET pagination (O(n) complexity, skips rows)
 * - Use cursor-based pagination (O(1) seek, stable results)
 * - Cursor is based on (created_at, id) for deterministic ordering
 * - Cursors are Base64-encoded JSON for URL safety
 *
 * WHY CURSOR-BASED:
 * - Scales to millions of records without performance degradation
 * - Stable pagination even when new records are inserted
 * - Efficient use of database indexes
 */

import { AppError } from '../utils';

// ============================================
// Types
// ============================================

/**
 * Decoded cursor containing pagination position
 */
export interface DecodedCursor {
  createdAt: string; // ISO date string
  id: string; // UUID for tie-breaking
}

/**
 * Pagination parameters for queries
 */
export interface PaginationParams {
  limit: number;
  cursor?: DecodedCursor;
}

/**
 * Generic paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
}

// ============================================
// Configuration
// ============================================

/**
 * Default pagination limit
 */
export const DEFAULT_LIMIT = 50;

/**
 * Maximum allowed pagination limit
 */
export const MAX_LIMIT = 100;

// ============================================
// Cursor Encoding/Decoding
// ============================================

/**
 * Encodes a cursor from createdAt and id
 *
 * @param createdAt - Date or ISO string of the record
 * @param id - UUID of the record
 * @returns Base64-encoded cursor string
 */
export function encodeCursor(createdAt: Date | string, id: string): string {
  const cursorData: DecodedCursor = {
    createdAt: typeof createdAt === 'string' ? createdAt : createdAt.toISOString(),
    id,
  };

  const json = JSON.stringify(cursorData);
  return Buffer.from(json, 'utf-8').toString('base64url');
}

/**
 * Decodes a cursor string into its components
 *
 * @param cursor - Base64-encoded cursor string
 * @returns Decoded cursor object
 * @throws AppError if cursor is invalid
 */
export function decodeCursor(cursor: string): DecodedCursor {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json);

    // Validate required fields
    if (!parsed.createdAt || !parsed.id) {
      throw new Error('Missing cursor fields');
    }

    // Validate date format
    const date = new Date(parsed.createdAt);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date in cursor');
    }

    // Validate UUID format (basic check)
    if (!/^[0-9a-f-]{36}$/i.test(parsed.id)) {
      throw new Error('Invalid ID in cursor');
    }

    return {
      createdAt: parsed.createdAt,
      id: parsed.id,
    };
  } catch (error) {
    throw AppError.badRequest('Invalid pagination cursor');
  }
}

// ============================================
// Limit Validation
// ============================================

/**
 * Validates and clamps the limit parameter
 *
 * @param limit - Requested limit
 * @param max - Maximum allowed limit (default: MAX_LIMIT)
 * @returns Validated limit clamped to allowed range
 */
export function validateLimit(limit: number | string | undefined, max: number = MAX_LIMIT): number {
  if (limit === undefined || limit === null || limit === '') {
    return DEFAULT_LIMIT;
  }

  const parsed = typeof limit === 'string' ? parseInt(limit, 10) : limit;

  if (isNaN(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  // Clamp to maximum
  return Math.min(parsed, max);
}

// ============================================
// Prisma Query Helpers
// ============================================

/**
 * Builds Prisma WHERE clause for cursor-based pagination
 *
 * Uses compound cursor (createdAt, id) for deterministic ordering.
 * Records are ordered by createdAt DESC, id DESC.
 *
 * The cursor condition is:
 * WHERE (created_at < cursor.createdAt)
 *    OR (created_at = cursor.createdAt AND id < cursor.id)
 *
 * @param cursor - Decoded cursor (optional)
 * @returns Prisma WHERE clause fragment
 */
export function buildCursorWhereClause(cursor?: DecodedCursor): object | undefined {
  if (!cursor) {
    return undefined;
  }

  const cursorDate = new Date(cursor.createdAt);

  // Compound cursor condition for DESC ordering
  return {
    OR: [
      // Records with earlier createdAt
      { createdAt: { lt: cursorDate } },
      // Records with same createdAt but earlier id (for tie-breaking)
      {
        AND: [{ createdAt: cursorDate }, { id: { lt: cursor.id } }],
      },
    ],
  };
}

/**
 * Determines if there are more records after the current page
 *
 * Strategy: Fetch limit + 1 records, check if we got more than limit
 *
 * @param fetchedCount - Number of records fetched
 * @param limit - Requested limit
 * @returns True if more records exist
 */
export function hasMoreRecords(fetchedCount: number, limit: number): boolean {
  return fetchedCount > limit;
}

/**
 * Trims results to the requested limit and generates next cursor
 *
 * @param records - Array of records (may have one extra)
 * @param limit - Requested limit
 * @returns Object with trimmed data and nextCursor
 */
export function paginateResults<T extends { createdAt: Date; id: string }>(
  records: T[],
  limit: number
): PaginatedResponse<T> {
  const hasMore = hasMoreRecords(records.length, limit);

  // Trim to requested limit
  const data = hasMore ? records.slice(0, limit) : records;

  // Generate next cursor from last record
  let nextCursor: string | undefined;
  if (hasMore && data.length > 0) {
    const lastRecord = data[data.length - 1];
    nextCursor = encodeCursor(lastRecord.createdAt, lastRecord.id);
  }

  return {
    data,
    nextCursor,
    hasMore,
  };
}

// ============================================
// Request Parsing Helpers
// ============================================

/**
 * Parses pagination parameters from request query
 *
 * @param query - Express request query object
 * @returns Validated pagination parameters
 */
export function parsePaginationParams(query: {
  limit?: string;
  cursor?: string;
}): PaginationParams {
  const limit = validateLimit(query.limit);

  let cursor: DecodedCursor | undefined;
  if (query.cursor) {
    cursor = decodeCursor(query.cursor);
  }

  return { limit, cursor };
}

// ============================================
// Exports
// ============================================

export const paginationService = {
  encodeCursor,
  decodeCursor,
  validateLimit,
  buildCursorWhereClause,
  hasMoreRecords,
  paginateResults,
  parsePaginationParams,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};

export default paginationService;
