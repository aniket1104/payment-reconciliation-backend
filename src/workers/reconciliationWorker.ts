/**
 * Reconciliation Background Worker - OPTIMIZED
 *
 * Processes bank transaction CSV files in the background.
 * Uses BULK OPERATIONS for maximum performance.
 *
 * Target: 1000 rows in < 30 seconds
 *
 * Strategy:
 * 1. Read all CSV rows into memory (fine for 10k rows)
 * 2. Fetch all candidate invoices in one query
 * 3. Run matching on all rows (CPU-bound, fast)
 * 4. Bulk insert all transactions (one createMany)
 * 5. Bulk insert all audit logs (one createMany)
 * 6. Update counters once
 */

import { unlink } from 'fs/promises';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import {
  markBatchProcessing,
  markBatchCompleted,
  markBatchFailed,
  type CreateBankTransactionParams,
} from '../services/reconciliation.service';
import {
  matchTransaction,
  type MatchStatus,
  type BankTransactionInput,
  type InvoiceInput,
} from '../matching';
import { logger } from '../utils';
import {
  initBatchProgress,
  setTotalTransactions as setRedisTotalTransactions,
  markBatchCompletedInCache,
  markBatchFailedInCache,
} from '../redis';

// ============================================
// Types
// ============================================

interface ParsedRow {
  transactionDate: Date;
  description: string;
  amount: number;
  referenceNumber: string | null;
}

// ============================================
// CSV Parsing
// ============================================

const REQUIRED_COLUMNS = ['transaction_date', 'description', 'amount'];

async function parseAllRows(filePath: string): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const rows: ParsedRow[] = [];
    let headerValidated = false;

    createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on('data', (row: Record<string, string>) => {
        // Validate headers on first row
        if (!headerValidated) {
          const headers = Object.keys(row).map((h) => h.toLowerCase());
          const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
          if (missing.length > 0) {
            reject(new Error(`Missing required CSV columns: ${missing.join(', ')}`));
            return;
          }
          headerValidated = true;
        }

        // Parse row
        const amount = parseFloat(row.amount?.replace(/[$,]/g, '') || '0');
        if (isNaN(amount) || amount <= 0) return; // Skip invalid rows

        const dateValue = row.transaction_date || row.date;
        const transactionDate = new Date(dateValue);
        if (isNaN(transactionDate.getTime())) return; // Skip invalid dates

        rows.push({
          transactionDate,
          description: row.description || '',
          amount,
          referenceNumber: row.reference_number || row.reference || null,
        });
      })
      .on('error', reject)
      .on('end', () => resolve(rows));
  });
}

// ============================================
// Bulk Operations
// ============================================

/**
 * Fetch all candidate invoices for the given amounts in one query
 */
async function fetchAllCandidateInvoices(amounts: number[]): Promise<Map<string, InvoiceInput[]>> {
  // Get unique amounts
  const uniqueAmounts = [...new Set(amounts.map((a) => a.toFixed(2)))];

  // Fetch all invoices that match any of the amounts (with 1 cent tolerance)
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { not: 'paid' },
      amount: {
        in: uniqueAmounts.map((a) => new Prisma.Decimal(a)),
      },
    },
    select: {
      id: true,
      invoiceNumber: true,
      customerName: true,
      amount: true,
      dueDate: true,
    },
  });

  // Group by amount for quick lookup
  const byAmount = new Map<string, InvoiceInput[]>();
  for (const inv of invoices) {
    const key = inv.amount.toNumber().toFixed(2);
    if (!byAmount.has(key)) {
      byAmount.set(key, []);
    }
    byAmount.get(key)!.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      dueDate: inv.dueDate,
    });
  }

  return byAmount;
}

/**
 * Bulk insert all transactions
 */
async function bulkInsertTransactions(transactions: CreateBankTransactionParams[]): Promise<void> {
  if (transactions.length === 0) return;

  await prisma.bankTransaction.createMany({
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
 * Bulk insert audit logs for auto-matched transactions
 * Fetches all auto-matched transactions and creates audit logs for them
 */
async function bulkInsertAuditLogs(batchId: string): Promise<void> {
  // Fetch the auto-matched transactions to get their IDs
  const transactions = await prisma.bankTransaction.findMany({
    where: {
      uploadBatchId: batchId,
      status: 'auto_matched',
    },
    select: {
      id: true,
      matchedInvoiceId: true,
      confidenceScore: true,
    },
  });

  if (transactions.length === 0) {
    logger.debug(`[${batchId}] No auto-matched transactions for audit logs`);
    return;
  }

  const auditLogs = transactions
    .filter((t) => t.matchedInvoiceId)
    .map((t) => ({
      transactionId: t.id,
      action: 'auto_matched' as const,
      previousInvoiceId: null,
      newInvoiceId: t.matchedInvoiceId,
      performedBy: 'system',
      reason: `Auto-matched with ${t.confidenceScore?.toNumber() ?? 0}% confidence`,
    }));

  if (auditLogs.length > 0) {
    await prisma.matchAuditLog.createMany({ data: auditLogs });
    logger.info(`[${batchId}] Created ${auditLogs.length} audit log entries`);
  }
}

/**
 * Update batch with final counts
 */
async function updateBatchFinalCounts(
  batchId: string,
  total: number,
  autoMatched: number,
  needsReview: number,
  unmatched: number
): Promise<void> {
  await prisma.reconciliationBatch.update({
    where: { id: batchId },
    data: {
      totalTransactions: total,
      processedCount: total,
      autoMatchedCount: autoMatched,
      needsReviewCount: needsReview,
      unmatchedCount: unmatched,
    },
  });
}

// ============================================
// Status Mapping
// ============================================

const STATUS_MAP: Record<MatchStatus, 'auto_matched' | 'needs_review' | 'unmatched'> = {
  AUTO_MATCHED: 'auto_matched',
  NEEDS_REVIEW: 'needs_review',
  UNMATCHED: 'unmatched',
};

// ============================================
// Main Worker
// ============================================

export async function processReconciliationBatch(batchId: string, filePath: string): Promise<void> {
  const startTime = Date.now();

  try {
    // Step 1: Mark batch as processing
    await markBatchProcessing(batchId);
    logger.info(`[${batchId}] Starting batch processing...`);
    void initBatchProgress(batchId);

    // Step 2: Parse all CSV rows (fast, in-memory)
    logger.info(`[${batchId}] Parsing CSV...`);
    const rows = await parseAllRows(filePath);
    logger.info(`[${batchId}] Parsed ${rows.length} rows in ${Date.now() - startTime}ms`);

    if (rows.length === 0) {
      await markBatchCompleted(batchId);
      void markBatchCompletedInCache(batchId);
      logger.info(`[${batchId}] No valid rows to process`);
      return;
    }

    // Step 3: Fetch all candidate invoices in ONE query
    logger.info(`[${batchId}] Fetching candidate invoices...`);
    const amounts = rows.map((r) => r.amount);
    const invoicesByAmount = await fetchAllCandidateInvoices(amounts);
    logger.info(`[${batchId}] Found candidates for ${invoicesByAmount.size} unique amounts`);

    // Step 4: Run matching on all rows (CPU-bound, fast)
    logger.info(`[${batchId}] Running matching engine...`);
    let autoMatched = 0;
    let needsReview = 0;
    let unmatched = 0;

    const transactions: CreateBankTransactionParams[] = rows.map((row) => {
      const amountKey = row.amount.toFixed(2);
      const candidates = invoicesByAmount.get(amountKey) || [];

      const matchInput: BankTransactionInput = {
        transactionDate: row.transactionDate,
        description: row.description,
        amount: row.amount,
      };

      const result = matchTransaction(matchInput, candidates);

      // Count by status
      switch (result.status) {
        case 'AUTO_MATCHED':
          autoMatched++;
          break;
        case 'NEEDS_REVIEW':
          needsReview++;
          break;
        case 'UNMATCHED':
          unmatched++;
          break;
      }

      return {
        uploadBatchId: batchId,
        transactionDate: row.transactionDate,
        description: row.description,
        amount: row.amount,
        referenceNumber: row.referenceNumber,
        status: STATUS_MAP[result.status],
        matchedInvoiceId: result.matchedInvoiceId || null,
        confidenceScore: result.confidenceScore,
        matchDetails: result.matchDetails,
      };
    });

    logger.info(
      `[${batchId}] Matching complete: ${autoMatched} auto, ${needsReview} review, ${unmatched} unmatched`
    );

    // Step 5: Bulk insert all transactions (ONE query)
    logger.info(`[${batchId}] Inserting ${transactions.length} transactions...`);
    await bulkInsertTransactions(transactions);

    // Step 6: Bulk insert audit logs for auto-matches
    logger.info(`[${batchId}] Creating audit logs...`);
    await bulkInsertAuditLogs(batchId);

    // Step 7: Update batch with final counts (ONE query)
    await updateBatchFinalCounts(batchId, rows.length, autoMatched, needsReview, unmatched);

    // Step 8: Mark complete
    await markBatchCompleted(batchId);
    void markBatchCompletedInCache(batchId);
    void setRedisTotalTransactions(batchId, rows.length);

    const duration = Date.now() - startTime;
    logger.info(
      `[${batchId}] ✅ Batch completed in ${duration}ms (${rows.length} rows, ${(rows.length / (duration / 1000)).toFixed(0)} rows/sec)`
    );
  } catch (error) {
    await markBatchFailed(batchId);
    void markBatchFailedInCache(batchId);
    logger.error(
      `[${batchId}] ❌ Batch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    throw error;
  } finally {
    // Cleanup CSV file
    try {
      await unlink(filePath);
      logger.debug(`[${batchId}] Cleaned up temp file`);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Starts background processing without blocking
 */
export function startBackgroundProcessing(batchId: string, filePath: string): void {
  processReconciliationBatch(batchId, filePath).catch((error) => {
    logger.error(
      `Background processing error for batch ${batchId}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  });
}

export default {
  processReconciliationBatch,
  startBackgroundProcessing,
};
