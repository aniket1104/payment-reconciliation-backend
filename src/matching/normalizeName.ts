/**
 * Name Normalization for Payment Reconciliation
 *
 * Bank descriptions often contain noise that interferes with matching.
 * This module normalizes strings to improve comparison accuracy.
 *
 * Example transformations:
 * - "PAYMENT FROM ACME CORP" → "ACME CORP"
 * - "CHK DEP SMITH JOHN" → "SMITH JOHN"
 * - "ACH PMT - Global Logistics Ltd." → "GLOBAL LOGISTICS LTD"
 */

import { NOISE_WORDS } from './constants';

/**
 * Normalizes a string for comparison by:
 * 1. Converting to uppercase for case-insensitive matching
 * 2. Removing punctuation and special characters
 * 3. Removing common noise words (PAYMENT, CHK, ACH, etc.)
 * 4. Collapsing multiple spaces into single spaces
 * 5. Trimming leading/trailing whitespace
 *
 * @param input - Raw string from bank description or customer name
 * @returns Normalized string suitable for comparison
 *
 * @example
 * normalizeName("SMITH JOHN CHK DEP") // Returns: "SMITH JOHN"
 * normalizeName("Payment from Acme Corp.") // Returns: "ACME CORP"
 * normalizeName("ACH-TRANSFER-REF#12345") // Returns: "12345"
 */
export function normalizeName(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Step 1: Convert to uppercase for case-insensitive comparison
  let normalized = input.toUpperCase();

  // Step 2: Remove punctuation and special characters
  // Keep only letters, numbers, and spaces
  normalized = normalized.replace(/[^A-Z0-9\s]/g, ' ');

  // Step 3: Split into words and filter out noise words
  const words = normalized.split(/\s+/).filter((word) => {
    // Remove empty strings
    if (!word) return false;

    // Remove noise words
    if (NOISE_WORDS.has(word)) return false;

    // Keep the word
    return true;
  });

  // Step 4 & 5: Join with single spaces (automatically collapses multiple spaces)
  // and trim is implicit since we filtered empty strings
  return words.join(' ');
}

/**
 * Extracts potential reference numbers from a bank description.
 * Reference numbers often help identify the specific invoice.
 *
 * @param description - Raw bank description
 * @returns Array of potential reference numbers found
 *
 * @example
 * extractReferenceNumbers("ACH PMT REF INV-2024-001") // Returns: ["INV-2024-001"]
 */
export function extractReferenceNumbers(description: string): string[] {
  if (!description) return [];

  const references: string[] = [];

  // Pattern for invoice numbers (INV-XXXX-XXX format)
  const invoicePattern = /INV[-\s]?\d{4}[-\s]?\d{1,4}/gi;
  const invoiceMatches = description.match(invoicePattern);
  if (invoiceMatches) {
    references.push(...invoiceMatches.map((m) => m.toUpperCase().replace(/\s/g, '-')));
  }

  // Pattern for generic reference numbers (REF followed by alphanumeric)
  const refPattern = /REF[:#\s]*([A-Z0-9]{4,})/gi;
  let match;
  while ((match = refPattern.exec(description)) !== null) {
    references.push(match[1].toUpperCase());
  }

  return references;
}

export default normalizeName;
