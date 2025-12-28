/**
 * CSV Utilities for Payment Reconciliation Engine
 *
 * Provides streaming CSV parsing to handle large files (1,000-10,000 rows)
 * without loading the entire file into memory.
 *
 * Key features:
 * - Stream-based parsing using csv-parser
 * - Row validation with clear error messages
 * - Type-safe row parsing
 */

import { createReadStream } from 'fs';
import csvParser from 'csv-parser';
import { EventEmitter } from 'events';

// ============================================
// Types
// ============================================

/**
 * Raw CSV row from bank transactions file
 */
export interface BankTransactionCsvRow {
  transaction_date: string;
  description: string;
  amount: string;
  reference_number?: string;
}

/**
 * Parsed and validated bank transaction
 */
export interface ParsedBankTransaction {
  transactionDate: Date;
  description: string;
  amount: number;
  referenceNumber: string | null;
}

/**
 * Result of parsing a single row
 */
export interface RowParseResult {
  success: boolean;
  data?: ParsedBankTransaction;
  error?: string;
  rowNumber: number;
}

/**
 * Required columns in the CSV file
 */
const REQUIRED_COLUMNS = ['transaction_date', 'description', 'amount'] as const;

// ============================================
// Validation Functions
// ============================================

/**
 * Validates that all required columns are present in the CSV headers
 */
export function validateCsvHeaders(headers: string[]): { valid: boolean; missing: string[] } {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
  const missing = REQUIRED_COLUMNS.filter((col) => !normalizedHeaders.includes(col));

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Parses a date string from CSV
 * Supports formats: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
 */
export function parseTransactionDate(value: string): Date | null {
  if (!value || value.trim() === '') {
    return null;
  }

  const trimmed = value.trim();

  // Try ISO format first (YYYY-MM-DD)
  const isoDate = new Date(trimmed);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try MM/DD/YYYY format
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

/**
 * Parses an amount string from CSV
 * Handles: "1234.56", "$1,234.56", "-500.00"
 */
export function parseAmount(value: string): number | null {
  if (!value || value.trim() === '') {
    return null;
  }

  // Remove currency symbols, commas, and whitespace
  const cleaned = value.replace(/[$,\s]/g, '').trim();
  const num = parseFloat(cleaned);

  if (isNaN(num)) {
    return null;
  }

  // Round to 2 decimal places to avoid floating point issues
  return Math.round(num * 100) / 100;
}

/**
 * Parses and validates a single CSV row
 */
export function parseRow(row: BankTransactionCsvRow, rowNumber: number): RowParseResult {
  // Validate transaction_date
  const transactionDate = parseTransactionDate(row.transaction_date);
  if (!transactionDate) {
    return {
      success: false,
      error: `Invalid transaction_date: "${row.transaction_date}"`,
      rowNumber,
    };
  }

  // Validate description
  const description = row.description?.trim();
  if (!description) {
    return {
      success: false,
      error: 'Missing or empty description',
      rowNumber,
    };
  }

  // Validate amount
  const amount = parseAmount(row.amount);
  if (amount === null) {
    return {
      success: false,
      error: `Invalid amount: "${row.amount}"`,
      rowNumber,
    };
  }

  // Parse optional reference_number
  const referenceNumber = row.reference_number?.trim() || null;

  return {
    success: true,
    data: {
      transactionDate,
      description,
      amount,
      referenceNumber,
    },
    rowNumber,
  };
}

// ============================================
// Streaming CSV Parser
// ============================================

/**
 * Events emitted by the CSV stream processor
 */
export interface CsvStreamEvents {
  row: (result: RowParseResult) => void;
  error: (error: Error) => void;
  end: (stats: { total: number; valid: number; invalid: number }) => void;
  headerError: (missing: string[]) => void;
}

/**
 * Creates a streaming CSV processor that emits events for each row
 *
 * @param filePath - Path to the CSV file
 * @returns EventEmitter that emits 'row', 'error', 'end', 'headerError' events
 *
 * @example
 * const processor = createCsvStreamProcessor('/path/to/file.csv');
 *
 * processor.on('row', (result) => {
 *   if (result.success) {
 *     console.log('Valid row:', result.data);
 *   } else {
 *     console.log('Invalid row:', result.error);
 *   }
 * });
 *
 * processor.on('end', (stats) => {
 *   console.log(`Processed ${stats.total} rows`);
 * });
 */
export function createCsvStreamProcessor(filePath: string): EventEmitter {
  const emitter = new EventEmitter();

  let rowNumber = 0;
  let validCount = 0;
  let invalidCount = 0;
  let headersValidated = false;

  const stream = createReadStream(filePath).pipe(
    csvParser({
      mapHeaders: ({ header }) => header.toLowerCase().trim(),
      skipLines: 0,
    })
  );

  stream.on('headers', (headers: string[]) => {
    const validation = validateCsvHeaders(headers);
    if (!validation.valid) {
      emitter.emit('headerError', validation.missing);
      stream.destroy();
      return;
    }
    headersValidated = true;
  });

  stream.on('data', (row: BankTransactionCsvRow) => {
    if (!headersValidated) return;

    rowNumber++;
    const result = parseRow(row, rowNumber);

    if (result.success) {
      validCount++;
    } else {
      invalidCount++;
    }

    emitter.emit('row', result);
  });

  stream.on('error', (error: Error) => {
    emitter.emit('error', error);
  });

  stream.on('end', () => {
    emitter.emit('end', {
      total: rowNumber,
      valid: validCount,
      invalid: invalidCount,
    });
  });

  return emitter;
}

/**
 * Processes a CSV file and returns all parsed rows
 * WARNING: Only use for small files. For large files, use createCsvStreamProcessor
 */
export async function parseCsvFile(filePath: string): Promise<{
  rows: ParsedBankTransaction[];
  errors: Array<{ rowNumber: number; error: string }>;
  stats: { total: number; valid: number; invalid: number };
}> {
  return new Promise((resolve, reject) => {
    const rows: ParsedBankTransaction[] = [];
    const errors: Array<{ rowNumber: number; error: string }> = [];

    const processor = createCsvStreamProcessor(filePath);

    processor.on('row', (result: RowParseResult) => {
      if (result.success && result.data) {
        rows.push(result.data);
      } else if (result.error) {
        errors.push({ rowNumber: result.rowNumber, error: result.error });
      }
    });

    processor.on('headerError', (missing: string[]) => {
      reject(new Error(`Missing required columns: ${missing.join(', ')}`));
    });

    processor.on('error', (error: Error) => {
      reject(error);
    });

    processor.on('end', (stats) => {
      resolve({ rows, errors, stats });
    });
  });
}

export default {
  createCsvStreamProcessor,
  parseCsvFile,
  parseRow,
  parseAmount,
  parseTransactionDate,
  validateCsvHeaders,
};
