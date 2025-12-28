/**
 * Invoice Search Service for Payment Reconciliation Engine
 *
 * Provides fast invoice search for manual matching workflows.
 *
 * PERFORMANCE REQUIREMENTS:
 * - Search must return results in <200ms
 * - Must use indexed columns efficiently
 * - Must scale to thousands of invoices
 *
 * SEARCH STRATEGY:
 * 1. Amount filter applied FIRST (most selective, indexed)
 * 2. Status filter (indexed)
 * 3. Customer name search (ILIKE, partial match)
 * 4. Exclude paid invoices by default
 * 5. Order by due_date ASC (closest due date first)
 */

import { Prisma, InvoiceStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';

// ============================================
// Types
// ============================================

/**
 * Invoice search parameters
 */
export interface InvoiceSearchParams {
  /** Customer name search (case-insensitive partial match) */
  q?: string;
  /** Exact amount match (with small tolerance for decimals) */
  amount?: number;
  /** Filter by invoice status(es) */
  status?: InvoiceStatus[];
  /** Include paid invoices (default: false) */
  includePaid?: boolean;
  /** Maximum results to return */
  limit?: number;
}

/**
 * Invoice search result
 */
export interface InvoiceSearchResult {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  amount: Prisma.Decimal;
  status: InvoiceStatus;
  dueDate: Date;
  paidAt: Date | null;
  createdAt: Date;
}

/**
 * Search response with metadata
 */
export interface InvoiceSearchResponse {
  invoices: InvoiceSearchResult[];
  count: number;
  searchParams: {
    q?: string;
    amount?: number;
    status?: string[];
    limit: number;
  };
}

// ============================================
// Configuration
// ============================================

/**
 * Default search result limit
 */
const DEFAULT_SEARCH_LIMIT = 20;

/**
 * Maximum search result limit
 */
const MAX_SEARCH_LIMIT = 50;

/**
 * Amount tolerance for matching (± $0.01)
 */
const AMOUNT_TOLERANCE = 0.01;

// ============================================
// Search Implementation
// ============================================

/**
 * Searches invoices with optimized query strategy
 *
 * Query optimization:
 * - Uses indexed columns (amount, status, due_date)
 * - Applies most selective filters first
 * - Case-insensitive name search with ILIKE
 * - Limits results for fast response
 *
 * @param params - Search parameters
 * @returns Search results with metadata
 */
export async function searchInvoices(params: InvoiceSearchParams): Promise<InvoiceSearchResponse> {
  // Validate and set defaults
  const limit = Math.min(Math.max(1, params.limit || DEFAULT_SEARCH_LIMIT), MAX_SEARCH_LIMIT);

  // Build WHERE clause
  const where: Prisma.InvoiceWhereInput = {};

  // 1. Amount filter (MOST SELECTIVE - apply first in indexed query)
  if (params.amount !== undefined && params.amount !== null) {
    const minAmount = new Prisma.Decimal(params.amount - AMOUNT_TOLERANCE);
    const maxAmount = new Prisma.Decimal(params.amount + AMOUNT_TOLERANCE);

    where.amount = {
      gte: minAmount,
      lte: maxAmount,
    };
  }

  // 2. Status filter (INDEXED)
  if (params.status && params.status.length > 0) {
    where.status = { in: params.status };
  } else if (!params.includePaid) {
    // Default: exclude paid invoices
    where.status = { not: 'paid' };
  }

  // 3. Customer name search (ILIKE for case-insensitive partial match)
  if (params.q && params.q.trim().length > 0) {
    const searchTerm = params.q.trim();

    // Use contains with mode: 'insensitive' for ILIKE
    where.customerName = {
      contains: searchTerm,
      mode: 'insensitive',
    };
  }

  // Execute optimized query
  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: [
      // Order by due date (closest first for urgency)
      { dueDate: 'asc' },
      // Then by creation date (newest first)
      { createdAt: 'desc' },
    ],
    take: limit,
    select: {
      id: true,
      invoiceNumber: true,
      customerName: true,
      customerEmail: true,
      amount: true,
      status: true,
      dueDate: true,
      paidAt: true,
      createdAt: true,
    },
  });

  return {
    invoices,
    count: invoices.length,
    searchParams: {
      q: params.q,
      amount: params.amount,
      status: params.status,
      limit,
    },
  };
}

/**
 * Gets an invoice by ID for manual matching
 *
 * @param invoiceId - UUID of the invoice
 * @returns Invoice or null if not found
 */
export async function getInvoiceById(invoiceId: string): Promise<InvoiceSearchResult | null> {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      customerName: true,
      customerEmail: true,
      amount: true,
      status: true,
      dueDate: true,
      paidAt: true,
      createdAt: true,
    },
  });
}

/**
 * Gets invoices by invoice number (for reference lookup)
 *
 * @param invoiceNumber - Invoice number to search
 * @returns Matching invoices
 */
export async function getInvoiceByNumber(
  invoiceNumber: string
): Promise<InvoiceSearchResult | null> {
  return prisma.invoice.findUnique({
    where: { invoiceNumber },
    select: {
      id: true,
      invoiceNumber: true,
      customerName: true,
      customerEmail: true,
      amount: true,
      status: true,
      dueDate: true,
      paidAt: true,
      createdAt: true,
    },
  });
}

/**
 * Gets candidate invoices for a specific amount (for matching suggestions)
 *
 * Excludes paid invoices and orders by due date.
 *
 * @param amount - Amount to match
 * @param limit - Maximum results
 * @returns Matching invoices
 */
export async function getInvoiceCandidatesForAmount(
  amount: number,
  limit: number = 10
): Promise<InvoiceSearchResult[]> {
  const minAmount = new Prisma.Decimal(amount - AMOUNT_TOLERANCE);
  const maxAmount = new Prisma.Decimal(amount + AMOUNT_TOLERANCE);

  return prisma.invoice.findMany({
    where: {
      amount: {
        gte: minAmount,
        lte: maxAmount,
      },
      status: { not: 'paid' },
    },
    orderBy: { dueDate: 'asc' },
    take: limit,
    select: {
      id: true,
      invoiceNumber: true,
      customerName: true,
      customerEmail: true,
      amount: true,
      status: true,
      dueDate: true,
      paidAt: true,
      createdAt: true,
    },
  });
}

// ============================================
// Exports
// ============================================

export { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT };

export const invoiceSearchService = {
  searchInvoices,
  getInvoiceById,
  getInvoiceByNumber,
  getInvoiceCandidatesForAmount,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
};

export default invoiceSearchService;
