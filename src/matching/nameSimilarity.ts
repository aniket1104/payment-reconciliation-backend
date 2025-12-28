/**
 * Name Similarity Calculator for Payment Reconciliation
 *
 * Uses Jaro-Winkler similarity algorithm which is particularly good for:
 * - Short strings (names)
 * - Typos and minor variations
 * - Prefix matching (important for company names)
 *
 * The algorithm gives higher scores when:
 * - Strings share a common prefix
 * - Characters are in similar positions
 * - There are fewer transpositions
 */

import natural from 'natural';

/**
 * Calculates the similarity between two normalized strings using Jaro-Winkler.
 *
 * Jaro-Winkler is preferred over Levenshtein for name matching because:
 * 1. It handles transpositions better (JOHN SMITH vs SMITH JOHN)
 * 2. It gives bonus weight to common prefixes
 * 3. It's normalized to 0-1 range naturally
 *
 * @param a - First normalized string
 * @param b - Second normalized string
 * @returns Similarity score from 0 to 100
 *
 * @example
 * calculateNameSimilarity("ACME CORP", "ACME CORPORATION") // ~87
 * calculateNameSimilarity("SMITH JOHN", "JOHN SMITH") // ~83
 * calculateNameSimilarity("ABC", "XYZ") // ~0
 */
export function calculateNameSimilarity(a: string, b: string): number {
  // Handle edge cases
  if (!a || !b) {
    return 0;
  }

  // Exact match
  if (a === b) {
    return 100;
  }

  // Calculate Jaro-Winkler similarity (returns 0-1)
  const similarity = natural.JaroWinklerDistance(a, b);

  // Convert to 0-100 scale and round to 2 decimal places
  return Math.round(similarity * 100 * 100) / 100;
}

/**
 * Calculates similarity with word-order independence.
 * This helps match "JOHN SMITH" with "SMITH JOHN".
 *
 * Strategy:
 * 1. Calculate direct Jaro-Winkler similarity
 * 2. Sort words alphabetically and calculate again
 * 3. Return the higher score
 *
 * @param a - First normalized string
 * @param b - Second normalized string
 * @returns Similarity score from 0 to 100
 */
export function calculateNameSimilarityOrderIndependent(a: string, b: string): number {
  // Handle edge cases
  if (!a || !b) {
    return 0;
  }

  // Direct comparison
  const directSimilarity = calculateNameSimilarity(a, b);

  // Word-order independent comparison
  const wordsA = a.split(' ').sort().join(' ');
  const wordsB = b.split(' ').sort().join(' ');
  const sortedSimilarity = calculateNameSimilarity(wordsA, wordsB);

  // Return the higher of the two scores
  return Math.max(directSimilarity, sortedSimilarity);
}

export default calculateNameSimilarity;

