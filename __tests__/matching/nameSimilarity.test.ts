/**
 * Tests for Name Similarity Calculation
 */

import {
  calculateNameSimilarity,
  calculateNameSimilarityOrderIndependent,
} from '../../src/matching/nameSimilarity';

describe('calculateNameSimilarity', () => {
  describe('exact matches', () => {
    it('should return 100 for identical strings', () => {
      expect(calculateNameSimilarity('ACME CORP', 'ACME CORP')).toBe(100);
    });

    it('should return 100 for identical single words', () => {
      expect(calculateNameSimilarity('SMITH', 'SMITH')).toBe(100);
    });
  });

  describe('similar strings', () => {
    it('should return high score for very similar names', () => {
      const score = calculateNameSimilarity('ACME CORP', 'ACME CORPORATION');
      expect(score).toBeGreaterThan(80);
    });

    it('should return moderate score for partially similar names', () => {
      const score = calculateNameSimilarity('ACME', 'ACME CORP');
      expect(score).toBeGreaterThan(60);
    });

    it('should handle minor typos', () => {
      const score = calculateNameSimilarity('TECHSTART', 'TECHSART');
      expect(score).toBeGreaterThan(85);
    });
  });

  describe('different strings', () => {
    it('should return lower score for different strings', () => {
      const score = calculateNameSimilarity('ACME CORP', 'SMITH JOHN');
      // Jaro-Winkler gives ~54 for strings with similar structure
      expect(score).toBeLessThan(60);
    });

    it('should return 0 for completely unrelated short strings', () => {
      const score = calculateNameSimilarity('ABC', 'XYZ');
      expect(score).toBeLessThan(50);
    });
  });

  describe('edge cases', () => {
    it('should return 0 for empty strings', () => {
      expect(calculateNameSimilarity('', 'ACME')).toBe(0);
      expect(calculateNameSimilarity('ACME', '')).toBe(0);
      expect(calculateNameSimilarity('', '')).toBe(0);
    });

    it('should handle single character strings', () => {
      const score = calculateNameSimilarity('A', 'A');
      expect(score).toBe(100);
    });
  });
});

describe('calculateNameSimilarityOrderIndependent', () => {
  describe('reordered names', () => {
    it('should handle SMITH JOHN vs JOHN SMITH', () => {
      const score = calculateNameSimilarityOrderIndependent('SMITH JOHN', 'JOHN SMITH');
      expect(score).toBe(100); // After sorting: JOHN SMITH vs JOHN SMITH
    });

    it('should handle company name word reordering', () => {
      const score = calculateNameSimilarityOrderIndependent('CORP ACME', 'ACME CORP');
      expect(score).toBe(100);
    });

    it('should handle three word names', () => {
      const score = calculateNameSimilarityOrderIndependent(
        'GLOBAL LOGISTICS LTD',
        'LOGISTICS GLOBAL LTD'
      );
      expect(score).toBe(100);
    });
  });

  describe('comparison with direct similarity', () => {
    it('should return at least as high as direct similarity', () => {
      const direct = calculateNameSimilarity('ACME CORP', 'ACME CORPORATION');
      const orderIndependent = calculateNameSimilarityOrderIndependent(
        'ACME CORP',
        'ACME CORPORATION'
      );
      expect(orderIndependent).toBeGreaterThanOrEqual(direct);
    });

    it('should improve score for reordered words', () => {
      const direct = calculateNameSimilarity('SMITH JOHN', 'JOHN SMITH');
      const orderIndependent = calculateNameSimilarityOrderIndependent('SMITH JOHN', 'JOHN SMITH');
      expect(orderIndependent).toBeGreaterThan(direct);
    });
  });

  describe('edge cases', () => {
    it('should return 0 for empty strings', () => {
      expect(calculateNameSimilarityOrderIndependent('', 'ACME')).toBe(0);
      expect(calculateNameSimilarityOrderIndependent('ACME', '')).toBe(0);
    });

    it('should handle single word', () => {
      const score = calculateNameSimilarityOrderIndependent('ACME', 'ACME');
      expect(score).toBe(100);
    });
  });
});

