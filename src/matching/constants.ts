/**
 * Constants for Payment Reconciliation Matching Engine
 *
 * These values define the behavior of the matching algorithm.
 * They are tuned based on typical bank statement formats and
 * reconciliation requirements.
 */

// ============================================
// CONFIDENCE THRESHOLDS
// ============================================

/**
 * Minimum confidence score for automatic matching.
 * Transactions at or above this threshold are matched without human review.
 *
 * Formula: confidence = nameSimilarity + dateScore - ambiguityPenalty
 *
 * Examples (single candidate, no ambiguity penalty):
 * - 85% name + 10 date (close) = 95 → AUTO_MATCHED ✓
 * - 90% name + 5 date (moderate) = 95 → AUTO_MATCHED ✓
 * - 80% name + 15 date (very close) = 95 → AUTO_MATCHED ✓
 */
export const AUTO_MATCHED_THRESHOLD = 95;

/**
 * Minimum confidence score for flagging as "needs review".
 * Transactions between this and AUTO_MATCHED_THRESHOLD require human verification.
 * Below this threshold, transactions are marked as UNMATCHED.
 *
 * Examples:
 * - 75% name + 10 date = 85 → NEEDS_REVIEW
 * - 70% name + 0 date = 70 → NEEDS_REVIEW
 * - 60% name + 0 date = 60 → NEEDS_REVIEW (borderline)
 * - 55% name + 0 date = 55 → UNMATCHED
 */
export const NEEDS_REVIEW_THRESHOLD = 60;

// ============================================
// NOISE WORDS
// ============================================

/**
 * Common words found in bank descriptions that don't help identify the customer.
 * These are removed during normalization to improve matching accuracy.
 *
 * Examples of how these appear:
 * - "PAYMENT FROM ACME CORP" → remove "PAYMENT", "FROM"
 * - "ACH DEPOSIT REF 12345" → remove "ACH", "DEPOSIT", "REF"
 * - "CHK DEP SMITH JOHN" → remove "CHK", "DEP"
 */
export const NOISE_WORDS: ReadonlySet<string> = new Set([
  // Transaction types
  'PAYMENT',
  'DEPOSIT',
  'TRANSFER',
  'WITHDRAWAL',
  'CREDIT',
  'DEBIT',

  // Payment methods
  'CHK',
  'CHECK',
  'CHEQUE',
  'ACH',
  'WIRE',
  'EFT',

  // Online/Electronic
  'ONLINE',
  'ELECTRONIC',
  'EBANK',
  'INTERNET',
  'MOBILE',

  // Common abbreviations
  'PMT',
  'DEP',
  'TRF',
  'TXN',
  'REF',
  'POS',

  // Prepositions and articles (often noise in descriptions)
  'FROM',
  'TO',
  'FOR',
  'THE',
  'AND',

  // Bank-specific noise
  'PENDING',
  'CLEARED',
  'POSTED',
  'MEMO',
]);

// ============================================
// SCORING WEIGHTS
// ============================================

/**
 * Weight applied to name similarity score.
 * Name matching is the PRIMARY factor in determining a match.
 *
 * With weight of 1.0 (name similarity IS the base confidence):
 * - 100% name match = 100 points base
 * - 90% name match = 90 points base
 * - 80% name match = 80 points base
 * - 70% name match = 70 points base
 *
 * Date bonus/penalty then adjusts the final score.
 */
export const NAME_SIMILARITY_WEIGHT = 1.0;

// ============================================
// DATE PROXIMITY THRESHOLDS (in days)
// ============================================

/**
 * Date ranges for proximity scoring.
 * Payments typically arrive within a few days of the due date.
 */
export const DATE_PROXIMITY = {
  /** Very close to due date - highest bonus */
  VERY_CLOSE: 3,
  /** Close to due date - good bonus */
  CLOSE: 7,
  /** Moderately close - small bonus */
  MODERATE: 15,
  /** Too far from due date - penalty threshold */
  FAR: 30,
} as const;

/**
 * Scores for each date proximity range.
 */
export const DATE_SCORES = {
  VERY_CLOSE: 15,
  CLOSE: 10,
  MODERATE: 5,
  NEUTRAL: 0,
  FAR_PENALTY: -10,
} as const;

// ============================================
// AMBIGUITY PENALTIES
// ============================================

/**
 * Penalties applied when multiple candidates have similar scores.
 * More candidates = more uncertainty = lower confidence.
 */
export const AMBIGUITY_PENALTIES = {
  /** Single candidate - no ambiguity */
  SINGLE: 0,
  /** Two candidates - some ambiguity */
  TWO: 5,
  /** Three or more - significant ambiguity */
  MULTIPLE: 10,
} as const;
