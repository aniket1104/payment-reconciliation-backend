/**
 * Tests for Pagination Service
 *
 * Tests cursor-based pagination implementation:
 * - Cursor encoding/decoding
 * - Limit validation
 * - WHERE clause building
 * - Result pagination
 */

import {
  encodeCursor,
  decodeCursor,
  validateLimit,
  buildCursorWhereClause,
  paginateResults,
  parsePaginationParams,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from '../../src/services/pagination.service';

describe('Pagination Service', () => {
  // ============================================
  // Constants verification
  // ============================================
  describe('constants', () => {
    it('should have DEFAULT_LIMIT = 50', () => {
      expect(DEFAULT_LIMIT).toBe(50);
    });

    it('should have MAX_LIMIT = 100', () => {
      expect(MAX_LIMIT).toBe(100);
    });
  });

  // ============================================
  // Cursor encoding/decoding
  // ============================================
  describe('encodeCursor', () => {
    it('should encode cursor from Date and id', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      const cursor = encodeCursor(date, id);

      expect(typeof cursor).toBe('string');
      expect(cursor.length).toBeGreaterThan(0);
    });

    it('should encode cursor from ISO string and id', () => {
      const dateStr = '2024-01-15T10:30:00.000Z';
      const id = '123e4567-e89b-12d3-a456-426614174000';

      const cursor = encodeCursor(dateStr, id);

      expect(typeof cursor).toBe('string');
    });

    it('should produce URL-safe base64', () => {
      const cursor = encodeCursor(new Date(), '123e4567-e89b-12d3-a456-426614174000');

      // Base64url should not contain +, /, or =
      expect(cursor).not.toMatch(/[+/=]/);
    });
  });

  describe('decodeCursor', () => {
    it('should decode a valid cursor', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      const cursor = encodeCursor(date, id);
      const decoded = decodeCursor(cursor);

      expect(decoded.createdAt).toBe(date.toISOString());
      expect(decoded.id).toBe(id);
    });

    it('should throw AppError for invalid cursor', () => {
      expect(() => decodeCursor('invalid-cursor')).toThrow('Invalid pagination cursor');
    });

    it('should throw for cursor with missing fields', () => {
      const invalidCursor = Buffer.from(JSON.stringify({ createdAt: '2024-01-15' })).toString(
        'base64url'
      );

      expect(() => decodeCursor(invalidCursor)).toThrow();
    });

    it('should throw for cursor with invalid date', () => {
      const invalidCursor = Buffer.from(
        JSON.stringify({
          createdAt: 'not-a-date',
          id: '123e4567-e89b-12d3-a456-426614174000',
        })
      ).toString('base64url');

      expect(() => decodeCursor(invalidCursor)).toThrow();
    });

    it('should throw for cursor with invalid UUID format', () => {
      const invalidCursor = Buffer.from(
        JSON.stringify({
          createdAt: '2024-01-15T10:30:00.000Z',
          id: 'not-a-uuid',
        })
      ).toString('base64url');

      expect(() => decodeCursor(invalidCursor)).toThrow();
    });
  });

  describe('cursor roundtrip', () => {
    it('should encode and decode correctly', () => {
      const originalDate = new Date('2024-06-15T14:30:00.000Z');
      const originalId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

      const cursor = encodeCursor(originalDate, originalId);
      const decoded = decodeCursor(cursor);

      expect(decoded.createdAt).toBe(originalDate.toISOString());
      expect(decoded.id).toBe(originalId);
    });
  });

  // ============================================
  // Limit validation
  // ============================================
  describe('validateLimit', () => {
    it('should return DEFAULT_LIMIT for undefined', () => {
      expect(validateLimit(undefined)).toBe(DEFAULT_LIMIT);
    });

    it('should return DEFAULT_LIMIT for empty string', () => {
      expect(validateLimit('')).toBe(DEFAULT_LIMIT);
    });

    it('should parse valid number string', () => {
      expect(validateLimit('50')).toBe(50);
    });

    it('should return DEFAULT_LIMIT for zero or negative', () => {
      // Invalid values return DEFAULT_LIMIT
      expect(validateLimit('0')).toBe(DEFAULT_LIMIT);
      expect(validateLimit('-10')).toBe(DEFAULT_LIMIT);
    });

    it('should enforce MAX_LIMIT', () => {
      expect(validateLimit('200')).toBe(MAX_LIMIT);
      expect(validateLimit('999')).toBe(MAX_LIMIT);
    });

    it('should return DEFAULT_LIMIT for non-numeric string', () => {
      expect(validateLimit('abc')).toBe(DEFAULT_LIMIT);
    });
  });

  // ============================================
  // WHERE clause building
  // ============================================
  describe('buildCursorWhereClause', () => {
    it('should return undefined for no cursor', () => {
      expect(buildCursorWhereClause(undefined)).toBeUndefined();
    });

    it('should build compound cursor condition', () => {
      const cursor = {
        createdAt: '2024-01-15T10:30:00.000Z',
        id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const where = buildCursorWhereClause(cursor);

      expect(where).toBeDefined();
      expect(where).toHaveProperty('OR');
    });

    it('should create correct OR conditions for DESC ordering', () => {
      const cursor = {
        createdAt: '2024-01-15T10:30:00.000Z',
        id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const where = buildCursorWhereClause(cursor) as {
        OR: Array<{ createdAt?: { lt: Date }; AND?: Array<object> }>;
      };

      expect(where.OR).toHaveLength(2);
      // First condition: createdAt < cursor
      expect(where.OR[0]).toHaveProperty('createdAt');
      // Second condition: createdAt = cursor AND id < cursor.id
      expect(where.OR[1]).toHaveProperty('AND');
    });
  });

  // ============================================
  // Result pagination
  // ============================================
  describe('paginateResults', () => {
    const createRecord = (id: string, minutesAgo: number) => ({
      id,
      createdAt: new Date(Date.now() - minutesAgo * 60 * 1000),
      name: `Record ${id}`,
    });

    it('should return all records when less than limit', () => {
      const records = [createRecord('1', 10), createRecord('2', 20)];

      const result = paginateResults(records, 10);

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });

    it('should trim records and set hasMore when more than limit', () => {
      const records = [
        createRecord('1', 10),
        createRecord('2', 20),
        createRecord('3', 30), // Extra record
      ];

      const result = paginateResults(records, 2);

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();
    });

    it('should generate nextCursor from last record', () => {
      // Create records with valid UUIDs
      const createRecordWithUUID = (id: string, minutesAgo: number) => ({
        id,
        createdAt: new Date(Date.now() - minutesAgo * 60 * 1000),
        name: `Record ${id}`,
      });

      const records = [
        createRecordWithUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 10),
        createRecordWithUUID('b2c3d4e5-f6a7-8901-bcde-f12345678901', 20),
        createRecordWithUUID('c3d4e5f6-a7b8-9012-cdef-123456789012', 30),
      ];

      const result = paginateResults(records, 2);

      // Verify cursor is generated
      expect(result.nextCursor).toBeDefined();

      // Decode the cursor and verify it's from the last returned record
      const decoded = decodeCursor(result.nextCursor!);
      expect(decoded.id).toBe('b2c3d4e5-f6a7-8901-bcde-f12345678901'); // Last record in trimmed results
    });

    it('should handle exactly limit records', () => {
      const records = [createRecord('1', 10), createRecord('2', 20)];

      const result = paginateResults(records, 2);

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('should handle empty records', () => {
      const result = paginateResults([], 10);

      expect(result.data).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });
  });

  // ============================================
  // Parameter parsing
  // ============================================
  describe('parsePaginationParams', () => {
    it('should parse limit from query', () => {
      const params = parsePaginationParams({ limit: '50' });

      expect(params.limit).toBe(50);
      expect(params.cursor).toBeUndefined();
    });

    it('should parse cursor from query', () => {
      const cursor = encodeCursor(new Date(), '123e4567-e89b-12d3-a456-426614174000');
      const params = parsePaginationParams({ cursor });

      expect(params.cursor).toBeDefined();
      expect(params.cursor?.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should use defaults when no params', () => {
      const params = parsePaginationParams({});

      expect(params.limit).toBe(DEFAULT_LIMIT);
      expect(params.cursor).toBeUndefined();
    });

    it('should throw for invalid cursor', () => {
      expect(() => parsePaginationParams({ cursor: 'invalid' })).toThrow();
    });
  });
});
