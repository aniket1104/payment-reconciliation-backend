/**
 * Invoice API Routes
 *
 * Endpoints for invoice search and retrieval.
 * Designed for fast lookup during manual matching workflows.
 *
 * PERFORMANCE REQUIREMENTS:
 * - Search must return results in <200ms
 * - Uses indexed columns efficiently
 * - Scales to thousands of invoices
 *
 * Endpoints:
 * - GET /search - Search invoices for manual matching
 * - GET /:id - Get invoice by ID
 * - GET /by-number/:invoiceNumber - Get invoice by invoice number
 * - GET /candidates - Get invoice candidates for an amount
 */

import { Router, Request, Response } from 'express';
import { InvoiceStatus } from '@prisma/client';
import { asyncHandler, sendSuccess, AppError } from '../utils';
import {
  searchInvoices,
  getInvoiceById,
  getInvoiceByNumber,
  getInvoiceCandidatesForAmount,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
} from '../services/invoiceSearch.service';

const router = Router();

// ============================================
// Validation Helpers
// ============================================

/**
 * Valid invoice statuses for filtering
 */
const VALID_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue'];

/**
 * Validates UUID format (basic check)
 */
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Parses and validates status filter
 *
 * @param statusParam - Status query parameter (can be comma-separated)
 * @returns Array of valid statuses or undefined
 */
function parseStatusFilter(statusParam: string | undefined): InvoiceStatus[] | undefined {
  if (!statusParam) {
    return undefined;
  }

  const statuses = statusParam.split(',').map((s) => s.trim().toLowerCase());

  const validStatuses: InvoiceStatus[] = [];
  for (const status of statuses) {
    if (VALID_STATUSES.includes(status as InvoiceStatus)) {
      validStatuses.push(status as InvoiceStatus);
    }
  }

  return validStatuses.length > 0 ? validStatuses : undefined;
}

// ============================================
// Routes
// ============================================

/**
 * @route   GET /api/invoices/search
 * @desc    Search invoices for manual matching
 * @access  Admin
 *
 * Query params:
 * - q: string (optional, customer name search, case-insensitive partial match)
 * - amount: number (optional, exact amount match with ±$0.01 tolerance)
 * - status: string (optional, comma-separated: draft,sent,overdue)
 * - includePaid: boolean (optional, default: false)
 * - limit: number (optional, default: 20, max: 50)
 *
 * Response:
 * - 200 OK: { invoices: [], count: number, searchParams: {} }
 *
 * Performance:
 * - Must return results in <200ms
 * - Amount filter applied first (most selective, indexed)
 * - Ordered by due_date ASC (closest due date first)
 */
router.get(
  '/search',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const {
      q,
      amount: amountParam,
      status: statusParam,
      includePaid: includePaidParam,
      limit: limitParam,
    } = req.query;

    // Parse amount (if provided)
    let amount: number | undefined;
    if (amountParam) {
      amount = parseFloat(amountParam as string);
      if (isNaN(amount)) {
        throw AppError.badRequest('Invalid amount parameter. Must be a number.');
      }
    }

    // Parse status filter
    const status = parseStatusFilter(statusParam as string | undefined);

    // Parse includePaid flag
    const includePaid = includePaidParam === 'true';

    // Parse limit (clamp to max)
    let limit = DEFAULT_SEARCH_LIMIT;
    if (limitParam) {
      const parsed = parseInt(limitParam as string, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, MAX_SEARCH_LIMIT);
      }
    }

    // Execute search
    const result = await searchInvoices({
      q: q as string | undefined,
      amount,
      status,
      includePaid,
      limit,
    });

    sendSuccess(res, result, `Found ${result.count} invoices`);
  })
);

/**
 * @route   GET /api/invoices/candidates
 * @desc    Get invoice candidates for a specific amount (for matching suggestions)
 * @access  Admin
 *
 * Query params:
 * - amount: number (required)
 * - limit: number (optional, default: 10)
 *
 * Response:
 * - 200 OK: { invoices: [] }
 */
router.get(
  '/candidates',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { amount: amountParam, limit: limitParam } = req.query;

    // Validate amount is provided
    if (!amountParam) {
      throw AppError.badRequest('amount parameter is required');
    }

    const amount = parseFloat(amountParam as string);
    if (isNaN(amount)) {
      throw AppError.badRequest('Invalid amount parameter. Must be a number.');
    }

    // Parse limit
    let limit = 10;
    if (limitParam) {
      const parsed = parseInt(limitParam as string, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 50);
      }
    }

    const invoices = await getInvoiceCandidatesForAmount(amount, limit);

    sendSuccess(
      res,
      { invoices, count: invoices.length },
      `Found ${invoices.length} candidate invoices for amount $${amount.toFixed(2)}`
    );
  })
);

/**
 * @route   GET /api/invoices/by-number/:invoiceNumber
 * @desc    Get invoice by invoice number
 * @access  Admin
 *
 * Response:
 * - 200 OK: Invoice object
 * - 404 Not Found: Invoice not found
 */
router.get(
  '/by-number/:invoiceNumber',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { invoiceNumber } = req.params;

    if (!invoiceNumber || invoiceNumber.trim().length === 0) {
      throw AppError.badRequest('Invoice number is required');
    }

    const invoice = await getInvoiceByNumber(invoiceNumber);

    if (!invoice) {
      throw AppError.notFound(`Invoice not found: ${invoiceNumber}`);
    }

    sendSuccess(res, invoice, 'Invoice retrieved successfully');
  })
);

/**
 * @route   GET /api/invoices/:id
 * @desc    Get invoice by ID
 * @access  Admin
 *
 * Response:
 * - 200 OK: Invoice object
 * - 404 Not Found: Invoice not found
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    // Validate UUID format
    if (!id || !isValidUUID(id)) {
      throw AppError.badRequest('Invalid invoice ID format');
    }

    const invoice = await getInvoiceById(id);

    if (!invoice) {
      throw AppError.notFound('Invoice not found');
    }

    sendSuccess(res, invoice, 'Invoice retrieved successfully');
  })
);

export default router;
