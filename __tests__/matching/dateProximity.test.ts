/**
 * Tests for Date Proximity Scoring
 */

import { calculateDateScore, daysBetween } from '../../src/matching/dateProximity';
import { DATE_SCORES } from '../../src/matching/constants';

describe('daysBetween', () => {
  it('should return 0 for same date', () => {
    const date = new Date('2024-01-15');
    expect(daysBetween(date, date)).toBe(0);
  });

  it('should return positive for different dates', () => {
    const date1 = new Date('2024-01-10');
    const date2 = new Date('2024-01-15');
    expect(daysBetween(date1, date2)).toBe(5);
  });

  it('should be symmetric (order independent)', () => {
    const date1 = new Date('2024-01-10');
    const date2 = new Date('2024-01-15');
    expect(daysBetween(date1, date2)).toBe(daysBetween(date2, date1));
  });

  it('should handle month boundaries', () => {
    const date1 = new Date('2024-01-30');
    const date2 = new Date('2024-02-05');
    expect(daysBetween(date1, date2)).toBe(6);
  });

  it('should handle year boundaries', () => {
    const date1 = new Date('2023-12-30');
    const date2 = new Date('2024-01-05');
    expect(daysBetween(date1, date2)).toBe(6);
  });
});

describe('calculateDateScore', () => {
  const dueDate = new Date('2024-01-15');

  describe('very close (≤3 days)', () => {
    it('should return +15 for same day', () => {
      const transactionDate = new Date('2024-01-15');
      expect(calculateDateScore(transactionDate, dueDate)).toBe(DATE_SCORES.VERY_CLOSE);
    });

    it('should return +15 for 1 day before', () => {
      const transactionDate = new Date('2024-01-14');
      expect(calculateDateScore(transactionDate, dueDate)).toBe(DATE_SCORES.VERY_CLOSE);
    });

    it('should return +15 for 3 days after', () => {
      const transactionDate = new Date('2024-01-18');
      expect(calculateDateScore(transactionDate, dueDate)).toBe(DATE_SCORES.VERY_CLOSE);
    });
  });

  describe('close (≤7 days)', () => {
    it('should return +10 for 5 days difference', () => {
      const transactionDate = new Date('2024-01-20');
      expect(calculateDateScore(transactionDate, dueDate)).toBe(DATE_SCORES.CLOSE);
    });

    it('should return +10 for 7 days before', () => {
      const transactionDate = new Date('2024-01-08');
      expect(calculateDateScore(transactionDate, dueDate)).toBe(DATE_SCORES.CLOSE);
    });
  });

  describe('moderate (≤15 days)', () => {
    it('should return +5 for 10 days difference', () => {
      const transactionDate = new Date('2024-01-25');
      expect(calculateDateScore(transactionDate, dueDate)).toBe(DATE_SCORES.MODERATE);
    });

    it('should return +5 for 15 days before', () => {
      const transactionDate = new Date('2023-12-31');
      expect(calculateDateScore(transactionDate, dueDate)).toBe(DATE_SCORES.MODERATE);
    });
  });

  describe('neutral (16-30 days)', () => {
    it('should return 0 for 20 days difference', () => {
      const transactionDate = new Date('2024-02-04');
      expect(calculateDateScore(transactionDate, dueDate)).toBe(DATE_SCORES.NEUTRAL);
    });

    it('should return 0 for 30 days difference', () => {
      const transactionDate = new Date('2024-02-14');
      expect(calculateDateScore(transactionDate, dueDate)).toBe(DATE_SCORES.NEUTRAL);
    });
  });

  describe('far (>30 days)', () => {
    it('should return -10 for 31 days difference', () => {
      const transactionDate = new Date('2024-02-15');
      expect(calculateDateScore(transactionDate, dueDate)).toBe(DATE_SCORES.FAR_PENALTY);
    });

    it('should return -10 for 60 days difference', () => {
      const transactionDate = new Date('2024-03-15');
      expect(calculateDateScore(transactionDate, dueDate)).toBe(DATE_SCORES.FAR_PENALTY);
    });

    it('should return -10 for dates far in the past', () => {
      const transactionDate = new Date('2023-11-15');
      expect(calculateDateScore(transactionDate, dueDate)).toBe(DATE_SCORES.FAR_PENALTY);
    });
  });
});

