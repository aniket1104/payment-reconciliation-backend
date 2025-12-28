/**
 * Audit Service for Payment Reconciliation Engine
 *
 * Handles immutable audit log creation for all admin actions.
 *
 * CRITICAL BUSINESS RULES:
 * - Every admin action MUST create an audit log entry
 * - Audit logs are IMMUTABLE - never update or delete
 * - "system" for automated matches, "admin" for user actions
 * - Provides complete audit trail for compliance
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';

// ============================================
// Types
// ============================================

/**
 * Audit action types matching the AuditAction enum in Prisma schema
 */
export type AuditActionType =
  | 'auto_matched'
  | 'confirmed'
  | 'rejected'
  | 'manual_matched'
  | 'marked_external';

/**
 * Parameters for creating an audit log entry
 */
export interface CreateAuditLogParams {
  transactionId: string;
  action: AuditActionType;
  previousInvoiceId: string | null;
  newInvoiceId: string | null;
  performedBy: string;
  reason?: string;
}

/**
 * Audit log entry as returned from database
 */
export interface AuditLogEntry {
  id: string;
  transactionId: string;
  action: string;
  previousInvoiceId: string | null;
  newInvoiceId: string | null;
  performedBy: string;
  reason: string | null;
  createdAt: Date;
}

// ============================================
// Audit Log Creation
// ============================================

/**
 * Creates an immutable audit log entry
 *
 * This function is designed to be used within a Prisma transaction
 * to ensure atomicity with the related transaction update.
 *
 * @param params - Audit log parameters
 * @param tx - Optional Prisma transaction client
 * @returns The created audit log entry
 */
export async function createAuditLog(
  params: CreateAuditLogParams,
  tx?: Prisma.TransactionClient
): Promise<AuditLogEntry> {
  const client = tx || prisma;

  const auditLog = await client.matchAuditLog.create({
    data: {
      transactionId: params.transactionId,
      action: params.action,
      previousInvoiceId: params.previousInvoiceId,
      newInvoiceId: params.newInvoiceId,
      performedBy: params.performedBy,
      reason: params.reason || null,
    },
  });

  return auditLog;
}

/**
 * Creates multiple audit log entries in a single operation
 *
 * Used for bulk operations like bulk-confirm to ensure
 * every affected transaction gets its own audit entry.
 *
 * @param entries - Array of audit log parameters
 * @param tx - Optional Prisma transaction client
 * @returns Count of created entries
 */
export async function createAuditLogsBatch(
  entries: CreateAuditLogParams[],
  tx?: Prisma.TransactionClient
): Promise<number> {
  const client = tx || prisma;

  const result = await client.matchAuditLog.createMany({
    data: entries.map((entry) => ({
      transactionId: entry.transactionId,
      action: entry.action,
      previousInvoiceId: entry.previousInvoiceId,
      newInvoiceId: entry.newInvoiceId,
      performedBy: entry.performedBy,
      reason: entry.reason || null,
    })),
  });

  return result.count;
}

// ============================================
// Audit Log Retrieval
// ============================================

/**
 * Gets all audit log entries for a transaction
 *
 * @param transactionId - UUID of the bank transaction
 * @returns Array of audit log entries, newest first
 */
export async function getAuditLogsForTransaction(transactionId: string): Promise<AuditLogEntry[]> {
  const logs = await prisma.matchAuditLog.findMany({
    where: { transactionId },
    orderBy: { createdAt: 'desc' },
  });

  return logs;
}

/**
 * Gets audit log entries for a batch of transactions
 *
 * @param batchId - UUID of the reconciliation batch
 * @returns Array of audit log entries
 */
export async function getAuditLogsForBatch(batchId: string): Promise<AuditLogEntry[]> {
  const logs = await prisma.matchAuditLog.findMany({
    where: {
      transaction: {
        uploadBatchId: batchId,
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      transaction: {
        select: {
          id: true,
          description: true,
          amount: true,
        },
      },
    },
  });

  return logs;
}

// ============================================
// Exports
// ============================================

export const auditService = {
  createAuditLog,
  createAuditLogsBatch,
  getAuditLogsForTransaction,
  getAuditLogsForBatch,
};

export default auditService;
