/**
 * Tests for Ambiguity Penalty Calculation
 *
 * Penalty structure (updated):
 * - 1 candidate: 0 (no ambiguity)
 * - 2 candidates: 5 (some ambiguity)
 * - 3+ candidates: 10 (significant ambiguity)
 */

import { calculateAmbiguityPenalty } from '../../src/matching/ambiguityPenalty';
import { AMBIGUITY_PENALTIES } from '../../src/matching/constants';

describe('calculateAmbiguityPenalty', () => {
  // ============================================
  // Verify constants
  // ============================================
  describe('constants verification', () => {
    it('should have SINGLE = 0', () => {
      expect(AMBIGUITY_PENALTIES.SINGLE).toBe(0);
    });

    it('should have TWO = 5', () => {
      expect(AMBIGUITY_PENALTIES.TWO).toBe(5);
    });

    it('should have MULTIPLE = 10', () => {
      expect(AMBIGUITY_PENALTIES.MULTIPLE).toBe(10);
    });
  });

  // ============================================
  // Single candidate
  // ============================================
  describe('single candidate', () => {
    it('should return 0 for 1 candidate', () => {
      expect(calculateAmbiguityPenalty(1)).toBe(AMBIGUITY_PENALTIES.SINGLE);
      expect(calculateAmbiguityPenalty(1)).toBe(0);
    });
  });

  // ============================================
  // Two candidates
  // ============================================
  describe('two candidates', () => {
    it('should return 5 for 2 candidates', () => {
      expect(calculateAmbiguityPenalty(2)).toBe(AMBIGUITY_PENALTIES.TWO);
      expect(calculateAmbiguityPenalty(2)).toBe(5);
    });
  });

  // ============================================
  // Multiple candidates (3+)
  // ============================================
  describe('multiple candidates (3+)', () => {
    it('should return 10 for 3 candidates', () => {
      expect(calculateAmbiguityPenalty(3)).toBe(AMBIGUITY_PENALTIES.MULTIPLE);
      expect(calculateAmbiguityPenalty(3)).toBe(10);
    });

    it('should return 10 for 5 candidates', () => {
      expect(calculateAmbiguityPenalty(5)).toBe(10);
    });

    it('should return 10 for 10 candidates', () => {
      expect(calculateAmbiguityPenalty(10)).toBe(10);
    });

    it('should return 10 for 100 candidates', () => {
      expect(calculateAmbiguityPenalty(100)).toBe(10);
    });
  });

  // ============================================
  // Edge cases
  // ============================================
  describe('edge cases', () => {
    it('should return 0 for 0 candidates', () => {
      expect(calculateAmbiguityPenalty(0)).toBe(0);
    });

    it('should return 0 for negative numbers', () => {
      expect(calculateAmbiguityPenalty(-1)).toBe(0);
      expect(calculateAmbiguityPenalty(-100)).toBe(0);
    });
  });

  // ============================================
  // Real-world impact on confidence
  // ============================================
  describe('impact on confidence score', () => {
    it('single candidate allows 85% name match to reach AUTO_MATCHED', () => {
      // 85 (name) + 10 (date) - 0 (penalty) = 95 → AUTO_MATCHED
      const nameSim = 85;
      const dateScore = 10;
      const penalty = calculateAmbiguityPenalty(1);
      const confidence = nameSim + dateScore - penalty;

      expect(confidence).toBe(95);
      expect(confidence).toBeGreaterThanOrEqual(95); // AUTO_MATCHED threshold
    });

    it('two candidates still allows good match to AUTO_MATCH', () => {
      // 90 (name) + 10 (date) - 5 (penalty) = 95 → AUTO_MATCHED
      const nameSim = 90;
      const dateScore = 10;
      const penalty = calculateAmbiguityPenalty(2);
      const confidence = nameSim + dateScore - penalty;

      expect(confidence).toBe(95);
    });

    it('three candidates pushes borderline match to NEEDS_REVIEW', () => {
      // 85 (name) + 10 (date) - 10 (penalty) = 85 → NEEDS_REVIEW
      const nameSim = 85;
      const dateScore = 10;
      const penalty = calculateAmbiguityPenalty(3);
      const confidence = nameSim + dateScore - penalty;

      expect(confidence).toBe(85);
      expect(confidence).toBeLessThan(95); // Below AUTO_MATCHED
      expect(confidence).toBeGreaterThanOrEqual(60); // Above UNMATCHED
    });
  });
});
