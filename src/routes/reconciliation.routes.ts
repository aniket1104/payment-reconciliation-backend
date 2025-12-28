/**
 * Reconciliation API Routes
 *
 * Endpoints for CSV upload and batch status tracking.
 * These routes handle HTTP concerns only - business logic is delegated to services.
 *
 * Endpoints:
 * - POST /upload - Upload bank transactions CSV
 * - GET /:batchId - Get batch status and progress
 * - GET /:batchId/transactions - Get transactions in a batch (CURSOR-BASED)
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { asyncHandler, sendSuccess, AppError, Logging } from '../utils';
import {
  createBatch,
  getBatchStatus,
  getAllBatches,
  getBatchTransactionsCursor,
} from '../services/reconciliation.service';
import { startBackgroundProcessing } from '../workers/reconciliationWorker';
import { validateLimit, decodeCursor } from '../services/pagination.service';

const router = Router();

// ============================================
// Multer Configuration
// ============================================

// Ensure uploads directory exists
const UPLOADS_DIR = join(process.cwd(), 'uploads');
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Multer storage configuration
 * Files are stored temporarily on disk to enable streaming
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const extension = file.originalname.split('.').pop() || 'csv';
    cb(null, `bank_transactions_${uniqueSuffix}.${extension}`);
  },
});

/**
 * File filter to only accept CSV files
 */
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Accept only CSV files
  const allowedMimeTypes = ['text/csv', 'application/csv', 'text/plain'];
  const allowedExtensions = ['.csv'];

  const mimeTypeOk = allowedMimeTypes.includes(file.mimetype);
  const extensionOk = allowedExtensions.some((ext) =>
    file.originalname.toLowerCase().endsWith(ext)
  );

  if (mimeTypeOk || extensionOk) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'));
  }
};

/**
 * Multer upload middleware
 * - Single file upload
 * - Max file size: 50MB
 * - CSV files only
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

// ============================================
// Routes
// ============================================

/**
 * @route   GET /api/reconciliation
 * @desc    Get all reconciliation batches with their details
 * @access  Public (should be protected in production)
 *
 * Query params:
 * - status: string (optional filter: uploading, processing, completed, failed)
 * - limit: number (default: 20, max: 100)
 * - offset: number (default: 0)
 * - sortBy: string (createdAt or updatedAt, default: createdAt)
 * - sortOrder: string (asc or desc, default: desc)
 *
 * Response:
 * - 200 OK: { batches: [], total: number, limit: number, offset: number }
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const {
      status,
      limit: limitParam,
      offset: offsetParam,
      sortBy,
      sortOrder,
    } = req.query;

    // Parse and validate limit
    let limit = 20;
    if (limitParam) {
      const parsed = parseInt(limitParam as string, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 100); // Max 100
      }
    }

    // Parse offset
    let offset = 0;
    if (offsetParam) {
      const parsed = parseInt(offsetParam as string, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        offset = parsed;
      }
    }

    // Validate status if provided
    const validStatuses = ['uploading', 'processing', 'completed', 'failed'];
    if (status && typeof status === 'string' && !validStatuses.includes(status)) {
      throw AppError.badRequest(
        `Invalid status filter. Allowed values: ${validStatuses.join(', ')}`
      );
    }

    // Validate sortBy
    const validSortBy = ['createdAt', 'updatedAt'];
    const sortByValue = sortBy as string || 'createdAt';
    if (!validSortBy.includes(sortByValue)) {
      throw AppError.badRequest(
        `Invalid sortBy. Allowed values: ${validSortBy.join(', ')}`
      );
    }

    // Validate sortOrder
    const validSortOrder = ['asc', 'desc'];
    const sortOrderValue = (sortOrder as string || 'desc').toLowerCase();
    if (!validSortOrder.includes(sortOrderValue)) {
      throw AppError.badRequest(
        `Invalid sortOrder. Allowed values: ${validSortOrder.join(', ')}`
      );
    }

    const result = await getAllBatches({
      status: status as string | undefined,
      limit,
      offset,
      sortBy: sortByValue as 'createdAt' | 'updatedAt',
      sortOrder: sortOrderValue as 'asc' | 'desc',
    });

    sendSuccess(
      res,
      result,
      `Retrieved ${result.batches.length} of ${result.total} batches`
    );
  })
);

/**
 * @route   POST /api/reconciliation/upload
 * @desc    Upload bank transactions CSV for reconciliation
 * @access  Public (should be protected in production)
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Field name: "file"
 * - File type: CSV
 *
 * Response:
 * - 200 OK: { batchId: string }
 * - 400 Bad Request: Invalid file
 */
router.post(
  '/upload',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Log incoming request
    Logging.info('📥 CSV Upload request received');

    // Validate file was uploaded
    if (!req.file) {
      Logging.warn('❌ Upload rejected: No file provided');
      throw AppError.badRequest('No file uploaded. Please upload a CSV file.');
    }

    const { originalname, path: filePath, size } = req.file;

    // Log upload details
    Logging.success(`📄 File received: ${originalname}`);
    Logging.info(`   Size: ${(size / 1024).toFixed(2)} KB`);
    Logging.info(`   Stored at: ${filePath}`);

    // Create batch record
    const batch = await createBatch({
      filename: originalname,
    });

    Logging.success(`✅ Batch created: ${batch.id}`);

    // Start background processing (non-blocking)
    startBackgroundProcessing(batch.id, filePath);
    Logging.info(`🚀 Background processing started for batch: ${batch.id}`);

    // Return immediately with batch ID
    sendSuccess(
      res,
      { batchId: batch.id },
      'File uploaded successfully. Processing started.',
      202 // Accepted
    );
  })
);

/**
 * @route   GET /api/reconciliation/:batchId
 * @desc    Get reconciliation batch status and progress
 * @access  Public (should be protected in production)
 *
 * Response:
 * - 200 OK: BatchStatus object
 * - 404 Not Found: Batch not found
 */
router.get(
  '/:batchId',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { batchId } = req.params;

    // Validate UUID format (basic check)
    if (!batchId || batchId.length < 10) {
      throw AppError.badRequest('Invalid batch ID');
    }

    const status = await getBatchStatus(batchId);

    if (!status) {
      throw AppError.notFound('Reconciliation batch not found');
    }

    sendSuccess(res, status, 'Batch status retrieved');
  })
);

/**
 * @route   GET /api/reconciliation/:batchId/transactions
 * @desc    Get transactions in a reconciliation batch using CURSOR-BASED pagination
 * @access  Public (should be protected in production)
 *
 * Query params:
 * - limit: number (default: 50, max: 100)
 * - cursor: string (optional, Base64-encoded cursor from previous response)
 * - status: string (optional filter: auto_matched, needs_review, unmatched, confirmed, external)
 *
 * IMPORTANT: Uses cursor-based pagination for efficiency.
 * NEVER uses OFFSET pagination.
 *
 * Response:
 * - 200 OK: { data: [], nextCursor?: string, hasMore: boolean }
 * - 400 Bad Request: Invalid cursor
 * - 404 Not Found: Batch not found
 */
router.get(
  '/:batchId/transactions',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { batchId } = req.params;
    const { limit: limitParam, cursor: cursorParam, status } = req.query;

    // Validate batch exists
    const batchStatus = await getBatchStatus(batchId);
    if (!batchStatus) {
      throw AppError.notFound('Reconciliation batch not found');
    }

    // Parse and validate limit (clamp to max)
    const limit = validateLimit(limitParam as string | undefined);

    // Parse and validate cursor
    let cursor: { createdAt: string; id: string } | undefined;
    if (cursorParam && typeof cursorParam === 'string') {
      cursor = decodeCursor(cursorParam);
    }

    // Validate status if provided
    const validStatuses = [
      'auto_matched',
      'needs_review',
      'unmatched',
      'confirmed',
      'external',
      'pending',
    ];
    if (status && typeof status === 'string' && !validStatuses.includes(status)) {
      throw AppError.badRequest(
        `Invalid status filter. Allowed values: ${validStatuses.join(', ')}`
      );
    }

    // Fetch transactions with cursor-based pagination
    const result = await getBatchTransactionsCursor(batchId, {
      limit,
      cursor,
      status: status as string | undefined,
    });

    sendSuccess(res, result, 'Transactions retrieved');
  })
);

/**
 * @route   GET /api/reconciliation/:batchId/summary
 * @desc    Get summary statistics for a batch
 * @access  Public (should be protected in production)
 */
router.get(
  '/:batchId/summary',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { batchId } = req.params;

    const status = await getBatchStatus(batchId);

    if (!status) {
      throw AppError.notFound('Reconciliation batch not found');
    }

    // Calculate timing metrics
    const durationMs =
      status.completedAt && status.startedAt
        ? new Date(status.completedAt).getTime() - new Date(status.startedAt).getTime()
        : null;

    const rowsPerSecond =
      durationMs && durationMs > 0 && status.processedCount > 0
        ? Math.round((status.processedCount / (durationMs / 1000)) * 100) / 100
        : null;

    // Format duration as human-readable string
    const formatDuration = (ms: number | null): string | null => {
      if (ms === null) return null;
      if (ms < 1000) return `${ms}ms`;
      const seconds = ms / 1000;
      if (seconds < 60) return `${seconds.toFixed(2)}s`;
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = (seconds % 60).toFixed(1);
      return `${minutes}m ${remainingSeconds}s`;
    };

    const summary = {
      batchId: status.id,
      filename: status.filename,
      status: status.status,
      progress: status.progress,
      statistics: {
        total: status.totalTransactions,
        processed: status.processedCount,
        autoMatched: status.autoMatchedCount,
        needsReview: status.needsReviewCount,
        unmatched: status.unmatchedCount,
      },
      rates: {
        autoMatchRate:
          status.processedCount > 0
            ? Math.round((status.autoMatchedCount / status.processedCount) * 100)
            : 0,
        needsReviewRate:
          status.processedCount > 0
            ? Math.round((status.needsReviewCount / status.processedCount) * 100)
            : 0,
        unmatchedRate:
          status.processedCount > 0
            ? Math.round((status.unmatchedCount / status.processedCount) * 100)
            : 0,
      },
      timing: {
        startedAt: status.startedAt,
        completedAt: status.completedAt,
        durationMs,
        durationFormatted: formatDuration(durationMs),
        rowsPerSecond,
      },
    };

    sendSuccess(res, summary, 'Batch summary retrieved');
  })
);

export default router;
