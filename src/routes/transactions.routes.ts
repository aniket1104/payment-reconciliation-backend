/**
 * Transaction Admin API Routes
 *
 * Endpoints for admin actions on bank transactions.
 * These routes handle HTTP concerns and validation.
 * Business logic is delegated to the transaction service.
 *
 * IMPORTANT: All actions are audited. Every state change creates
 * an immutable MatchAuditLog entry.
 *
 * Endpoints:
 * - POST /:id/confirm - Confirm a system-suggested match
 * - POST /:id/reject - Reject a system-suggested match
 * - POST /:id/match - Manually match to a specific invoice
 * - POST /:id/external - Mark as external (no invoice exists)
 * - POST /bulk-confirm - Bulk confirm AUTO_MATCHED in a batch
 * - GET /:id - Get transaction details with audit history
 * - GET /:id/audit - Get audit history for a transaction
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sendSuccess, AppError } from '../utils';
import {
  confirmMatch,
  rejectMatch,
  manualMatch,
  markExternal,
  bulkConfirmAutoMatched,
  getTransactionWithInvoice,
} from '../services/transaction.service';
import { getAuditLogsForTransaction } from '../services/audit.service';

const router = Router();

// ============================================
// Validation Helpers
// ============================================

/**
 * Validates UUID format (basic check)
 */
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Validates and extracts transaction ID from request params
 */
function getTransactionId(req: Request): string {
  const { id } = req.params;

  if (!id || !isValidUUID(id)) {
    throw AppError.badRequest('Invalid transaction ID format');
  }

  return id;
}

// ============================================
// Admin Action Routes
// ============================================

/**
 * @route   POST /api/transactions/:id/confirm
 * @desc    Confirm a system-suggested match
 * @access  Admin
 *
 * Rules:
 * - Allowed only if status is AUTO_MATCHED or NEEDS_REVIEW
 * - Sets status to CONFIRMED
 * - Keeps matched_invoice_id unchanged
 *
 * Response:
 * - 200 OK: { transaction, auditLogId }
 * - 400 Bad Request: Invalid state transition
 * - 404 Not Found: Transaction not found
 */
router.post(
  '/:id/confirm',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const transactionId = getTransactionId(req);

    // In a real app, performedBy would come from auth middleware
    const performedBy = req.body.performedBy || 'admin';

    const result = await confirmMatch(transactionId, performedBy);

    sendSuccess(
      res,
      {
        transaction: result.transaction,
        auditLogId: result.auditLogId,
      },
      'Match confirmed successfully'
    );
  })
);

/**
 * @route   POST /api/transactions/:id/reject
 * @desc    Reject a system-suggested match
 * @access  Admin
 *
 * Request body (optional):
 * - reason: string - Reason for rejection
 *
 * Rules:
 * - Allowed only if status is AUTO_MATCHED or NEEDS_REVIEW
 * - Sets status to UNMATCHED
 * - Clears matched_invoice_id
 *
 * Response:
 * - 200 OK: { transaction, auditLogId }
 * - 400 Bad Request: Invalid state transition
 * - 404 Not Found: Transaction not found
 */
router.post(
  '/:id/reject',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const transactionId = getTransactionId(req);
    const { reason, performedBy = 'admin' } = req.body;

    const result = await rejectMatch(transactionId, performedBy, reason);

    sendSuccess(
      res,
      {
        transaction: result.transaction,
        auditLogId: result.auditLogId,
      },
      'Match rejected successfully'
    );
  })
);

/**
 * @route   POST /api/transactions/:id/match
 * @desc    Manually match a transaction to a specific invoice
 * @access  Admin
 *
 * Request body:
 * - invoiceId: string (required) - UUID of the invoice to match
 * - reason: string (optional) - Reason for manual match
 *
 * Rules:
 * - Allowed only if status is NEEDS_REVIEW or UNMATCHED
 * - Sets matched_invoice_id to the provided invoice
 * - Sets status to CONFIRMED
 *
 * Response:
 * - 200 OK: { transaction, auditLogId }
 * - 400 Bad Request: Invalid state transition or invoice not found
 * - 404 Not Found: Transaction not found
 */
router.post(
  '/:id/match',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const transactionId = getTransactionId(req);
    const { invoiceId, reason, performedBy = 'admin' } = req.body;

    // Validate invoiceId is provided
    if (!invoiceId) {
      throw AppError.badRequest('invoiceId is required for manual match');
    }

    // Validate invoiceId format
    if (!isValidUUID(invoiceId)) {
      throw AppError.badRequest('Invalid invoiceId format');
    }

    const result = await manualMatch(transactionId, invoiceId, performedBy, reason);

    sendSuccess(
      res,
      {
        transaction: result.transaction,
        auditLogId: result.auditLogId,
      },
      'Manual match completed successfully'
    );
  })
);

/**
 * @route   POST /api/transactions/:id/external
 * @desc    Mark a transaction as external (no invoice in system)
 * @access  Admin
 *
 * Request body (optional):
 * - reason: string - Reason for marking as external
 *
 * Rules:
 * - Allowed only if status is UNMATCHED
 * - Sets status to EXTERNAL
 * - Clears matched_invoice_id
 *
 * Response:
 * - 200 OK: { transaction, auditLogId }
 * - 400 Bad Request: Invalid state transition
 * - 404 Not Found: Transaction not found
 */
router.post(
  '/:id/external',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const transactionId = getTransactionId(req);
    const { reason, performedBy = 'admin' } = req.body;

    const result = await markExternal(transactionId, performedBy, reason);

    sendSuccess(
      res,
      {
        transaction: result.transaction,
        auditLogId: result.auditLogId,
      },
      'Transaction marked as external successfully'
    );
  })
);

/**
 * @route   POST /api/transactions/bulk-confirm
 * @desc    Bulk confirm all AUTO_MATCHED transactions in a batch
 * @access  Admin
 *
 * Request body:
 * - batchId: string (required) - UUID of the reconciliation batch
 *
 * Rules:
 * - Only transactions with status AUTO_MATCHED are affected
 * - Each transaction gets its own audit log entry
 *
 * Response:
 * - 200 OK: { confirmedCount, transactionIds }
 * - 404 Not Found: Batch not found
 */
router.post(
  '/bulk-confirm',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { batchId, performedBy = 'admin' } = req.body;

    // Validate batchId is provided
    if (!batchId) {
      throw AppError.badRequest('batchId is required for bulk confirm');
    }

    // Validate batchId format
    if (!isValidUUID(batchId)) {
      throw AppError.badRequest('Invalid batchId format');
    }

    const result = await bulkConfirmAutoMatched(batchId, performedBy);

    sendSuccess(
      res,
      {
        confirmedCount: result.confirmedCount,
        transactionIds: result.transactionIds,
      },
      `Successfully confirmed ${result.confirmedCount} transactions`
    );
  })
);

// ============================================
// Query Routes
// ============================================

/**
 * @route   GET /api/transactions/:id
 * @desc    Get transaction details with matched invoice and audit history
 * @access  Admin
 *
 * Response:
 * - 200 OK: { transaction with invoice and audit logs }
 * - 404 Not Found: Transaction not found
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const transactionId = getTransactionId(req);

    const transaction = await getTransactionWithInvoice(transactionId);

    if (!transaction) {
      throw AppError.notFound('Transaction not found');
    }

    sendSuccess(res, transaction, 'Transaction retrieved successfully');
  })
);

/**
 * @route   GET /api/transactions/:id/audit
 * @desc    Get audit history for a transaction
 * @access  Admin
 *
 * Response:
 * - 200 OK: { auditLogs: [] }
 */
router.get(
  '/:id/audit',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const transactionId = getTransactionId(req);

    const auditLogs = await getAuditLogsForTransaction(transactionId);

    sendSuccess(
      res,
      { auditLogs },
      `Retrieved ${auditLogs.length} audit log entries`
    );
  })
);

export default router;

