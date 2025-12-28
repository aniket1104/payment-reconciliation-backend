/**
 * Date Proximity Scoring for Payment Reconciliation
 *
 * Payments typically arrive close to their due date.
 * This module scores how close a transaction date is to an invoice due date.
 *
 * Scoring logic:
 * - Very close (≤3 days): +15 points - Payment arrived on time
 * - Close (≤7 days): +10 points - Payment arrived within a week
 * - Moderate (≤15 days): +5 points - Payment arrived within two weeks
 * - Neutral (≤30 days): 0 points - No bonus or penalty
 * - Far (>30 days): -10 points - Unlikely to be related
 */

import { DATE_PROXIMITY, DATE_SCORES } from './constants';

/**
 * Calculates the number of days between two dates.
 * Returns absolute value (always positive).
 *
 * @param date1 - First date
 * @param date2 - Second date
 * @returns Number of days between the dates (absolute)
 */
export function daysBetween(date1: Date, date2: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  // Convert to UTC to avoid timezone issues
  const utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());

  return Math.abs(Math.floor((utc2 - utc1) / MS_PER_DAY));
}

/**
 * Calculates a score based on how close a transaction date is to a due date.
 *
 * The scoring reflects the likelihood that a payment is related to an invoice:
 * - Payments close to the due date are more likely matches
 * - Payments far from the due date may be for different invoices
 *
 * @param transactionDate - Date the bank transaction occurred
 * @param dueDate - Due date of the invoice
 * @returns Score from -10 to +15
 *
 * @example
 * // Transaction 2 days before due date
 * calculateDateScore(new Date('2024-01-13'), new Date('2024-01-15')) // Returns: 15
 *
 * // Transaction 10 days after due date
 * calculateDateScore(new Date('2024-01-25'), new Date('2024-01-15')) // Returns: 5
 *
 * // Transaction 45 days from due date
 * calculateDateScore(new Date('2024-03-01'), new Date('2024-01-15')) // Returns: -10
 */
export function calculateDateScore(transactionDate: Date, dueDate: Date): number {
  const difference = daysBetween(transactionDate, dueDate);

  // Very close: within 3 days
  if (difference <= DATE_PROXIMITY.VERY_CLOSE) {
    return DATE_SCORES.VERY_CLOSE;
  }

  // Close: within 7 days
  if (difference <= DATE_PROXIMITY.CLOSE) {
    return DATE_SCORES.CLOSE;
  }

  // Moderate: within 15 days
  if (difference <= DATE_PROXIMITY.MODERATE) {
    return DATE_SCORES.MODERATE;
  }

  // Far: more than 30 days - apply penalty
  if (difference > DATE_PROXIMITY.FAR) {
    return DATE_SCORES.FAR_PENALTY;
  }

  // Neutral: between 15 and 30 days
  return DATE_SCORES.NEUTRAL;
}

export default calculateDateScore;

