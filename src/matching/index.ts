/**
 * Payment Reconciliation Matching Engine
 *
 * This module provides pure, deterministic functions for matching
 * bank transactions to invoices based on:
 * - Name similarity (Jaro-Winkler algorithm)
 * - Date proximity scoring
 * - Ambiguity penalties
 *
 * Usage:
 * ```typescript
 * import { matchTransaction } from './matching';
 *
 * const result = matchTransaction(transaction, candidateInvoices);
 * console.log(result.status); // 'AUTO_MATCHED' | 'NEEDS_REVIEW' | 'UNMATCHED'
 * ```
 */

// Main function
export { matchTransaction } from './matchTransaction';

// Individual scoring functions (for testing/debugging)
export { normalizeName, extractReferenceNumbers } from './normalizeName';
export {
  calculateNameSimilarity,
  calculateNameSimilarityOrderIndependent,
} from './nameSimilarity';
export { calculateDateScore, daysBetween } from './dateProximity';
export { calculateAmbiguityPenalty } from './ambiguityPenalty';
export { calculateConfidence, generateExplanation } from './confidenceCalculator';

// Constants
export {
  AUTO_MATCHED_THRESHOLD,
  NEEDS_REVIEW_THRESHOLD,
  NOISE_WORDS,
  NAME_SIMILARITY_WEIGHT,
  DATE_PROXIMITY,
  DATE_SCORES,
  AMBIGUITY_PENALTIES,
} from './constants';

// Types
export type {
  BankTransactionInput,
  InvoiceInput,
  MatchStatus,
  MatchResult,
  ConfidenceBreakdown,
  ConfidenceParams,
  CandidateScore,
} from './types';

