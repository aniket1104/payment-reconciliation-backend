/**
 * Tests for Confidence Score Calculator
 *
 * Formula: confidence = nameSimilarity + dateScore - ambiguityPenalty
 *
 * Thresholds:
 * - AUTO_MATCHED: ≥95
 * - NEEDS_REVIEW: 60-94
 * - UNMATCHED: <60
 */

import { calculateConfidence, generateExplanation } from '../../src/matching/confidenceCalculator';
import type { ConfidenceBreakdown } from '../../src/matching/types';
import {
  NAME_SIMILARITY_WEIGHT,
  AUTO_MATCHED_THRESHOLD,
  NEEDS_REVIEW_THRESHOLD,
  AMBIGUITY_PENALTIES,
} from '../../src/matching/constants';

describe('calculateConfidence', () => {
  // ============================================
  // Verify constants are as expected
  // ============================================
  describe('constants verification', () => {
    it('should have NAME_SIMILARITY_WEIGHT = 1.0', () => {
      expect(NAME_SIMILARITY_WEIGHT).toBe(1.0);
    });

    it('should have AUTO_MATCHED_THRESHOLD = 95', () => {
      expect(AUTO_MATCHED_THRESHOLD).toBe(95);
    });

    it('should have NEEDS_REVIEW_THRESHOLD = 60', () => {
      expect(NEEDS_REVIEW_THRESHOLD).toBe(60);
    });

    it('should have AMBIGUITY_PENALTIES.TWO = 5', () => {
      expect(AMBIGUITY_PENALTIES.TWO).toBe(5);
    });

    it('should have AMBIGUITY_PENALTIES.MULTIPLE = 10', () => {
      expect(AMBIGUITY_PENALTIES.MULTIPLE).toBe(10);
    });
  });

  // ============================================
  // Score calculation tests
  // ============================================
  describe('score calculation', () => {
    it('should calculate perfect score (100 name + 15 date)', () => {
      const result = calculateConfidence({
        nameSimilarity: 100,
        dateScore: 15,
        candidateCount: 1,
      });

      // 100 * 1.0 + 15 - 0 = 115, clamped to 100
      expect(result.confidenceScore).toBe(100);
    });

    it('should calculate AUTO_MATCHED score (85 name + 10 date)', () => {
      const result = calculateConfidence({
        nameSimilarity: 85,
        dateScore: 10,
        candidateCount: 1,
      });

      // 85 * 1.0 + 10 - 0 = 95 → AUTO_MATCHED
      expect(result.confidenceScore).toBe(95);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(AUTO_MATCHED_THRESHOLD);
    });

    it('should calculate NEEDS_REVIEW score (75 name + 10 date)', () => {
      const result = calculateConfidence({
        nameSimilarity: 75,
        dateScore: 10,
        candidateCount: 1,
      });

      // 75 * 1.0 + 10 - 0 = 85 → NEEDS_REVIEW
      expect(result.confidenceScore).toBe(85);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(NEEDS_REVIEW_THRESHOLD);
      expect(result.confidenceScore).toBeLessThan(AUTO_MATCHED_THRESHOLD);
    });

    it('should calculate borderline NEEDS_REVIEW score (60 name + 0 date)', () => {
      const result = calculateConfidence({
        nameSimilarity: 60,
        dateScore: 0,
        candidateCount: 1,
      });

      // 60 * 1.0 + 0 - 0 = 60 → NEEDS_REVIEW (borderline)
      expect(result.confidenceScore).toBe(60);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(NEEDS_REVIEW_THRESHOLD);
    });

    it('should calculate UNMATCHED score (55 name + 0 date)', () => {
      const result = calculateConfidence({
        nameSimilarity: 55,
        dateScore: 0,
        candidateCount: 1,
      });

      // 55 * 1.0 + 0 - 0 = 55 → UNMATCHED
      expect(result.confidenceScore).toBe(55);
      expect(result.confidenceScore).toBeLessThan(NEEDS_REVIEW_THRESHOLD);
    });

    it('should apply name similarity weight of 1.0', () => {
      const result = calculateConfidence({
        nameSimilarity: 80,
        dateScore: 0,
        candidateCount: 1,
      });

      // 80 * 1.0 = 80
      expect(result.confidenceScore).toBe(80);
      expect(result.breakdown.weightedNameScore).toBe(80);
    });
  });

  // ============================================
  // Date score tests
  // ============================================
  describe('date score handling', () => {
    it('should add date score bonus (+15 very close)', () => {
      const result = calculateConfidence({
        nameSimilarity: 80,
        dateScore: 15,
        candidateCount: 1,
      });

      // 80 + 15 = 95 → AUTO_MATCHED
      expect(result.confidenceScore).toBe(95);
    });

    it('should add date score bonus (+10 close)', () => {
      const result = calculateConfidence({
        nameSimilarity: 80,
        dateScore: 10,
        candidateCount: 1,
      });

      // 80 + 10 = 90 → NEEDS_REVIEW
      expect(result.confidenceScore).toBe(90);
    });

    it('should handle neutral date score (0)', () => {
      const result = calculateConfidence({
        nameSimilarity: 80,
        dateScore: 0,
        candidateCount: 1,
      });

      // 80 + 0 = 80
      expect(result.confidenceScore).toBe(80);
    });

    it('should handle negative date score (-10 far)', () => {
      const result = calculateConfidence({
        nameSimilarity: 80,
        dateScore: -10,
        candidateCount: 1,
      });

      // 80 - 10 = 70
      expect(result.confidenceScore).toBe(70);
    });
  });

  // ============================================
  // Ambiguity penalty tests
  // ============================================
  describe('ambiguity penalty', () => {
    it('should have no penalty for single candidate', () => {
      const result = calculateConfidence({
        nameSimilarity: 90,
        dateScore: 10,
        candidateCount: 1,
      });

      // 90 + 10 - 0 = 100
      expect(result.breakdown.ambiguityPenalty).toBe(0);
      expect(result.confidenceScore).toBe(100);
    });

    it('should subtract 5 for 2 candidates', () => {
      const result = calculateConfidence({
        nameSimilarity: 90,
        dateScore: 10,
        candidateCount: 2,
      });

      // 90 + 10 - 5 = 95 → AUTO_MATCHED
      expect(result.breakdown.ambiguityPenalty).toBe(5);
      expect(result.confidenceScore).toBe(95);
    });

    it('should subtract 10 for 3+ candidates', () => {
      const result = calculateConfidence({
        nameSimilarity: 90,
        dateScore: 10,
        candidateCount: 3,
      });

      // 90 + 10 - 10 = 90 → NEEDS_REVIEW
      expect(result.breakdown.ambiguityPenalty).toBe(10);
      expect(result.confidenceScore).toBe(90);
    });

    it('should subtract 10 for many candidates', () => {
      const result = calculateConfidence({
        nameSimilarity: 90,
        dateScore: 10,
        candidateCount: 10,
      });

      // 90 + 10 - 10 = 90
      expect(result.breakdown.ambiguityPenalty).toBe(10);
      expect(result.confidenceScore).toBe(90);
    });
  });

  // ============================================
  // Clamping tests
  // ============================================
  describe('clamping', () => {
    it('should clamp score to maximum 100', () => {
      const result = calculateConfidence({
        nameSimilarity: 100,
        dateScore: 15,
        candidateCount: 1,
      });

      // 100 + 15 = 115, clamped to 100
      expect(result.confidenceScore).toBe(100);
    });

    it('should clamp score to minimum 0', () => {
      const result = calculateConfidence({
        nameSimilarity: 0,
        dateScore: -10,
        candidateCount: 3,
      });

      // 0 - 10 - 10 = -20, clamped to 0
      expect(result.confidenceScore).toBe(0);
    });

    it('should handle very low similarity with penalties', () => {
      const result = calculateConfidence({
        nameSimilarity: 10,
        dateScore: -10,
        candidateCount: 3,
      });

      // 10 - 10 - 10 = -10, clamped to 0
      expect(result.confidenceScore).toBe(0);
    });
  });

  // ============================================
  // Breakdown tests
  // ============================================
  describe('breakdown', () => {
    it('should include all breakdown fields', () => {
      const result = calculateConfidence({
        nameSimilarity: 85,
        dateScore: 10,
        candidateCount: 2,
      });

      expect(result.breakdown).toHaveProperty('rawNameSimilarity');
      expect(result.breakdown).toHaveProperty('weightedNameScore');
      expect(result.breakdown).toHaveProperty('dateScore');
      expect(result.breakdown).toHaveProperty('ambiguityPenalty');
      expect(result.breakdown).toHaveProperty('rawTotal');
    });

    it('should have correct breakdown values', () => {
      const result = calculateConfidence({
        nameSimilarity: 80,
        dateScore: 10,
        candidateCount: 2,
      });

      expect(result.breakdown.rawNameSimilarity).toBe(80);
      expect(result.breakdown.weightedNameScore).toBe(80); // 80 * 1.0
      expect(result.breakdown.dateScore).toBe(10);
      expect(result.breakdown.ambiguityPenalty).toBe(5);
      expect(result.breakdown.rawTotal).toBe(85); // 80 + 10 - 5
    });
  });

  // ============================================
  // Real-world scenario tests
  // ============================================
  describe('real-world scenarios', () => {
    it('scenario: perfect match, single candidate', () => {
      // Bank: "ACME CORPORATION" matches Invoice: "Acme Corporation"
      // Name similarity ~100%, date within 3 days (+15)
      const result = calculateConfidence({
        nameSimilarity: 100,
        dateScore: 15,
        candidateCount: 1,
      });

      expect(result.confidenceScore).toBe(100);
    });

    it('scenario: good match with some name difference', () => {
      // Bank: "ACME CORP" matches Invoice: "Acme Corporation"
      // Name similarity ~85%, date within 7 days (+10)
      const result = calculateConfidence({
        nameSimilarity: 85,
        dateScore: 10,
        candidateCount: 1,
      });

      // 85 + 10 = 95 → AUTO_MATCHED
      expect(result.confidenceScore).toBe(95);
    });

    it('scenario: ambiguous match with 2 similar invoices', () => {
      // Bank: "SMITH PAYMENT" matches 2 invoices
      // Name similarity ~90%, date within 7 days (+10), 2 candidates (-5)
      const result = calculateConfidence({
        nameSimilarity: 90,
        dateScore: 10,
        candidateCount: 2,
      });

      // 90 + 10 - 5 = 95 → AUTO_MATCHED (still good enough)
      expect(result.confidenceScore).toBe(95);
    });

    it('scenario: poor match, far date', () => {
      // Bank: "XYZ PAYMENT" weak match to Invoice
      // Name similarity ~50%, date > 30 days (-10)
      const result = calculateConfidence({
        nameSimilarity: 50,
        dateScore: -10,
        candidateCount: 1,
      });

      // 50 - 10 = 40 → UNMATCHED
      expect(result.confidenceScore).toBe(40);
      expect(result.confidenceScore).toBeLessThan(NEEDS_REVIEW_THRESHOLD);
    });
  });
});

describe('generateExplanation', () => {
  it('should generate explanation with all components', () => {
    const breakdown: ConfidenceBreakdown = {
      rawNameSimilarity: 85,
      weightedNameScore: 85,
      dateScore: 15,
      ambiguityPenalty: 5,
      rawTotal: 95,
    };

    const explanation = generateExplanation(breakdown, 'AUTO_MATCHED');

    expect(explanation).toContain('Name similarity: 85%');
    expect(explanation).toContain('Date proximity bonus: +15');
    expect(explanation).toContain('Ambiguity penalty: -5');
    expect(explanation).toContain('AUTO_MATCHED');
  });

  it('should show penalty for negative date score', () => {
    const breakdown: ConfidenceBreakdown = {
      rawNameSimilarity: 70,
      weightedNameScore: 70,
      dateScore: -10,
      ambiguityPenalty: 0,
      rawTotal: 60,
    };

    const explanation = generateExplanation(breakdown, 'NEEDS_REVIEW');

    expect(explanation).toContain('Date proximity penalty: -10');
  });

  it('should show neutral for zero date score', () => {
    const breakdown: ConfidenceBreakdown = {
      rawNameSimilarity: 70,
      weightedNameScore: 70,
      dateScore: 0,
      ambiguityPenalty: 0,
      rawTotal: 70,
    };

    const explanation = generateExplanation(breakdown, 'NEEDS_REVIEW');

    expect(explanation).toContain('Date proximity: neutral');
  });

  it('should not mention ambiguity if no penalty', () => {
    const breakdown: ConfidenceBreakdown = {
      rawNameSimilarity: 85,
      weightedNameScore: 85,
      dateScore: 10,
      ambiguityPenalty: 0,
      rawTotal: 95,
    };

    const explanation = generateExplanation(breakdown, 'AUTO_MATCHED');

    expect(explanation).not.toContain('Ambiguity penalty');
  });
});
