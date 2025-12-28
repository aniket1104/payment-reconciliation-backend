/**
 * Tests for Name Normalization
 */

import { normalizeName, extractReferenceNumbers } from '../../src/matching/normalizeName';

describe('normalizeName', () => {
  describe('basic transformations', () => {
    it('should convert to uppercase', () => {
      expect(normalizeName('acme corp')).toBe('ACME CORP');
    });

    it('should remove punctuation', () => {
      expect(normalizeName('Acme, Corp.')).toBe('ACME CORP');
      // Apostrophe becomes space, resulting in separate S
      expect(normalizeName("Smith's & Associates")).toBe('SMITH S ASSOCIATES');
    });

    it('should remove special characters', () => {
      expect(normalizeName('ACH-TRANSFER-#12345')).toBe('12345');
      // ONLINE is a noise word, so only COM remains
      expect(normalizeName('Payment@online.com')).toBe('COM');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeName('ACME    CORP')).toBe('ACME CORP');
      expect(normalizeName('  SMITH   JOHN  ')).toBe('SMITH JOHN');
    });

    it('should trim whitespace', () => {
      expect(normalizeName('  ACME CORP  ')).toBe('ACME CORP');
    });
  });

  describe('noise word removal', () => {
    it('should remove PAYMENT', () => {
      expect(normalizeName('PAYMENT FROM ACME CORP')).toBe('ACME CORP');
    });

    it('should remove DEPOSIT', () => {
      expect(normalizeName('DEPOSIT SMITH JOHN')).toBe('SMITH JOHN');
    });

    it('should remove TRANSFER', () => {
      expect(normalizeName('WIRE TRANSFER GLOBAL LOGISTICS')).toBe('GLOBAL LOGISTICS');
    });

    it('should remove CHK and DEP', () => {
      expect(normalizeName('CHK DEP SMITH JOHN')).toBe('SMITH JOHN');
    });

    it('should remove ACH', () => {
      expect(normalizeName('ACH PMT ACME CORPORATION')).toBe('ACME CORPORATION');
    });

    it('should remove REF', () => {
      expect(normalizeName('PMT REF TECHSTART INC')).toBe('TECHSTART INC');
    });

    it('should remove ONLINE', () => {
      expect(normalizeName('ONLINE PAYMENT CLOUDNINE')).toBe('CLOUDNINE');
    });

    it('should remove multiple noise words', () => {
      expect(normalizeName('ACH PAYMENT TRANSFER FROM ACME')).toBe('ACME');
    });

    it('should handle real-world bank descriptions', () => {
      expect(normalizeName('ACH DEBIT PAYMENT TO SMITH & ASSOCIATES')).toBe('SMITH ASSOCIATES');
      expect(normalizeName('ONLINE PMT FROM GLOBAL LOGISTICS LTD')).toBe('GLOBAL LOGISTICS LTD');
      expect(normalizeName('CHK DEP REF#12345 TECHSTART')).toBe('12345 TECHSTART');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(normalizeName('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(normalizeName(null as unknown as string)).toBe('');
      expect(normalizeName(undefined as unknown as string)).toBe('');
    });

    it('should handle string with only noise words', () => {
      expect(normalizeName('PAYMENT DEPOSIT TRANSFER')).toBe('');
    });

    it('should handle string with only special characters', () => {
      expect(normalizeName('!@#$%^&*()')).toBe('');
    });

    it('should preserve numbers', () => {
      expect(normalizeName('INV2024001 ACME')).toBe('INV2024001 ACME');
    });
  });
});

describe('extractReferenceNumbers', () => {
  it('should extract invoice numbers', () => {
    expect(extractReferenceNumbers('ACH PMT REF INV-2024-001')).toContain('INV-2024-001');
  });

  it('should extract reference numbers after REF keyword', () => {
    const refs = extractReferenceNumbers('PAYMENT REF: ABC12345');
    expect(refs).toContain('ABC12345');
  });

  it('should handle multiple formats', () => {
    const refs = extractReferenceNumbers('INV-2024-001 REF#XYZ789');
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle empty string', () => {
    expect(extractReferenceNumbers('')).toEqual([]);
  });

  it('should handle no references', () => {
    expect(extractReferenceNumbers('PAYMENT FROM ACME CORP')).toEqual([]);
  });
});

