import { HealthCheckResponse } from '../types';
import { env } from '../config';
import { checkDatabaseHealth } from '../utils';

/**
 * Health check service
 */
export class HealthService {
  private readonly startTime: number;
  private readonly version: string;

  constructor() {
    this.startTime = Date.now();
    this.version = process.env.npm_package_version || '1.0.0';
  }

  /**
   * Get health status
   */
  getHealthStatus(): HealthCheckResponse {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      environment: env.NODE_ENV,
      version: this.version,
    };
  }

  /**
   * Check if the service is ready
   * Checks all dependencies including database
   */
  async checkReadiness(): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
    const checks: Record<string, boolean> = {
      server: true,
      database: await checkDatabaseHealth(),
    };

    const ready = Object.values(checks).every((check) => check);

    return { ready, checks };
  }
}

// Singleton instance
export const healthService = new HealthService();

export default healthService;
