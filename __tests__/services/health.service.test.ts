import { HealthService } from '../../src/services/health.service';

describe('HealthService', () => {
  let healthService: HealthService;

  beforeEach(() => {
    healthService = new HealthService();
  });

  describe('getHealthStatus', () => {
    it('should return health status with all required fields', () => {
      const status = healthService.getHealthStatus();

      expect(status).toHaveProperty('status', 'healthy');
      expect(status).toHaveProperty('timestamp');
      expect(status).toHaveProperty('uptime');
      expect(status).toHaveProperty('environment');
      expect(status).toHaveProperty('version');
    });

    it('should return a valid ISO timestamp', () => {
      const status = healthService.getHealthStatus();

      expect(new Date(status.timestamp).toISOString()).toBe(status.timestamp);
    });

    it('should return non-negative uptime', () => {
      const status = healthService.getHealthStatus();

      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return version string', () => {
      const status = healthService.getHealthStatus();

      expect(typeof status.version).toBe('string');
      expect(status.version.length).toBeGreaterThan(0);
    });
  });

  describe('checkReadiness', () => {
    it('should return readiness status', async () => {
      const result = await healthService.checkReadiness();

      expect(result).toHaveProperty('ready');
      expect(result).toHaveProperty('checks');
      expect(typeof result.ready).toBe('boolean');
    });

    it('should include server check', async () => {
      const result = await healthService.checkReadiness();

      expect(result.checks).toHaveProperty('server', true);
    });

    it('should be ready when all checks pass', async () => {
      const result = await healthService.checkReadiness();

      expect(result.ready).toBe(true);
    });
  });
});
