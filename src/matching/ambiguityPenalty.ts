/**
 * Ambiguity Penalty for Payment Reconciliation
 *
 * When multiple invoices could match a transaction, confidence should decrease.
 * More candidates = more uncertainty about which is the correct match.
 *
 * Penalty structure:
 * - 1 candidate: No penalty (clear match)
 * - 2 candidates: -10 points (some ambiguity)
 * - 3+ candidates: -20 points (significant ambiguity)
 */

import { AMBIGUITY_PENALTIES } from './constants';

/**
 * Calculates a penalty based on the number of candidate invoices.
 *
 * The penalty reflects uncertainty when multiple invoices could match:
 * - Single candidate means high confidence in the match
 * - Multiple candidates means the system is less certain
 *
 * @param candidateCount - Number of candidate invoices to consider
 * @returns Penalty value (0, 10, or 20) to subtract from confidence
 *
 * @example
 * calculateAmbiguityPenalty(1) // Returns: 0
 * calculateAmbiguityPenalty(2) // Returns: 10
 * calculateAmbiguityPenalty(5) // Returns: 20
 */
export function calculateAmbiguityPenalty(candidateCount: number): number {
  // No candidates or invalid input
  if (candidateCount <= 0) {
    return 0;
  }

  // Single candidate - no ambiguity
  if (candidateCount === 1) {
    return AMBIGUITY_PENALTIES.SINGLE;
  }

  // Two candidates - some ambiguity
  if (candidateCount === 2) {
    return AMBIGUITY_PENALTIES.TWO;
  }

  // Three or more candidates - significant ambiguity
  return AMBIGUITY_PENALTIES.MULTIPLE;
}

export default calculateAmbiguityPenalty;

