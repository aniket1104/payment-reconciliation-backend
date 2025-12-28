/**
 * Main Transaction Matching Function for Payment Reconciliation
 *
 * This is the entry point for the matching engine.
 * It orchestrates all the matching logic and returns a complete result.
 *
 * Flow:
 * 1. Handle empty candidates (UNMATCHED)
 * 2. Normalize transaction description
 * 3. Score each candidate invoice
 * 4. Select best candidate
 * 5. Apply ambiguity penalty
 * 6. Determine match status
 * 7. Return detailed result
 */

import { normalizeName } from './normalizeName';
import { calculateNameSimilarityOrderIndependent } from './nameSimilarity';
import { calculateDateScore } from './dateProximity';
import { calculateConfidence, generateExplanation } from './confidenceCalculator';
import { AUTO_MATCHED_THRESHOLD, NEEDS_REVIEW_THRESHOLD } from './constants';
import type {
  BankTransactionInput,
  InvoiceInput,
  MatchResult,
  MatchStatus,
  CandidateScore,
} from './types';

/**
 * Determines the match status based on confidence score.
 *
 * @param confidenceScore - The calculated confidence (0-100)
 * @returns The appropriate match status
 */
function determineStatus(confidenceScore: number): MatchStatus {
  if (confidenceScore >= AUTO_MATCHED_THRESHOLD) {
    return 'AUTO_MATCHED';
  }
  if (confidenceScore >= NEEDS_REVIEW_THRESHOLD) {
    return 'NEEDS_REVIEW';
  }
  return 'UNMATCHED';
}

/**
 * Scores a single candidate invoice against the transaction.
 *
 * @param normalizedDescription - Normalized bank description
 * @param transactionDate - Date of the transaction
 * @param invoice - Candidate invoice to score
 * @returns Candidate score object
 */
function scoreCandidate(
  normalizedDescription: string,
  transactionDate: Date,
  invoice: InvoiceInput
): CandidateScore {
  // Normalize the customer name
  const normalizedName = normalizeName(invoice.customerName);

  // Calculate name similarity (order-independent for "JOHN SMITH" vs "SMITH JOHN")
  const nameSimilarity = calculateNameSimilarityOrderIndependent(
    normalizedDescription,
    normalizedName
  );

  // Calculate date proximity score
  const dateScore = calculateDateScore(transactionDate, invoice.dueDate);

  // Preliminary score (before ambiguity penalty)
  const preliminaryScore = nameSimilarity * 0.7 + dateScore;

  return {
    invoice,
    normalizedName,
    nameSimilarity,
    dateScore,
    preliminaryScore,
  };
}

/**
 * Matches a bank transaction against a list of candidate invoices.
 *
 * This function is pure and deterministic - given the same inputs,
 * it will always return the same output.
 *
 * @param transaction - The bank transaction to match
 * @param candidates - List of candidate invoices (pre-filtered by amount)
 * @returns Complete match result with confidence and details
 *
 * @example
 * const result = matchTransaction(
 *   {
 *     transactionDate: new Date('2024-01-10'),
 *     description: 'PAYMENT FROM ACME CORP',
 *     amount: 1500.00
 *   },
 *   [
 *     { id: '1', invoiceNumber: 'INV-001', customerName: 'Acme Corporation', dueDate: new Date('2024-01-15') }
 *   ]
 * );
 * // Returns: { status: 'AUTO_MATCHED', confidenceScore: 98.5, ... }
 */
export function matchTransaction(
  transaction: BankTransactionInput,
  candidates: InvoiceInput[]
): MatchResult {
  // Normalize the transaction description once
  const normalizedDescription = normalizeName(transaction.description);

  // ============================================
  // Case 1: No candidates - UNMATCHED
  // ============================================
  if (!candidates || candidates.length === 0) {
    return {
      matchedInvoiceId: undefined,
      matchedInvoiceNumber: undefined,
      confidenceScore: 0,
      status: 'UNMATCHED',
      matchDetails: {
        breakdown: {
          rawNameSimilarity: 0,
          weightedNameScore: 0,
          dateScore: 0,
          ambiguityPenalty: 0,
          rawTotal: 0,
        },
        normalizedDescription,
        normalizedCustomerName: undefined,
        candidateCount: 0,
        explanation: 'No candidate invoices found with matching amount.',
      },
    };
  }

  // ============================================
  // Score all candidates
  // ============================================
  const scoredCandidates: CandidateScore[] = candidates.map((invoice) =>
    scoreCandidate(normalizedDescription, transaction.transactionDate, invoice)
  );

  // ============================================
  // Select best candidate (highest preliminary score)
  // ============================================
  const bestCandidate = scoredCandidates.reduce((best, current) =>
    current.preliminaryScore > best.preliminaryScore ? current : best
  );

  // ============================================
  // Calculate final confidence with ambiguity penalty
  // ============================================
  const { confidenceScore, breakdown } = calculateConfidence({
    nameSimilarity: bestCandidate.nameSimilarity,
    dateScore: bestCandidate.dateScore,
    candidateCount: candidates.length,
  });

  // ============================================
  // Determine match status
  // ============================================
  const status = determineStatus(confidenceScore);

  // ============================================
  // Generate explanation
  // ============================================
  const explanation = generateExplanation(breakdown, status);

  // ============================================
  // Build and return result
  // ============================================

  // For UNMATCHED status, don't return a matched invoice
  if (status === 'UNMATCHED') {
    return {
      matchedInvoiceId: undefined,
      matchedInvoiceNumber: undefined,
      confidenceScore,
      status,
      matchDetails: {
        breakdown,
        normalizedDescription,
        normalizedCustomerName: bestCandidate.normalizedName,
        candidateCount: candidates.length,
        explanation: `${explanation}. Best candidate score too low to suggest a match.`,
      },
    };
  }

  // For AUTO_MATCHED or NEEDS_REVIEW, return the best match
  return {
    matchedInvoiceId: bestCandidate.invoice.id,
    matchedInvoiceNumber: bestCandidate.invoice.invoiceNumber,
    confidenceScore,
    status,
    matchDetails: {
      breakdown,
      normalizedDescription,
      normalizedCustomerName: bestCandidate.normalizedName,
      candidateCount: candidates.length,
      explanation,
    },
  };
}

export default matchTransaction;

