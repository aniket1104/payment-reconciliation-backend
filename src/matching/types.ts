/**
 * Type Definitions for Payment Reconciliation Matching Engine
 *
 * These types define the input/output contracts for the matching engine.
 * The engine is pure and deterministic - no database or external dependencies.
 */

// ============================================
// INPUT TYPES
// ============================================

/**
 * Represents a bank transaction from a CSV upload.
 * This is the raw input that needs to be matched against invoices.
 */
export interface BankTransactionInput {
  /** Date the transaction occurred */
  transactionDate: Date;
  /** Description from bank statement (may contain customer name, reference, noise) */
  description: string;
  /** Transaction amount (already filtered to match invoice amounts) */
  amount: number;
}

/**
 * Represents a candidate invoice for matching.
 * These are pre-filtered invoices that have matching amounts and are unpaid.
 */
export interface InvoiceInput {
  /** Unique identifier for the invoice */
  id: string;
  /** Invoice number (e.g., "INV-2024-001") */
  invoiceNumber: string;
  /** Customer name to match against bank description */
  customerName: string;
  /** Invoice due date for proximity scoring */
  dueDate: Date;
}

// ============================================
// OUTPUT TYPES
// ============================================

/**
 * Match status determined by the matching engine.
 *
 * IMPORTANT: The engine only returns these three statuses.
 * CONFIRMED and EXTERNAL are applied later by admin actions.
 */
export type MatchStatus = 'AUTO_MATCHED' | 'NEEDS_REVIEW' | 'UNMATCHED';

/**
 * Detailed breakdown of how the confidence score was calculated.
 * This provides transparency and explainability for the matching decision.
 */
export interface ConfidenceBreakdown {
  /** Raw Jaro-Winkler similarity score (0-100) */
  rawNameSimilarity: number;
  /** Name similarity weighted by 0.7 factor */
  weightedNameScore: number;
  /** Date proximity score (-10 to +15) */
  dateScore: number;
  /** Penalty for multiple candidates (0, -10, or -20) */
  ambiguityPenalty: number;
  /** Final confidence score before clamping */
  rawTotal: number;
}

/**
 * Complete result of matching a bank transaction to invoices.
 */
export interface MatchResult {
  /** ID of the matched invoice (undefined if UNMATCHED) */
  matchedInvoiceId?: string;
  /** Invoice number of matched invoice (for reference) */
  matchedInvoiceNumber?: string;
  /** Final confidence score (0-100) */
  confidenceScore: number;
  /** Categorized match status based on confidence thresholds */
  status: MatchStatus;
  /** Detailed information about how the match was determined */
  matchDetails: {
    /** How the confidence score was calculated */
    breakdown: ConfidenceBreakdown;
    /** Normalized bank description used for matching */
    normalizedDescription: string;
    /** Normalized customer name of best match */
    normalizedCustomerName?: string;
    /** Number of candidate invoices considered */
    candidateCount: number;
    /** Human-readable explanation of the decision */
    explanation: string;
  };
}

// ============================================
// INTERNAL TYPES
// ============================================

/**
 * Internal type for tracking candidate scores during matching.
 */
export interface CandidateScore {
  invoice: InvoiceInput;
  normalizedName: string;
  nameSimilarity: number;
  dateScore: number;
  preliminaryScore: number;
}

/**
 * Parameters for the confidence calculator function.
 */
export interface ConfidenceParams {
  nameSimilarity: number;
  dateScore: number;
  candidateCount: number;
}

