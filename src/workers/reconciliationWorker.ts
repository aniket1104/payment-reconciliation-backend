/**
 * Reconciliation Background Worker - GOLDEN STANDARD
 *
 * Processes bank transaction CSV files in the background using:
 * 1. STREAMING - To handle files with millions of rows without memory issues.
 * 2. CHUNKING - To process and save in batches (e.g., 1000 rows at a time).
 * 3. PERSISTENCE - Managed by BullMQ for reliability and retries.
 */

import { unlink } from 'fs/promises';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { prisma } from '../utils/prisma';
import {
  markBatchProcessing,
  markBatchCompleted,
  markBatchFailed,
} from '../services/reconciliation.service';
import {
  matchTransaction,
  type BankTransactionInput,
  type InvoiceInput,
} from '../matching';
import { logger } from '../utils';
import {
  initBatchProgress,
  updateBatchProgress,
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

interface BatchStats {
  total: number;
  autoMatched: number;
  needsReview: number;
  unmatched: number;
}

// ============================================
// Constants
// ============================================

const REQUIRED_COLUMNS = ['transaction_date', 'description', 'amount'];
const CHUNK_SIZE = 1000;

// ============================================
// Helper Functions
// ============================================

/**
 * Fetch all candidate invoices for the given amounts in one query for a chunk
 */
async function fetchCandidateInvoicesForChunk(amounts: number[]): Promise<Map<string, InvoiceInput[]>> {
  const uniqueAmounts = [...new Set(amounts.map((a) => a.toFixed(2)))];

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
 * Persist a processed chunk to the database
 */
async function saveProcessedChunk(
  batchId: string,
  rows: ParsedRow[],
  invoicesByAmount: Map<string, InvoiceInput[]>,
  stats: BatchStats
): Promise<void> {
  const transactionsData: Prisma.BankTransactionCreateManyInput[] = [];

  for (const row of rows) {
    const amountKey = row.amount.toFixed(2);
    const candidates = invoicesByAmount.get(amountKey) || [];

    const matchInput: BankTransactionInput = {
      transactionDate: row.transactionDate,
      description: row.description,
      amount: row.amount,
    };

    const result = matchTransaction(matchInput, candidates);

    // Update ongoing stats
    if (result.status === 'AUTO_MATCHED') stats.autoMatched++;
    else if (result.status === 'NEEDS_REVIEW') stats.needsReview++;
    else stats.unmatched++;

    transactionsData.push({
      uploadBatchId: batchId,
      transactionDate: row.transactionDate,
      description: row.description,
      amount: new Prisma.Decimal(row.amount),
      referenceNumber: row.referenceNumber,
      status: result.status.toLowerCase() as 'auto_matched' | 'needs_review' | 'unmatched',
      matchedInvoiceId: result.matchedInvoiceId || null,
      confidenceScore: result.confidenceScore ? new Prisma.Decimal(result.confidenceScore) : null,
      matchDetails: result.matchDetails as any as Prisma.InputJsonValue,
    });
  }

  // 1. Bulk insert transactions
  await prisma.bankTransaction.createMany({ data: transactionsData });

  // 2. We skip bulk audit logs in chunks to keep it fast, 
  // but a more robust system would do them too or do it via DB triggers.
  // For now, we'll focus on the primary transactions.
}

// ============================================
// Main Worker Job Handler
// ============================================

export async function processReconciliationJob(job: Job): Promise<void> {
  const { batchId, filePath } = job.data;
  const startTime = Date.now();

  const stats: BatchStats = {
    total: 0,
    autoMatched: 0,
    needsReview: 0,
    unmatched: 0,
  };

  try {
    await markBatchProcessing(batchId);
    logger.info(`[${batchId}] Starting job ${job?.id || 'direct'} for file ${filePath}`);
    void initBatchProgress(batchId);

    // Use a stream to parse CSV and process in chunks
    const parser = createReadStream(filePath).pipe(
      parse({ columns: true, skip_empty_lines: true, trim: true })
    );

    let currentChunk: ParsedRow[] = [];
    let headerValidated = false;

    for await (const row of parser) {
      // Validate headers once
      if (!headerValidated) {
        const headers = Object.keys(row).map((h) => h.toLowerCase());
        const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
        if (missing.length > 0) {
          throw new Error(`Missing required CSV columns: ${missing.join(', ')}`);
        }
        headerValidated = true;
      }

      // Parse and validate row
      const amount = parseFloat(row.amount?.replace(/[$,]/g, '') || '0');
      const transactionDate = new Date(row.transaction_date || row.date);

      if (!isNaN(amount) && amount > 0 && !isNaN(transactionDate.getTime())) {
        currentChunk.push({
          transactionDate,
          description: row.description || '',
          amount,
          referenceNumber: row.reference_number || row.reference || null,
        });
        stats.total++;
      }

      // Process chunk if full
      if (currentChunk.length >= CHUNK_SIZE) {
        const chunkAmounts = currentChunk.map((r) => r.amount);
        const candidates = await fetchCandidateInvoicesForChunk(chunkAmounts);
        await saveProcessedChunk(batchId, currentChunk, candidates, stats);
        
        // Update progress in Redis for frontend
        void updateBatchProgress(batchId, stats.total);
        if (job) {
          await job.updateProgress(Math.min(99, Math.floor((stats.total / (stats.total + 100)) * 100))); // Rough estimate
        }
        
        currentChunk = [];
      }
    }

    // Process final remaining chunk
    if (currentChunk.length > 0) {
      const chunkAmounts = currentChunk.map((r) => r.amount);
      const candidates = await fetchCandidateInvoicesForChunk(chunkAmounts);
      await saveProcessedChunk(batchId, currentChunk, candidates, stats);
    }

    // Update final counts in DB
    await prisma.reconciliationBatch.update({
      where: { id: batchId },
      data: {
        totalTransactions: stats.total,
        processedCount: stats.total,
        autoMatchedCount: stats.autoMatched,
        needsReviewCount: stats.needsReview,
        unmatchedCount: stats.unmatched,
      },
    });

    await markBatchCompleted(batchId);
    void markBatchCompletedInCache(batchId);

    const duration = Date.now() - startTime;
    logger.info(
      `[${batchId}] ✅ Job ${job?.id || 'direct'} complete: ${stats.total} rows in ${duration}ms`
    );
  } catch (error) {
    await markBatchFailed(batchId);
    void markBatchFailedInCache(batchId);
    logger.error(`[${batchId}] ❌ Job ${job?.id || 'direct'} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  } finally {
    // Always cleanup temp file
    try {
      await unlink(filePath);
      logger.debug(`[${batchId}] Cleaned up temp file`);
    } catch {
      // Ignore
    }
  }
}

/**
 * LEGACY - Keep for compatibility but recommended to use queue.add directly
 */
export async function processReconciliationBatch(batchId: string, filePath: string): Promise<void> {
  // We'll wrap this into a "mock" job if called directly, but preferred to go through queue
  return processReconciliationJob({ data: { batchId, filePath }, id: 'manual' } as Job);
}

export default {
  processReconciliationJob,
  processReconciliationBatch,
};
