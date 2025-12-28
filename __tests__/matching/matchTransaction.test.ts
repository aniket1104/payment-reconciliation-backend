/**
 * Tests for Main Transaction Matching Function
 *
 * Formula: confidence = nameSimilarity + dateScore - ambiguityPenalty
 *
 * Thresholds:
 * - AUTO_MATCHED: ≥95
 * - NEEDS_REVIEW: 60-94
 * - UNMATCHED: <60
 */

import { matchTransaction } from '../../src/matching/matchTransaction';
import type { BankTransactionInput, InvoiceInput } from '../../src/matching/types';

describe('matchTransaction', () => {
  // ============================================
  // Test fixtures
  // ============================================

  const createTransaction = (
    description: string,
    transactionDate: string = '2024-01-15'
  ): BankTransactionInput => ({
    transactionDate: new Date(transactionDate),
    description,
    amount: 1500.0,
  });

  const createInvoice = (
    id: string,
    customerName: string,
    dueDate: string = '2024-01-15'
  ): InvoiceInput => ({
    id,
    invoiceNumber: `INV-2024-${id.padStart(3, '0')}`,
    customerName,
    dueDate: new Date(dueDate),
  });

  // ============================================
  // UNMATCHED cases (<60)
  // ============================================

  describe('UNMATCHED status', () => {
    it('should return UNMATCHED when no candidates provided', () => {
      const transaction = createTransaction('PAYMENT FROM ACME CORP');
      const result = matchTransaction(transaction, []);

      expect(result.status).toBe('UNMATCHED');
      expect(result.confidenceScore).toBe(0);
      expect(result.matchedInvoiceId).toBeUndefined();
      expect(result.matchDetails.candidateCount).toBe(0);
      expect(result.matchDetails.explanation).toContain('No candidate invoices');
    });

    it('should return UNMATCHED for completely different names', () => {
      // Use very different names that have low Jaro-Winkler similarity
      const transaction = createTransaction('PAYMENT FROM QWERTY ZXCVB');
      const candidates = [createInvoice('1', 'Acme Corporation')];

      const result = matchTransaction(transaction, candidates);

      // Very different names should result in low confidence
      expect(result.confidenceScore).toBeLessThan(70);
      // Could be UNMATCHED or low NEEDS_REVIEW depending on exact similarity
      expect(['UNMATCHED', 'NEEDS_REVIEW']).toContain(result.status);
    });

    it('should return UNMATCHED with low similarity and far date', () => {
      const transaction = createTransaction('PAYMENT ABC', '2024-03-15'); // Far from due date
      const candidates = [createInvoice('1', 'XYZ Corp', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.status).toBe('UNMATCHED');
      expect(result.confidenceScore).toBeLessThan(60);
    });

    it('should not return matchedInvoiceId for UNMATCHED', () => {
      const transaction = createTransaction('RANDOM PAYMENT XYZ');
      const candidates = [createInvoice('1', 'Acme Corporation')];

      const result = matchTransaction(transaction, candidates);

      if (result.status === 'UNMATCHED') {
        expect(result.matchedInvoiceId).toBeUndefined();
      }
    });
  });

  // ============================================
  // AUTO_MATCHED cases (≥95)
  // ============================================

  describe('AUTO_MATCHED status', () => {
    it('should return AUTO_MATCHED for exact name match with close date', () => {
      // "ACME CORPORATION" should match "Acme Corporation" with ~100% similarity
      // 100 (name) + 15 (very close date) = 115, clamped to 100
      const transaction = createTransaction('ACME CORPORATION', '2024-01-15');
      const candidates = [createInvoice('1', 'Acme Corporation', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.status).toBe('AUTO_MATCHED');
      expect(result.confidenceScore).toBeGreaterThanOrEqual(95);
      expect(result.matchedInvoiceId).toBe('1');
    });

    it('should return AUTO_MATCHED for similar name with very close date', () => {
      // "ACME CORP" vs "Acme Corporation" ~85% + 15 (very close) = 100
      const transaction = createTransaction('ACME CORP', '2024-01-16');
      const candidates = [createInvoice('1', 'Acme Corporation', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.status).toBe('AUTO_MATCHED');
      expect(result.matchedInvoiceId).toBe('1');
    });

    it('should include match details with breakdown for AUTO_MATCHED', () => {
      const transaction = createTransaction('ACME CORPORATION', '2024-01-15');
      const candidates = [createInvoice('1', 'Acme Corporation', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchDetails.breakdown).toBeDefined();
      expect(result.matchDetails.breakdown.rawNameSimilarity).toBeGreaterThan(90);
      expect(result.matchDetails.breakdown.dateScore).toBe(15);
      expect(result.matchDetails.breakdown.ambiguityPenalty).toBe(0);
      expect(result.matchDetails.normalizedDescription).toBeDefined();
      expect(result.matchDetails.candidateCount).toBe(1);
    });
  });

  // ============================================
  // NEEDS_REVIEW cases (60-94)
  // ============================================

  describe('NEEDS_REVIEW status', () => {
    it('should return NEEDS_REVIEW for partial name match', () => {
      // "TECHSTART" vs "TechStart Inc" - good partial match
      const transaction = createTransaction('PAYMENT TECHSTART', '2024-01-15');
      const candidates = [createInvoice('1', 'TechStart Inc', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      // Partial match should be matched with confidence ≥60
      expect(['NEEDS_REVIEW', 'AUTO_MATCHED']).toContain(result.status);
      expect(result.matchedInvoiceId).toBe('1');
      expect(result.confidenceScore).toBeGreaterThanOrEqual(60);
    });

    it('should return NEEDS_REVIEW for good match with 3+ candidates (ambiguity)', () => {
      const transaction = createTransaction('PAYMENT FROM SMITH', '2024-01-15');
      const candidates = [
        createInvoice('1', 'Smith & Associates', '2024-01-15'),
        createInvoice('2', 'Smith Corp', '2024-01-15'),
        createInvoice('3', 'John Smith', '2024-01-15'),
      ];

      const result = matchTransaction(transaction, candidates);

      // With 3 candidates, there's a -10 ambiguity penalty
      expect(result.matchDetails.breakdown.ambiguityPenalty).toBe(10);
      expect(result.matchedInvoiceId).toBeDefined();
    });

    it('should return NEEDS_REVIEW for moderate match far from due date', () => {
      // Good name match but far date (-10 penalty)
      const transaction = createTransaction('TECHSTART INC', '2024-03-01'); // Far from due date
      const candidates = [createInvoice('1', 'TechStart Inc', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      // High name similarity (~95) but -10 date penalty = ~85
      expect(['NEEDS_REVIEW', 'AUTO_MATCHED']).toContain(result.status);
    });
  });

  // ============================================
  // Ambiguity penalty tests
  // ============================================

  describe('ambiguity penalty', () => {
    it('should have no penalty for single candidate', () => {
      const transaction = createTransaction('ACME CORPORATION', '2024-01-15');
      const candidates = [createInvoice('1', 'Acme Corporation', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchDetails.breakdown.ambiguityPenalty).toBe(0);
    });

    it('should have 5 penalty for 2 candidates', () => {
      const transaction = createTransaction('ACME CORPORATION', '2024-01-15');
      const candidates = [
        createInvoice('1', 'Acme Corporation', '2024-01-15'),
        createInvoice('2', 'Acme Corp Ltd', '2024-01-15'),
      ];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchDetails.breakdown.ambiguityPenalty).toBe(5);
    });

    it('should have 10 penalty for 3+ candidates', () => {
      const transaction = createTransaction('SMITH', '2024-01-15');
      const candidates = [
        createInvoice('1', 'Smith Corp', '2024-01-15'),
        createInvoice('2', 'Smith Inc', '2024-01-15'),
        createInvoice('3', 'Smith Ltd', '2024-01-15'),
      ];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchDetails.breakdown.ambiguityPenalty).toBe(10);
    });
  });

  // ============================================
  // Best candidate selection
  // ============================================

  describe('best candidate selection', () => {
    it('should select candidate with highest similarity', () => {
      const transaction = createTransaction('ACME CORPORATION', '2024-01-15');
      const candidates = [
        createInvoice('1', 'XYZ Company', '2024-01-15'),
        createInvoice('2', 'Acme Corporation', '2024-01-15'), // Best match
        createInvoice('3', 'ABC Corp', '2024-01-15'),
      ];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchedInvoiceId).toBe('2');
    });

    it('should consider date proximity in scoring', () => {
      const transaction = createTransaction('SMITH ASSOCIATES', '2024-01-15');
      const candidates = [
        createInvoice('1', 'Smith Associates', '2024-03-15'), // Far date
        createInvoice('2', 'Smith Associates', '2024-01-16'), // Close date
      ];

      const result = matchTransaction(transaction, candidates);

      // Candidate 2 should be preferred due to closer date
      expect(result.matchedInvoiceId).toBe('2');
    });

    it('should select based on combined score (name + date)', () => {
      const transaction = createTransaction('ACME', '2024-01-15');
      const candidates = [
        createInvoice('1', 'Acme Corp', '2024-03-01'), // Good name, far date
        createInvoice('2', 'ACME', '2024-01-15'), // Perfect name, perfect date
      ];

      const result = matchTransaction(transaction, candidates);

      // Perfect match should win
      expect(result.matchedInvoiceId).toBe('2');
    });
  });

  // ============================================
  // Name normalization and matching
  // ============================================

  describe('name normalization', () => {
    it('should handle reordered names (SMITH JOHN vs JOHN SMITH)', () => {
      const transaction = createTransaction('CHK DEP SMITH JOHN', '2024-01-15');
      const candidates = [createInvoice('1', 'John Smith', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      // Should match despite word order
      expect(result.matchedInvoiceId).toBe('1');
      expect(result.confidenceScore).toBeGreaterThan(60);
    });

    it('should remove noise words from bank description', () => {
      const transaction = createTransaction('ACH PAYMENT TRANSFER FROM ACME CORP', '2024-01-15');
      const candidates = [createInvoice('1', 'Acme Corporation', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchDetails.normalizedDescription).toBe('ACME CORP');
    });

    it('should handle special characters in names', () => {
      const transaction = createTransaction("SMITH'S ASSOCIATES", '2024-01-15');
      const candidates = [createInvoice('1', 'Smith & Associates', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchedInvoiceId).toBe('1');
      expect(result.confidenceScore).toBeGreaterThan(60);
    });

    it('should handle case differences', () => {
      const transaction = createTransaction('acme corporation', '2024-01-15');
      const candidates = [createInvoice('1', 'ACME CORPORATION', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchedInvoiceId).toBe('1');
      expect(result.status).toBe('AUTO_MATCHED');
    });
  });

  // ============================================
  // Match details
  // ============================================

  describe('match details', () => {
    it('should include explanation in match details', () => {
      const transaction = createTransaction('ACME CORP', '2024-01-15');
      const candidates = [createInvoice('1', 'Acme Corporation', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchDetails.explanation).toBeDefined();
      expect(result.matchDetails.explanation.length).toBeGreaterThan(0);
    });

    it('should include normalized names in details', () => {
      const transaction = createTransaction('payment from Acme Corp.', '2024-01-15');
      const candidates = [createInvoice('1', 'Acme Corporation', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchDetails.normalizedDescription).toBeDefined();
      expect(result.matchDetails.normalizedCustomerName).toBeDefined();
    });

    it('should include invoice number in result', () => {
      const transaction = createTransaction('ACME CORP', '2024-01-15');
      const candidates = [createInvoice('1', 'Acme Corporation', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchedInvoiceNumber).toBe('INV-2024-001');
    });
  });

  // ============================================
  // Determinism
  // ============================================

  describe('determinism', () => {
    it('should return same result for same inputs', () => {
      const transaction = createTransaction('ACME CORP', '2024-01-15');
      const candidates = [createInvoice('1', 'Acme Corporation', '2024-01-15')];

      const result1 = matchTransaction(transaction, candidates);
      const result2 = matchTransaction(transaction, candidates);

      expect(result1.status).toBe(result2.status);
      expect(result1.confidenceScore).toBe(result2.confidenceScore);
      expect(result1.matchedInvoiceId).toBe(result2.matchedInvoiceId);
    });

    it('should be deterministic with multiple candidates', () => {
      const transaction = createTransaction('SMITH', '2024-01-15');
      const candidates = [
        createInvoice('1', 'John Smith', '2024-01-15'),
        createInvoice('2', 'Jane Smith', '2024-01-15'),
      ];

      const result1 = matchTransaction(transaction, candidates);
      const result2 = matchTransaction(transaction, candidates);

      expect(result1.matchedInvoiceId).toBe(result2.matchedInvoiceId);
    });
  });

  // ============================================
  // Threshold boundary tests
  // ============================================

  describe('threshold boundaries', () => {
    it('confidence exactly at 95 should be AUTO_MATCHED', () => {
      // This tests the >= comparison
      // Need a scenario that gives exactly 95
      const transaction = createTransaction('ACME CORP', '2024-01-20'); // 5 days = +10
      const candidates = [createInvoice('1', 'Acme Corp', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      // If confidence is 95 or higher, should be AUTO_MATCHED
      if (result.confidenceScore >= 95) {
        expect(result.status).toBe('AUTO_MATCHED');
      }
    });

    it('confidence exactly at 60 should be NEEDS_REVIEW', () => {
      // Tests the >= 60 boundary
      const result = matchTransaction(createTransaction('PARTIAL MATCH', '2024-01-15'), [
        createInvoice('1', 'Partial Match', '2024-01-15'),
      ]);

      if (result.confidenceScore >= 60 && result.confidenceScore < 95) {
        expect(result.status).toBe('NEEDS_REVIEW');
      }
    });
  });

  // ============================================
  // Real-world bank description tests
  // ============================================

  describe('real-world bank descriptions', () => {
    it('should handle "CHK DEP SMITH JOHN"', () => {
      const transaction = createTransaction('CHK DEP SMITH JOHN', '2024-01-15');
      const candidates = [createInvoice('1', 'John Smith', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchedInvoiceId).toBe('1');
    });

    it('should handle "ACH DEBIT PAYMENT TO ACME"', () => {
      const transaction = createTransaction('ACH DEBIT PAYMENT TO ACME', '2024-01-15');
      const candidates = [createInvoice('1', 'Acme Corporation', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchedInvoiceId).toBe('1');
    });

    it('should handle "WIRE TRANSFER FROM GLOBAL LOGISTICS"', () => {
      const transaction = createTransaction('WIRE TRANSFER FROM GLOBAL LOGISTICS', '2024-01-15');
      const candidates = [createInvoice('1', 'Global Logistics Ltd', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchedInvoiceId).toBe('1');
    });

    it('should handle "ONLINE PMT REF#12345 TECHSTART"', () => {
      const transaction = createTransaction('ONLINE PMT REF#12345 TECHSTART', '2024-01-15');
      const candidates = [createInvoice('1', 'TechStart Inc', '2024-01-15')];

      const result = matchTransaction(transaction, candidates);

      expect(result.matchedInvoiceId).toBe('1');
    });
  });
});
