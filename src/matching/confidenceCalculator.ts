/**
 * Confidence Score Calculator for Payment Reconciliation
 *
 * Combines multiple signals into a single confidence score:
 * 1. Name similarity (100% weight - PRIMARY factor)
 * 2. Date proximity bonus/penalty (+15 to -10)
 * 3. Ambiguity penalty for multiple candidates (-5 to -10)
 *
 * Formula: confidence = nameSimilarity + dateScore - ambiguityPenalty
 *
 * Thresholds:
 * - AUTO_MATCHED: ≥95%
 * - NEEDS_REVIEW: 60-94%
 * - UNMATCHED: <60%
 *
 * Final score is clamped to 0-100 range.
 */

import { NAME_SIMILARITY_WEIGHT } from './constants';
import { calculateAmbiguityPenalty } from './ambiguityPenalty';
import type { ConfidenceParams, ConfidenceBreakdown } from './types';

/**
 * Calculates the final confidence score with detailed breakdown.
 *
 * Formula:
 *   confidence = nameSimilarity + dateScore - ambiguityPenalty
 *
 * The breakdown provides transparency for auditing and debugging.
 *
 * @param params - Input parameters for calculation
 * @returns Object containing final score and detailed breakdown
 *
 * @example
 * calculateConfidence({
 *   nameSimilarity: 85,
 *   dateScore: 10,
 *   candidateCount: 1
 * })
 * // Returns: { confidenceScore: 95, breakdown: { ... } } → AUTO_MATCHED
 */
export function calculateConfidence(params: ConfidenceParams): {
  confidenceScore: number;
  breakdown: ConfidenceBreakdown;
} {
  const { nameSimilarity, dateScore, candidateCount } = params;

  // Calculate weighted name score
  const weightedNameScore = nameSimilarity * NAME_SIMILARITY_WEIGHT;

  // Calculate ambiguity penalty
  const ambiguityPenalty = calculateAmbiguityPenalty(candidateCount);

  // Calculate raw total before clamping
  const rawTotal = weightedNameScore + dateScore - ambiguityPenalty;

  // Clamp to 0-100 range
  const confidenceScore = Math.max(0, Math.min(100, rawTotal));

  // Round to 2 decimal places for clean output
  const roundedScore = Math.round(confidenceScore * 100) / 100;

  // Build detailed breakdown for transparency
  const breakdown: ConfidenceBreakdown = {
    rawNameSimilarity: Math.round(nameSimilarity * 100) / 100,
    weightedNameScore: Math.round(weightedNameScore * 100) / 100,
    dateScore,
    ambiguityPenalty,
    rawTotal: Math.round(rawTotal * 100) / 100,
  };

  return {
    confidenceScore: roundedScore,
    breakdown,
  };
}

/**
 * Generates a human-readable explanation of the confidence calculation.
 *
 * @param breakdown - The confidence breakdown details
 * @param status - The resulting match status
 * @returns Human-readable explanation string
 */
export function generateExplanation(breakdown: ConfidenceBreakdown, status: string): string {
  const parts: string[] = [];

  // Name similarity explanation
  parts.push(
    `Name similarity: ${breakdown.rawNameSimilarity}% (weighted: ${breakdown.weightedNameScore})`
  );

  // Date score explanation
  if (breakdown.dateScore > 0) {
    parts.push(`Date proximity bonus: +${breakdown.dateScore}`);
  } else if (breakdown.dateScore < 0) {
    parts.push(`Date proximity penalty: ${breakdown.dateScore}`);
  } else {
    parts.push('Date proximity: neutral (0)');
  }

  // Ambiguity explanation
  if (breakdown.ambiguityPenalty > 0) {
    parts.push(`Ambiguity penalty: -${breakdown.ambiguityPenalty}`);
  }

  // Final result
  parts.push(`Final score: ${breakdown.rawTotal} → Status: ${status}`);

  return parts.join('. ');
}

export default calculateConfidence;
