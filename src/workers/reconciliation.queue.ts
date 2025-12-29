import { Queue, Worker, QueueEvents, Job, ConnectionOptions } from 'bullmq';
import { logger } from '../utils';

// ============================================
// Redis Connection for BullMQ
// ============================================

const connection: ConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  // BullMQ requires maxRetriesPerRequest to be null
  maxRetriesPerRequest: null,
};

// ============================================
// Queue Definition
// ============================================

export const RECONCILIATION_QUEUE_NAME = 'reconciliation-batch-processing';

export const reconciliationQueue = new Queue(RECONCILIATION_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// ============================================
// Worker Setup
// ============================================

export function setupReconciliationWorker(
  processor: (job: Job) => Promise<void>
) {
  const worker = new Worker(RECONCILIATION_QUEUE_NAME, processor, {
    connection,
    // Control concurrency
    concurrency: 2,
    // Ensure we don't stall on long-running matches
    lockDuration: 60000, // 60 seconds
  });

  worker.on('completed', (job) => {
    logger.info(`[Job ${job.id}] Batch reconciliation completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[Job ${job?.id}] Batch reconciliation failed: ${err.message}`);
  });

  worker.on('error', (err) => {
    logger.error(`Worker error: ${err.message}`);
  });

  return worker;
}

// ============================================
// Queue Events
// ============================================

export const reconciliationQueueEvents = new QueueEvents(RECONCILIATION_QUEUE_NAME, {
  connection,
});
