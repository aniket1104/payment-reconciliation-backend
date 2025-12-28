/**
 * Tests for CSV Parsing Utilities
 *
 * Tests streaming CSV parsing for bank transactions:
 * - Header validation
 * - Date parsing (multiple formats)
 * - Amount parsing (currency symbols, commas)
 * - Row validation
 */

import {
  validateCsvHeaders,
  parseTransactionDate,
  parseAmount,
  parseRow,
  type BankTransactionCsvRow,
} from '../../src/utils/csv';

describe('CSV Utilities', () => {
  // ============================================
  // Header validation
  // ============================================
  describe('validateCsvHeaders', () => {
    it('should pass with all required columns', () => {
      const headers = ['transaction_date', 'description', 'amount'];
      const result = validateCsvHeaders(headers);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should pass with extra columns', () => {
      const headers = ['id', 'transaction_date', 'description', 'amount', 'reference_number'];
      const result = validateCsvHeaders(headers);

      expect(result.valid).toBe(true);
    });

    it('should be case insensitive', () => {
      const headers = ['TRANSACTION_DATE', 'Description', 'AMOUNT'];
      const result = validateCsvHeaders(headers);

      expect(result.valid).toBe(true);
    });

    it('should trim whitespace from headers', () => {
      const headers = ['  transaction_date  ', ' description ', '  amount  '];
      const result = validateCsvHeaders(headers);

      expect(result.valid).toBe(true);
    });

    it('should fail with missing transaction_date', () => {
      const headers = ['description', 'amount'];
      const result = validateCsvHeaders(headers);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('transaction_date');
    });

    it('should fail with missing description', () => {
      const headers = ['transaction_date', 'amount'];
      const result = validateCsvHeaders(headers);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('description');
    });

    it('should fail with missing amount', () => {
      const headers = ['transaction_date', 'description'];
      const result = validateCsvHeaders(headers);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('amount');
    });

    it('should report all missing columns', () => {
      const headers = ['id', 'reference_number'];
      const result = validateCsvHeaders(headers);

      expect(result.valid).toBe(false);
      expect(result.missing).toHaveLength(3);
      expect(result.missing).toContain('transaction_date');
      expect(result.missing).toContain('description');
      expect(result.missing).toContain('amount');
    });
  });

  // ============================================
  // Date parsing
  // ============================================
  describe('parseTransactionDate', () => {
    describe('ISO format (YYYY-MM-DD)', () => {
      it('should parse ISO date format', () => {
        const date = parseTransactionDate('2024-01-15');

        expect(date).toBeInstanceOf(Date);
        expect(date?.getFullYear()).toBe(2024);
        expect(date?.getMonth()).toBe(0); // January
        expect(date?.getDate()).toBe(15);
      });

      it('should parse ISO datetime format', () => {
        const date = parseTransactionDate('2024-01-15T10:30:00Z');

        expect(date).toBeInstanceOf(Date);
        expect(date?.getFullYear()).toBe(2024);
      });
    });

    describe('US format (MM/DD/YYYY)', () => {
      it('should parse US date format', () => {
        const date = parseTransactionDate('01/15/2024');

        expect(date).toBeInstanceOf(Date);
        expect(date?.getFullYear()).toBe(2024);
        expect(date?.getMonth()).toBe(0); // January
        expect(date?.getDate()).toBe(15);
      });

      it('should parse US date format with single digits', () => {
        const date = parseTransactionDate('1/5/2024');

        expect(date).toBeInstanceOf(Date);
        expect(date?.getMonth()).toBe(0); // January
        expect(date?.getDate()).toBe(5);
      });
    });

    describe('edge cases', () => {
      it('should return null for empty string', () => {
        expect(parseTransactionDate('')).toBeNull();
      });

      it('should return null for whitespace', () => {
        expect(parseTransactionDate('   ')).toBeNull();
      });

      it('should return null for invalid date', () => {
        expect(parseTransactionDate('not-a-date')).toBeNull();
      });

      it('should trim whitespace before parsing', () => {
        const date = parseTransactionDate('  2024-01-15  ');
        expect(date).toBeInstanceOf(Date);
      });
    });
  });

  // ============================================
  // Amount parsing
  // ============================================
  describe('parseAmount', () => {
    describe('basic formats', () => {
      it('should parse simple decimal', () => {
        expect(parseAmount('1234.56')).toBe(1234.56);
      });

      it('should parse integer', () => {
        expect(parseAmount('1500')).toBe(1500);
      });

      it('should parse negative amount', () => {
        expect(parseAmount('-500.00')).toBe(-500);
      });
    });

    describe('currency formats', () => {
      it('should parse with dollar sign', () => {
        expect(parseAmount('$1234.56')).toBe(1234.56);
      });

      it('should parse with commas', () => {
        expect(parseAmount('1,234.56')).toBe(1234.56);
      });

      it('should parse with dollar sign and commas', () => {
        expect(parseAmount('$1,234.56')).toBe(1234.56);
      });

      it('should parse large amounts', () => {
        expect(parseAmount('$1,234,567.89')).toBe(1234567.89);
      });
    });

    describe('edge cases', () => {
      it('should return null for empty string', () => {
        expect(parseAmount('')).toBeNull();
      });

      it('should return null for whitespace', () => {
        expect(parseAmount('   ')).toBeNull();
      });

      it('should return null for non-numeric', () => {
        expect(parseAmount('abc')).toBeNull();
      });

      it('should handle whitespace', () => {
        expect(parseAmount('  1234.56  ')).toBe(1234.56);
      });

      it('should round to 2 decimal places', () => {
        expect(parseAmount('1234.567')).toBe(1234.57);
      });
    });
  });

  // ============================================
  // Row parsing
  // ============================================
  describe('parseRow', () => {
    const validRow: BankTransactionCsvRow = {
      transaction_date: '2024-01-15',
      description: 'PAYMENT FROM ACME CORP',
      amount: '1500.00',
      reference_number: 'REF-001',
    };

    it('should parse valid row', () => {
      const result = parseRow(validRow, 1);

      expect(result.success).toBe(true);
      expect(result.rowNumber).toBe(1);
      expect(result.data).toBeDefined();
      expect(result.data?.description).toBe('PAYMENT FROM ACME CORP');
      expect(result.data?.amount).toBe(1500);
      expect(result.data?.referenceNumber).toBe('REF-001');
    });

    it('should parse row without reference_number', () => {
      const row: BankTransactionCsvRow = {
        transaction_date: '2024-01-15',
        description: 'PAYMENT FROM ACME CORP',
        amount: '1500.00',
      };

      const result = parseRow(row, 1);

      expect(result.success).toBe(true);
      expect(result.data?.referenceNumber).toBeNull();
    });

    it('should fail for invalid date', () => {
      const row: BankTransactionCsvRow = {
        transaction_date: 'not-a-date',
        description: 'PAYMENT FROM ACME CORP',
        amount: '1500.00',
      };

      const result = parseRow(row, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transaction_date');
    });

    it('should fail for empty description', () => {
      const row: BankTransactionCsvRow = {
        transaction_date: '2024-01-15',
        description: '',
        amount: '1500.00',
      };

      const result = parseRow(row, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('description');
    });

    it('should fail for invalid amount', () => {
      const row: BankTransactionCsvRow = {
        transaction_date: '2024-01-15',
        description: 'PAYMENT FROM ACME CORP',
        amount: 'not-a-number',
      };

      const result = parseRow(row, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid amount');
    });

    it('should trim description whitespace', () => {
      const row: BankTransactionCsvRow = {
        transaction_date: '2024-01-15',
        description: '  PAYMENT FROM ACME CORP  ',
        amount: '1500.00',
      };

      const result = parseRow(row, 1);

      expect(result.success).toBe(true);
      expect(result.data?.description).toBe('PAYMENT FROM ACME CORP');
    });

    it('should include row number in result', () => {
      const result = parseRow(validRow, 42);

      expect(result.rowNumber).toBe(42);
    });
  });

  // ============================================
  // Real-world scenarios
  // ============================================
  describe('real-world scenarios', () => {
    it('should handle typical bank transaction row', () => {
      const row: BankTransactionCsvRow = {
        transaction_date: '2024-01-15',
        description: 'ACH DEBIT PAYMENT TO ACME CORPORATION',
        amount: '$1,500.00',
        reference_number: 'REF-2024-001',
      };

      const result = parseRow(row, 1);

      expect(result.success).toBe(true);
      expect(result.data?.amount).toBe(1500);
    });

    it('should handle check deposit row', () => {
      const row: BankTransactionCsvRow = {
        transaction_date: '01/15/2024',
        description: 'CHK DEP SMITH JOHN',
        amount: '2500.50',
      };

      const result = parseRow(row, 1);

      expect(result.success).toBe(true);
      expect(result.data?.description).toBe('CHK DEP SMITH JOHN');
    });

    it('should handle wire transfer row', () => {
      const row: BankTransactionCsvRow = {
        transaction_date: '2024-01-15T10:30:00Z',
        description: 'WIRE TRANSFER FROM GLOBAL LOGISTICS LTD',
        amount: '$10,000.00',
        reference_number: 'WIRE-2024-001',
      };

      const result = parseRow(row, 1);

      expect(result.success).toBe(true);
      expect(result.data?.amount).toBe(10000);
    });
  });
});
