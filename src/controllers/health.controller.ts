import { Request, Response } from 'express';
import { healthService } from '../services';
import { sendSuccess, sendError, asyncHandler } from '../utils';

/**
 * Health check controller
 */
export class HealthController {
  /**
   * GET /health
   * Basic health check endpoint
   */
  getHealth = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const health = healthService.getHealthStatus();
    sendSuccess(res, health, 'Service is healthy');
  });

  /**
   * GET /health/ready
   * Readiness check endpoint (checks dependencies)
   */
  getReadiness = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const { ready, checks } = await healthService.checkReadiness();

    if (ready) {
      sendSuccess(res, { ready, checks }, 'Service is ready');
    } else {
      sendError(res, 'Service is not ready', 503);
    }
  });

  /**
   * GET /health/live
   * Liveness check endpoint
   */
  getLiveness = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    sendSuccess(res, { alive: true }, 'Service is alive');
  });
}

export const healthController = new HealthController();

export default healthController;
