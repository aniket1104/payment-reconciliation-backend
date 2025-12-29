import { createApp } from './app';
import { env } from './config';
import { logger, Logging, connectDatabase, disconnectDatabase } from './utils';
import { disconnectRedis, getRedisClient } from './redis';
import { setupReconciliationWorker } from './workers/reconciliation.queue';
import { processReconciliationJob } from './workers/reconciliationWorker';

/**
 * Start the server
 */
const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();

    // Trigger Redis connection (for early logging and availability check)
    getRedisClient();

    // Setup background workers
    const worker = setupReconciliationWorker(processReconciliationJob);
    logger.info('👷 Reconciliation worker initialized');

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      Logging.box('🚀 SCANPAY BACKEND', `Server started in ${env.NODE_ENV} mode`);
      Logging.success(`Server listening on http://${env.HOST}:${env.PORT}`);
      Logging.info(`API available at http://${env.HOST}:${env.PORT}${env.API_PREFIX}`);
      Logging.info(`Health check at http://${env.HOST}:${env.PORT}${env.API_PREFIX}/health`);
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`\n${signal} received. Starting graceful shutdown...`);

      server.close(async (err) => {
        if (err) {
          logger.error('Error during server shutdown:', err);
          process.exit(1);
        }

        // Disconnect from Redis (optional - gracefully handle if unavailable)
        await disconnectRedis();

        // Close BullMQ worker
        await worker.close();

        // Disconnect from database
        await disconnectDatabase();

        logger.info('Server closed successfully');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle termination signals
    process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (err: Error) => {
      logger.error('Uncaught Exception:', err);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled Rejection:', reason);
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start server
void startServer();
