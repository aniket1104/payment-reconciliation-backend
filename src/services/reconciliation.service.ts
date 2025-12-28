/**
 * Reconciliation Service for Payment Reconciliation Engine
 *
 * Handles business logic for reconciliation batches:
 * - Creating batches
 * - Fetching batch status
 * - Fetching candidate invoices for matching
 * - Updating batch counters
 *
 * This service is the orchestration layer between routes, workers, and database.
 *
 * REDIS INTEGRATION:
 * - Batch progress can optionally be read from Redis for faster UI polling
 * - PostgreSQL remains the SOURCE OF TRUTH
 * - All Redis operations fall back to database gracefully
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import type { InvoiceInput } from '../matching/types';
import { getCachedBatchProgress } from '../redis';

// ============================================
// Types
// ============================================

export interface CreateBatchParams {
  filename: string;
}

export interface BatchStatus {
  id: string;
  filename: string;
  status: string;
  totalTransactions: number;
  processedCount: number;
  autoMatchedCount: number;
  needsReviewCount: number;
  unmatchedCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  progress: number; // Percentage 0-100
}

export interface BatchCounterUpdates {
  processedCount?: number;
  autoMatchedCount?: number;
  needsReviewCount?: number;
  unmatchedCount?: number;
}

// ============================================
// Batch Management
// ============================================

/**
 * Creates a new reconciliation batch for CSV upload
 *
 * @param params - Batch creation parameters
 * @returns The created batch record
 */
export async function createBatch(params: CreateBatchParams) {
  const batch = await prisma.reconciliationBatch.create({
    data: {
      filename: params.filename,
      totalTransactions: 0,
      processedCount: 0,
      autoMatchedCount: 0,
      needsReviewCount: 0,
      unmatchedCount: 0,
      status: 'uploading',
      startedAt: new Date(),
    },
  });

  return batch;
}

/**
 * Gets the current status of a reconciliation batch
 *
 * REDIS OPTIMIZATION:
 * - For "processing" batches, tries Redis first for faster progress reads
 * - Redis provides near-real-time counters for UI polling
 * - Falls back to PostgreSQL if Redis unavailable
 * - PostgreSQL remains the SOURCE OF TRUTH
 *
 * @param batchId - UUID of the batch
 * @param preferCache - If true, prefer Redis for faster reads (default: true)
 * @returns Batch status with progress percentage
 */
export async function getBatchStatus(
  batchId: string,
  preferCache: boolean = true
): Promise<BatchStatus | null> {
  // Always fetch base batch from database (source of truth for metadata)
  const batch = await prisma.reconciliationBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    return null;
  }

  // For actively processing batches, try Redis for faster counter reads
  let processedCount = batch.processedCount;
  let autoMatchedCount = batch.autoMatchedCount;
  let needsReviewCount = batch.needsReviewCount;
  let unmatchedCount = batch.unmatchedCount;
  let totalTransactions = batch.totalTransactions;

  if (preferCache && batch.status === 'processing') {
    const cachedProgress = await getCachedBatchProgress(batchId);

    if (cachedProgress) {
      // Use cached counters (may be more up-to-date than DB during processing)
      processedCount = cachedProgress.processedCount;
      autoMatchedCount = cachedProgress.autoMatchedCount;
      needsReviewCount = cachedProgress.needsReviewCount;
      unmatchedCount = cachedProgress.unmatchedCount;

      // Use cached total if available and non-zero
      if (cachedProgress.totalTransactions > 0) {
        totalTransactions = cachedProgress.totalTransactions;
      }
    }
    // If Redis unavailable, fall through to use database values
  }

  // Calculate progress percentage
  const progress =
    totalTransactions > 0 ? Math.round((processedCount / totalTransactions) * 100) : 0;

  return {
    id: batch.id,
    filename: batch.filename,
    status: batch.status,
    totalTransactions,
    processedCount,
    autoMatchedCount,
    needsReviewCount,
    unmatchedCount,
    startedAt: batch.startedAt,
    completedAt: batch.completedAt,
    createdAt: batch.createdAt,
    progress,
  };
}

/**
 * Gets all reconciliation batches with optional filtering and pagination
 *
 * @param options - Query options
 * @returns Array of batch status objects with pagination info
 */
export async function getAllBatches(
  options: {
    status?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'createdAt' | 'updatedAt';
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{
  batches: BatchStatus[];
  total: number;
  limit: number;
  offset: number;
}> {
  const {
    status,
    limit = 20,
    offset = 0,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = options;

  // Build WHERE clause
  const where: Prisma.ReconciliationBatchWhereInput = {};
  if (status) {
    where.status = status as Prisma.EnumReconciliationBatchStatusFilter;
  }

  // Fetch batches with count
  const [batches, total] = await Promise.all([
    prisma.reconciliationBatch.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.reconciliationBatch.count({ where }),
  ]);

  // Transform to BatchStatus format
  const batchStatuses: BatchStatus[] = batches.map((batch) => {
    const progress =
      batch.totalTransactions > 0
        ? Math.round((batch.processedCount / batch.totalTransactions) * 100)
        : 0;

    return {
      id: batch.id,
      filename: batch.filename,
      status: batch.status,
      totalTransactions: batch.totalTransactions,
      processedCount: batch.processedCount,
      autoMatchedCount: batch.autoMatchedCount,
      needsReviewCount: batch.needsReviewCount,
      unmatchedCount: batch.unmatchedCount,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
      createdAt: batch.createdAt,
      progress,
    };
  });

  return {
    batches: batchStatuses,
    total,
    limit,
    offset,
  };
}

/**
 * Updates batch status to "processing"
 *
 * IMPORTANT: Resets all counters and cleans up existing transactions
 * if batch is reprocessed (e.g., after failure or testing)
 */
export async function markBatchProcessing(batchId: string) {
  // Delete existing transactions for this batch (allows reprocessing)
  await prisma.bankTransaction.deleteMany({
    where: { uploadBatchId: batchId },
  });

  // Reset batch counters and status
  return prisma.reconciliationBatch.update({
    where: { id: batchId },
    data: {
      status: 'processing',
      startedAt: new Date(),
      // Reset counters to prevent accumulation on reprocessing
      totalTransactions: 0,
      processedCount: 0,
      autoMatchedCount: 0,
      needsReviewCount: 0,
      unmatchedCount: 0,
      completedAt: null,
    },
  });
}

/**
 * Updates batch status to "completed"
 */
export async function markBatchCompleted(batchId: string) {
  return prisma.reconciliationBatch.update({
    where: { id: batchId },
    data: {
      status: 'completed',
      completedAt: new Date(),
    },
  });
}

/**
 * Updates batch status to "failed"
 */
export async function markBatchFailed(batchId: string) {
  return prisma.reconciliationBatch.update({
    where: { id: batchId },
    data: {
      status: 'failed',
      completedAt: new Date(),
    },
  });
}

/**
 * Sets the total transaction count for a batch
 */
export async function setBatchTotalTransactions(batchId: string, total: number) {
  return prisma.reconciliationBatch.update({
    where: { id: batchId },
    data: { totalTransactions: total },
  });
}

/**
 * Increments batch counters atomically
 *
 * @param batchId - UUID of the batch
 * @param updates - Counter increments
 */
export async function incrementBatchCounters(batchId: string, updates: BatchCounterUpdates) {
  const incrementData: Prisma.ReconciliationBatchUpdateInput = {};

  if (updates.processedCount) {
    incrementData.processedCount = { increment: updates.processedCount };
  }
  if (updates.autoMatchedCount) {
    incrementData.autoMatchedCount = { increment: updates.autoMatchedCount };
  }
  if (updates.needsReviewCount) {
    incrementData.needsReviewCount = { increment: updates.needsReviewCount };
  }
  if (updates.unmatchedCount) {
    incrementData.unmatchedCount = { increment: updates.unmatchedCount };
  }

  return prisma.reconciliationBatch.update({
    where: { id: batchId },
    data: incrementData,
  });
}

// ============================================
// Invoice Candidate Fetching
// ============================================

/**
 * Fetches candidate invoices for matching based on amount
 *
 * Candidates must:
 * - Have exact amount match (± $0.01)
 * - Not be in "paid" status
 *
 * @param amount - Transaction amount to match
 * @returns Array of candidate invoices suitable for matching engine
 */
export async function getCandidateInvoices(amount: number): Promise<InvoiceInput[]> {
  // Calculate tolerance range (± $0.01)
  const tolerance = 0.01;
  const minAmount = new Prisma.Decimal(amount - tolerance);
  const maxAmount = new Prisma.Decimal(amount + tolerance);

  const invoices = await prisma.invoice.findMany({
    where: {
      amount: {
        gte: minAmount,
        lte: maxAmount,
      },
      status: {
        not: 'paid',
      },
    },
    select: {
      id: true,
      invoiceNumber: true,
      customerName: true,
      dueDate: true,
    },
  });

  // Transform to InvoiceInput format for matching engine
  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerName: inv.customerName,
    dueDate: inv.dueDate,
  }));
}

// ============================================
// Bank Transaction Management
// ============================================

export interface CreateBankTransactionParams {
  uploadBatchId: string;
  transactionDate: Date;
  description: string;
  amount: number;
  referenceNumber: string | null;
  status: 'pending' | 'auto_matched' | 'needs_review' | 'unmatched';
  matchedInvoiceId: string | null;
  confidenceScore: number | null;
  matchDetails: Record<string, unknown> | null;
}

/**
 * Creates a bank transaction record
 */
export async function createBankTransaction(params: CreateBankTransactionParams) {
  return prisma.bankTransaction.create({
    data: {
      uploadBatchId: params.uploadBatchId,
      transactionDate: params.transactionDate,
      description: params.description,
      amount: new Prisma.Decimal(params.amount),
      referenceNumber: params.referenceNumber,
      status: params.status,
      matchedInvoiceId: params.matchedInvoiceId,
      confidenceScore: params.confidenceScore ? new Prisma.Decimal(params.confidenceScore) : null,
      matchDetails: params.matchDetails as Prisma.InputJsonValue,
    },
  });
}

/**
 * Creates a batch of bank transactions (for better performance)
 */
export async function createBankTransactionsBatch(transactions: CreateBankTransactionParams[]) {
  return prisma.bankTransaction.createMany({
    data: transactions.map((t) => ({
      uploadBatchId: t.uploadBatchId,
      transactionDate: t.transactionDate,
      description: t.description,
      amount: new Prisma.Decimal(t.amount),
      referenceNumber: t.referenceNumber,
      status: t.status,
      matchedInvoiceId: t.matchedInvoiceId,
      confidenceScore: t.confidenceScore ? new Prisma.Decimal(t.confidenceScore) : null,
      matchDetails: t.matchDetails as Prisma.InputJsonValue,
    })),
  });
}

/**
 * Creates an audit log entry for a match decision
 */
export async function createMatchAuditLog(params: {
  transactionId: string;
  action: 'auto_matched' | 'confirmed' | 'rejected' | 'manual_matched' | 'marked_external';
  newInvoiceId: string | null;
  performedBy: string;
  reason?: string;
}) {
  return prisma.matchAuditLog.create({
    data: {
      transactionId: params.transactionId,
      action: params.action,
      previousInvoiceId: null,
      newInvoiceId: params.newInvoiceId,
      performedBy: params.performedBy,
      reason: params.reason || null,
    },
  });
}

/**
 * Gets transactions for a batch with OFFSET pagination (DEPRECATED)
 *
 * @deprecated Use getBatchTransactionsCursor for better performance
 */
export async function getBatchTransactions(
  batchId: string,
  options: {
    page?: number;
    limit?: number;
    status?: string;
  } = {}
) {
  const page = options.page || 1;
  const limit = options.limit || 50;
  const skip = (page - 1) * limit;

  const where: Prisma.BankTransactionWhereInput = {
    uploadBatchId: batchId,
  };

  if (options.status) {
    where.status = options.status as Prisma.EnumBankTransactionStatusFilter;
  }

  const [transactions, total] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        matchedInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            customerName: true,
            amount: true,
          },
        },
      },
    }),
    prisma.bankTransaction.count({ where }),
  ]);

  return {
    transactions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ============================================
// Cursor-Based Pagination (RECOMMENDED)
// ============================================

/**
 * Cursor-based pagination parameters
 */
export interface CursorPaginationParams {
  limit: number;
  cursor?: {
    createdAt: string;
    id: string;
  };
  status?: string;
}

/**
 * Cursor-based pagination response
 */
export interface CursorPaginatedTransactions {
  data: Array<{
    id: string;
    uploadBatchId: string;
    transactionDate: Date;
    description: string;
    amount: Prisma.Decimal;
    referenceNumber: string | null;
    status: string;
    matchedInvoiceId: string | null;
    confidenceScore: Prisma.Decimal | null;
    matchDetails: Prisma.JsonValue;
    createdAt: Date;
    matchedInvoice: {
      id: string;
      invoiceNumber: string;
      customerName: string;
      amount: Prisma.Decimal;
    } | null;
  }>;
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Gets transactions for a batch using CURSOR-BASED pagination
 *
 * IMPORTANT: This is the recommended pagination method.
 * - Uses (createdAt, id) compound cursor for deterministic ordering
 * - ORDER BY created_at DESC, id DESC
 * - Never uses OFFSET (O(1) seek performance)
 * - Scales to millions of records
 *
 * @param batchId - UUID of the reconciliation batch
 * @param params - Cursor pagination parameters
 * @returns Paginated transactions with nextCursor
 */
export async function getBatchTransactionsCursor(
  batchId: string,
  params: CursorPaginationParams
): Promise<CursorPaginatedTransactions> {
  const { limit, cursor, status } = params;

  // Build WHERE clause
  const where: Prisma.BankTransactionWhereInput = {
    uploadBatchId: batchId,
  };

  // Add status filter
  if (status) {
    where.status = status as Prisma.EnumBankTransactionStatusFilter;
  }

  // Add cursor condition for pagination
  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);

    // Compound cursor: (created_at < cursor) OR (created_at = cursor AND id < cursor.id)
    where.OR = [
      { createdAt: { lt: cursorDate } },
      {
        AND: [{ createdAt: cursorDate }, { id: { lt: cursor.id } }],
      },
    ];
  }

  // Fetch limit + 1 to check if more records exist
  const transactions = await prisma.bankTransaction.findMany({
    where,
    take: limit + 1,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      matchedInvoice: {
        select: {
          id: true,
          invoiceNumber: true,
          customerName: true,
          amount: true,
        },
      },
    },
  });

  // Check if more records exist
  const hasMore = transactions.length > limit;

  // Trim to requested limit
  const data = hasMore ? transactions.slice(0, limit) : transactions;

  // Generate next cursor from last record
  let nextCursor: string | undefined;
  if (hasMore && data.length > 0) {
    const lastRecord = data[data.length - 1];
    const cursorData = {
      createdAt: lastRecord.createdAt.toISOString(),
      id: lastRecord.id,
    };
    nextCursor = Buffer.from(JSON.stringify(cursorData), 'utf-8').toString('base64url');
  }

  return {
    data,
    nextCursor,
    hasMore,
  };
}

// Export all functions
export const reconciliationService = {
  createBatch,
  getBatchStatus,
  getAllBatches,
  markBatchProcessing,
  markBatchCompleted,
  markBatchFailed,
  setBatchTotalTransactions,
  incrementBatchCounters,
  getCandidateInvoices,
  createBankTransaction,
  createBankTransactionsBatch,
  createMatchAuditLog,
  getBatchTransactions,
  getBatchTransactionsCursor,
};

export default reconciliationService;
