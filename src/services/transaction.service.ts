/**
 * Transaction Service for Payment Reconciliation Engine
 *
 * Handles admin actions on bank transactions with proper state transitions.
 *
 * CRITICAL BUSINESS RULES:
 * - AUTO_MATCHED, NEEDS_REVIEW, UNMATCHED are SYSTEM outcomes (from matching engine)
 * - CONFIRMED and EXTERNAL are USER actions (admin decisions)
 * - Every state change MUST be atomic with audit logging
 * - Invalid state transitions must be rejected, not auto-corrected
 *
 * STATE TRANSITION RULES:
 * - confirm: AUTO_MATCHED | NEEDS_REVIEW → CONFIRMED
 * - reject: AUTO_MATCHED | NEEDS_REVIEW → UNMATCHED
 * - manual_match: NEEDS_REVIEW | UNMATCHED → CONFIRMED
 * - mark_external: UNMATCHED → EXTERNAL
 */

import { Prisma, BankTransactionStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { createAuditLog, createAuditLogsBatch, type AuditActionType } from './audit.service';
import { AppError } from '../utils';

// ============================================
// Types
// ============================================

/**
 * Bank transaction as returned from database
 */
export interface BankTransaction {
  id: string;
  uploadBatchId: string;
  transactionDate: Date;
  description: string;
  amount: Prisma.Decimal;
  referenceNumber: string | null;
  status: BankTransactionStatus;
  matchedInvoiceId: string | null;
  confidenceScore: Prisma.Decimal | null;
  matchDetails: Prisma.JsonValue;
  createdAt: Date;
}

/**
 * Result of an admin action
 */
export interface AdminActionResult {
  success: boolean;
  transaction: BankTransaction;
  auditLogId: string;
}

/**
 * Result of bulk confirm action
 */
export interface BulkConfirmResult {
  success: boolean;
  confirmedCount: number;
  transactionIds: string[];
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Valid statuses that allow confirm action
 */
const CONFIRMABLE_STATUSES: BankTransactionStatus[] = ['auto_matched', 'needs_review'];

/**
 * Valid statuses that allow reject action
 */
const REJECTABLE_STATUSES: BankTransactionStatus[] = ['auto_matched', 'needs_review'];

/**
 * Valid statuses that allow manual match action
 */
const MANUAL_MATCHABLE_STATUSES: BankTransactionStatus[] = ['needs_review', 'unmatched'];

/**
 * Valid statuses that allow mark external action
 */
const EXTERNAL_MARKABLE_STATUSES: BankTransactionStatus[] = ['unmatched'];

/**
 * Validates that a status transition is allowed
 */
function validateStatusTransition(
  currentStatus: BankTransactionStatus,
  allowedStatuses: BankTransactionStatus[],
  actionName: string
): void {
  if (!allowedStatuses.includes(currentStatus)) {
    throw AppError.badRequest(
      `Cannot ${actionName} transaction with status "${currentStatus}". ` +
        `Allowed statuses: ${allowedStatuses.join(', ')}`
    );
  }
}

// ============================================
// Transaction Retrieval
// ============================================

/**
 * Gets a bank transaction by ID
 *
 * @param transactionId - UUID of the transaction
 * @returns Transaction or null if not found
 */
export async function getTransaction(transactionId: string): Promise<BankTransaction | null> {
  return prisma.bankTransaction.findUnique({
    where: { id: transactionId },
  });
}

/**
 * Gets a bank transaction by ID, throwing 404 if not found
 */
async function getTransactionOrThrow(transactionId: string): Promise<BankTransaction> {
  const transaction = await getTransaction(transactionId);

  if (!transaction) {
    throw AppError.notFound(`Transaction not found: ${transactionId}`);
  }

  return transaction;
}

/**
 * Validates that an invoice exists
 */
async function validateInvoiceExists(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true },
  });

  if (!invoice) {
    throw AppError.badRequest(`Invoice not found: ${invoiceId}`);
  }
}

// ============================================
// Admin Actions
// ============================================

/**
 * Confirms a system-suggested match
 *
 * Rules:
 * - Allowed only if status is AUTO_MATCHED or NEEDS_REVIEW
 * - Sets status to CONFIRMED
 * - Keeps matched_invoice_id unchanged
 *
 * @param transactionId - UUID of the transaction
 * @param performedBy - Identifier of who performed the action
 * @returns Result with updated transaction and audit log ID
 */
export async function confirmMatch(
  transactionId: string,
  performedBy: string = 'admin'
): Promise<AdminActionResult> {
  // Fetch and validate transaction
  const transaction = await getTransactionOrThrow(transactionId);
  validateStatusTransition(transaction.status, CONFIRMABLE_STATUSES, 'confirm');

  // Execute atomic transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update transaction status
    const updatedTransaction = await tx.bankTransaction.update({
      where: { id: transactionId },
      data: { status: 'confirmed' },
    });

    // Create audit log entry
    const auditLog = await createAuditLog(
      {
        transactionId,
        action: 'confirmed',
        previousInvoiceId: transaction.matchedInvoiceId,
        newInvoiceId: transaction.matchedInvoiceId, // Unchanged
        performedBy,
      },
      tx
    );

    return { transaction: updatedTransaction, auditLogId: auditLog.id };
  });

  return {
    success: true,
    transaction: result.transaction,
    auditLogId: result.auditLogId,
  };
}

/**
 * Rejects a system-suggested match
 *
 * Rules:
 * - Allowed only if status is AUTO_MATCHED or NEEDS_REVIEW
 * - Sets status to UNMATCHED
 * - Clears matched_invoice_id
 *
 * @param transactionId - UUID of the transaction
 * @param performedBy - Identifier of who performed the action
 * @param reason - Optional reason for rejection
 * @returns Result with updated transaction and audit log ID
 */
export async function rejectMatch(
  transactionId: string,
  performedBy: string = 'admin',
  reason?: string
): Promise<AdminActionResult> {
  // Fetch and validate transaction
  const transaction = await getTransactionOrThrow(transactionId);
  validateStatusTransition(transaction.status, REJECTABLE_STATUSES, 'reject');

  // Execute atomic transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update transaction: set to unmatched and clear invoice
    const updatedTransaction = await tx.bankTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'unmatched',
        matchedInvoiceId: null,
      },
    });

    // Create audit log entry
    const auditLog = await createAuditLog(
      {
        transactionId,
        action: 'rejected',
        previousInvoiceId: transaction.matchedInvoiceId,
        newInvoiceId: null,
        performedBy,
        reason,
      },
      tx
    );

    return { transaction: updatedTransaction, auditLogId: auditLog.id };
  });

  return {
    success: true,
    transaction: result.transaction,
    auditLogId: result.auditLogId,
  };
}

/**
 * Manually matches a transaction to a specific invoice
 *
 * Rules:
 * - Allowed only if status is NEEDS_REVIEW or UNMATCHED
 * - Sets matched_invoice_id to the provided invoice
 * - Sets status to CONFIRMED
 *
 * @param transactionId - UUID of the transaction
 * @param invoiceId - UUID of the invoice to match
 * @param performedBy - Identifier of who performed the action
 * @param reason - Optional reason for manual match
 * @returns Result with updated transaction and audit log ID
 */
export async function manualMatch(
  transactionId: string,
  invoiceId: string,
  performedBy: string = 'admin',
  reason?: string
): Promise<AdminActionResult> {
  // Fetch and validate transaction
  const transaction = await getTransactionOrThrow(transactionId);
  validateStatusTransition(transaction.status, MANUAL_MATCHABLE_STATUSES, 'manually match');

  // Validate invoice exists
  await validateInvoiceExists(invoiceId);

  // Execute atomic transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update transaction: set invoice and confirm
    const updatedTransaction = await tx.bankTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'confirmed',
        matchedInvoiceId: invoiceId,
      },
    });

    // Create audit log entry
    const auditLog = await createAuditLog(
      {
        transactionId,
        action: 'manual_matched',
        previousInvoiceId: transaction.matchedInvoiceId,
        newInvoiceId: invoiceId,
        performedBy,
        reason,
      },
      tx
    );

    return { transaction: updatedTransaction, auditLogId: auditLog.id };
  });

  return {
    success: true,
    transaction: result.transaction,
    auditLogId: result.auditLogId,
  };
}

/**
 * Marks a transaction as external (no invoice in system)
 *
 * Rules:
 * - Allowed only if status is UNMATCHED
 * - Sets status to EXTERNAL
 * - Clears matched_invoice_id
 *
 * @param transactionId - UUID of the transaction
 * @param performedBy - Identifier of who performed the action
 * @param reason - Optional reason for marking as external
 * @returns Result with updated transaction and audit log ID
 */
export async function markExternal(
  transactionId: string,
  performedBy: string = 'admin',
  reason?: string
): Promise<AdminActionResult> {
  // Fetch and validate transaction
  const transaction = await getTransactionOrThrow(transactionId);
  validateStatusTransition(transaction.status, EXTERNAL_MARKABLE_STATUSES, 'mark as external');

  // Execute atomic transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update transaction: set to external and clear invoice
    const updatedTransaction = await tx.bankTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'external',
        matchedInvoiceId: null,
      },
    });

    // Create audit log entry
    const auditLog = await createAuditLog(
      {
        transactionId,
        action: 'marked_external',
        previousInvoiceId: transaction.matchedInvoiceId,
        newInvoiceId: null,
        performedBy,
        reason,
      },
      tx
    );

    return { transaction: updatedTransaction, auditLogId: auditLog.id };
  });

  return {
    success: true,
    transaction: result.transaction,
    auditLogId: result.auditLogId,
  };
}

/**
 * Bulk confirms all AUTO_MATCHED transactions in a batch
 *
 * Rules:
 * - Only transactions with status AUTO_MATCHED are affected
 * - Each transaction gets its own audit log entry
 * - Must complete in <5 seconds for 1,000 records
 *
 * @param batchId - UUID of the reconciliation batch
 * @param performedBy - Identifier of who performed the action
 * @returns Result with count and IDs of confirmed transactions
 */
export async function bulkConfirmAutoMatched(
  batchId: string,
  performedBy: string = 'admin'
): Promise<BulkConfirmResult> {
  // Verify batch exists
  const batch = await prisma.reconciliationBatch.findUnique({
    where: { id: batchId },
    select: { id: true },
  });

  if (!batch) {
    throw AppError.notFound(`Batch not found: ${batchId}`);
  }

  // Fetch all AUTO_MATCHED transactions in the batch
  const transactions = await prisma.bankTransaction.findMany({
    where: {
      uploadBatchId: batchId,
      status: 'auto_matched',
    },
    select: {
      id: true,
      matchedInvoiceId: true,
    },
  });

  if (transactions.length === 0) {
    return {
      success: true,
      confirmedCount: 0,
      transactionIds: [],
    };
  }

  const transactionIds = transactions.map((t) => t.id);

  // Execute atomic transaction for bulk update
  await prisma.$transaction(async (tx) => {
    // Bulk update all transactions to CONFIRMED
    await tx.bankTransaction.updateMany({
      where: {
        id: { in: transactionIds },
        status: 'auto_matched', // Double-check status to prevent race conditions
      },
      data: { status: 'confirmed' },
    });

    // Create audit log entries for each transaction
    const auditEntries = transactions.map((t) => ({
      transactionId: t.id,
      action: 'confirmed' as AuditActionType,
      previousInvoiceId: t.matchedInvoiceId,
      newInvoiceId: t.matchedInvoiceId, // Unchanged
      performedBy,
      reason: 'Bulk confirmation of auto-matched transactions',
    }));

    await createAuditLogsBatch(auditEntries, tx);
  });

  return {
    success: true,
    confirmedCount: transactionIds.length,
    transactionIds,
  };
}

// ============================================
// Transaction Queries
// ============================================

/**
 * Gets transactions by status for a batch
 */
export async function getTransactionsByStatus(
  batchId: string,
  status: BankTransactionStatus
): Promise<BankTransaction[]> {
  return prisma.bankTransaction.findMany({
    where: {
      uploadBatchId: batchId,
      status,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Gets transaction with related invoice details
 */
export async function getTransactionWithInvoice(transactionId: string) {
  return prisma.bankTransaction.findUnique({
    where: { id: transactionId },
    include: {
      matchedInvoice: true,
      auditLogs: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

// ============================================
// Exports
// ============================================

export const transactionService = {
  getTransaction,
  confirmMatch,
  rejectMatch,
  manualMatch,
  markExternal,
  bulkConfirmAutoMatched,
  getTransactionsByStatus,
  getTransactionWithInvoice,
};

export default transactionService;
